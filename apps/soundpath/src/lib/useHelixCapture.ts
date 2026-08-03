"use client";

/**
 * Live capture off the Helix, shared by the bench and the setlist recorder.
 *
 * One implementation on purpose: the constraints below are the difference
 * between a loudness reading and a fiction, and a second copy would drift from
 * this one exactly when it mattered.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 30 s at 48k stereo ≈ 11 MB — enough for any chord, bounded for the tab. */
export const MAX_TAKE_SEC = 30;

// Inline AudioWorklet as a Blob URL: no public/ file, no basePath coupling. It
// reports a peak ~20×/s always and posts raw frames only while recording —
// pushing every render quantum into React would be 375 messages a second for a
// meter that can't show them.
const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rec = false;
    this.peak = 0;
    this.since = 0;
    this.port.onmessage = (e) => { this.rec = !!e.data.record; };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    let p = 0;
    for (const ch of input) {
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > p) p = a;
      }
    }
    if (p > this.peak) this.peak = p;
    // Copy: the underlying buffers are reused after process() returns.
    if (this.rec) this.port.postMessage({ frames: input.map((ch) => Float32Array.from(ch)) });
    this.since += input[0].length;
    if (this.since >= sampleRate / 20) {
      this.port.postMessage({ peak: this.peak });
      this.peak = 0;
      this.since = 0;
    }
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
`;

export interface AppliedInput {
  label: string;
  sampleRate: number;
  channelCount: number;
  autoGainControl?: boolean;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  capabilities: string[];
}

export interface Captured {
  channels: Float32Array[];
  sampleRate: number;
}

export function useHelixCapture() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [applied, setApplied] = useState<AppliedInput | null>(null);
  const [meter, setMeter] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audio = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    node: AudioWorkletNode;
    blobUrl: string;
  } | null>(null);
  const chunks = useRef<Float32Array[][]>([]);
  const recRef = useRef(false);

  const teardown = useCallback(() => {
    const a = audio.current;
    audio.current = null;
    if (!a) return;
    a.node.port.onmessage = null;
    a.node.disconnect();
    a.stream.getTracks().forEach((t) => t.stop());
    URL.revokeObjectURL(a.blobUrl);
    a.ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardown, [teardown]);

  const enable = useCallback(
    async (wantId?: string) => {
      setError(null);
      if (!window.isSecureContext) {
        setError(
          "Microphone access needs a secure context. Open this over https (the ngrok URL) or on localhost — a plain LAN http:// address will always be refused."
        );
        return;
      }
      teardown();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(wantId ? { deviceId: { exact: wantId } } : {}),
            // All three rewrite the level or the spectrum. A loudness reading
            // taken through any of them is fiction.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
          },
        });

        // Labels are empty until permission has been granted once.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "audioinput"));

        const track = stream.getAudioTracks()[0];
        const s = track.getSettings();
        setDeviceId(s.deviceId ?? "");

        let capabilities: string[] = [];
        try {
          const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
          capabilities = ["autoGainControl", "echoCancellation", "noiseSuppression"]
            .filter((k) => caps && k in caps)
            .map((k) => `${k}: [${(caps![k] as unknown[]).join(", ")}]`);
        } catch {
          capabilities = [];
        }

        // Ask for 48k so K-weighting lands on the BS.1770 reference values;
        // read back what we got, since iOS may refuse.
        const ctx = new AudioContext({ sampleRate: 48000 });
        await ctx.resume();
        const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);

        const src = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "capture", { numberOfOutputs: 1 });
        node.port.onmessage = (ev) => {
          const d = ev.data as { peak?: number; frames?: Float32Array[] };
          if (d.frames && recRef.current) chunks.current.push(d.frames);
          if (d.peak !== undefined) setMeter(d.peak);
        };
        // The worklet emits silence; connecting it keeps the graph pulled
        // without monitoring the guitar back out of the speakers.
        src.connect(node);
        node.connect(ctx.destination);

        audio.current = { ctx, stream, node, blobUrl };
        setApplied({
          label: track.label || "(unnamed input)",
          sampleRate: ctx.sampleRate,
          channelCount: s.channelCount ?? 1,
          autoGainControl: s.autoGainControl,
          echoCancellation: s.echoCancellation,
          noiseSuppression: s.noiseSuppression,
          capabilities,
        });
      } catch (e) {
        setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }
    },
    [teardown]
  );

  /** Release the device — the recording light goes out and other apps get it back. */
  const disable = useCallback(() => {
    teardown();
    recRef.current = false;
    chunks.current = [];
    setRecording(false);
    setApplied(null);
    setMeter(0);
    setError(null);
  }, [teardown]);

  const start = useCallback(() => {
    if (!audio.current) return;
    setError(null);
    chunks.current = [];
    recRef.current = true;
    setRecording(true);
    setElapsed(0);
    audio.current.node.port.postMessage({ record: true });
  }, []);

  const stop = useCallback((): Captured | null => {
    const a = audio.current;
    recRef.current = false;
    setRecording(false);
    if (!a) return null;
    a.node.port.postMessage({ record: false });

    const msgs = chunks.current;
    chunks.current = [];
    if (msgs.length === 0) {
      setError("No audio captured — is the input enabled and the meter moving?");
      return null;
    }

    const numChannels = msgs[0].length;
    const total = msgs.reduce((n, m) => n + m[0].length, 0);
    const channels = Array.from({ length: numChannels }, () => new Float32Array(total));
    let off = 0;
    for (const m of msgs) {
      for (let c = 0; c < numChannels; c++) channels[c].set(m[c], off);
      off += m[0].length;
    }
    return { channels, sampleRate: a.ctx.sampleRate };
  }, []);

  // Elapsed counter doubles as the runaway guard.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(t);
  }, [recording]);

  return {
    devices,
    deviceId,
    setDeviceId,
    applied,
    meter,
    recording,
    elapsed,
    error,
    setError,
    enable,
    disable,
    start,
    stop,
    atLimit: elapsed >= MAX_TAKE_SEC,
  };
}
