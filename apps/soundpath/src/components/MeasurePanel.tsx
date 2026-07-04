"use client";

/**
 * MeasurePanel — ground-truth loudness measurement.
 *
 * The gain estimator predicts per-snapshot loudness from preset JSON; it never
 * hears the patch. This panel captures the real thing two ways, both feeding
 * the same POST /api/preset/[slot]/measure (WAV in → integrated LUFS out,
 * stored per snapshot):
 *
 *   1. Live: record off the Helix (USB / line in) via getUserMedia + an
 *      AudioWorklet, encode to WAV in-browser, upload.
 *   2. Upload: pick a WAV recorded in a DAW.
 *
 * It then shows estimated vs. measured loudness (both relative to snapshot 0)
 * and the residual — how far the estimator is off. Slot-scoped: each pane
 * (A/B) has its own measurements file, cleared when a new preset is imported.
 *
 * Critical: getUserMedia's default echoCancellation / noiseSuppression /
 * autoGainControl all corrupt a loudness reading (AGC literally changes gain).
 * They are disabled below. Live capture needs a secure context (localhost is
 * fine; a deployed instance needs HTTPS).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { encodeWavFloat32 } from "@/lib/wavEncode";

const apiUrl = (slot: "a" | "b") => `/soundpath/api/preset/${slot}/measure`;

// Inline AudioWorklet: copies each input render quantum back to the main thread.
// Delivered as a Blob URL so there's no public/ file or basePath coupling.
const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0].length > 0) {
      // Copy: the underlying buffers are reused after process() returns.
      this.port.postMessage(input.map((ch) => Float32Array.from(ch)));
    }
    return true;
  }
}
registerProcessor('capture', CaptureProcessor);
`;

type Row = {
  index: number;
  name: string;
  estimatedRelDb: number;
  measuredLufs: number | null;
  measuredRelDb: number | null;
  residualDb: number | null;
  measuredAt: string | null;
};

type MeasureResponse = {
  ok: boolean;
  snapshots?: Row[];
  error?: string;
};

export default function MeasurePanel({
  slot,
  open,
  onClose,
}: {
  slot: "a" | "b";
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [recording, setRecording] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live-capture machinery, held across start/stop.
  const captureRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    src: MediaStreamAudioSourceNode;
    node: AudioWorkletNode;
    chunks: Float32Array[][]; // per-message [ch0, ch1, ...]
    blobUrl: string;
  } | null>(null);

  const loadLandscape = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(apiUrl(slot));
      const j = (await r.json()) as MeasureResponse;
      if (!j.ok) throw new Error(j.error ?? "Failed to load measurements");
      setRows(j.snapshots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [slot]);

  useEffect(() => {
    if (!open) return;
    loadLandscape();
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setDevices(d.filter((x) => x.kind === "audioinput")))
      .catch(() => {});
  }, [open, loadLandscape]);

  const post = useCallback(
    async (snapshotIndex: number, wav: Blob) => {
      setBusy(snapshotIndex);
      setError(null);
      try {
        const form = new FormData();
        form.append("wav", wav, "capture.wav");
        form.append("snapshotIndex", String(snapshotIndex));
        const r = await fetch(apiUrl(slot), { method: "POST", body: form });
        const j = (await r.json()) as MeasureResponse;
        if (!j.ok) throw new Error(j.error ?? "Measurement failed");
        setRows(j.snapshots ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [slot]
  );

  const startRecording = useCallback(
    async (snapshotIndex: number) => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
          },
        });
        // Pin 48k so K-weighting coefficients land on the BS.1770 reference.
        const ctx = new AudioContext({ sampleRate: 48000 });
        const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);

        const src = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "capture", { numberOfOutputs: 1 });
        const chunks: Float32Array[][] = [];
        node.port.onmessage = (ev) => chunks.push(ev.data as Float32Array[]);

        // Worklet emits silence; connecting to destination keeps it pulled
        // without monitoring the guitar back through the speakers.
        src.connect(node);
        node.connect(ctx.destination);

        captureRef.current = { ctx, stream, src, node, chunks, blobUrl };
        setRecording(snapshotIndex);
      } catch (e) {
        setError(
          e instanceof Error
            ? `${e.message} — live capture needs mic permission and a secure context (https/localhost).`
            : String(e)
        );
      }
    },
    [deviceId]
  );

  const stopRecording = useCallback(
    async (snapshotIndex: number) => {
      const cap = captureRef.current;
      captureRef.current = null;
      setRecording(null);
      if (!cap) return;

      const { ctx, stream, src, node, chunks, blobUrl } = cap;
      src.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      URL.revokeObjectURL(blobUrl);
      const sampleRate = ctx.sampleRate;
      await ctx.close();

      if (chunks.length === 0) {
        setError("No audio captured.");
        return;
      }
      const numChannels = chunks[0].length;
      const total = chunks.reduce((n, c) => n + c[0].length, 0);
      const channels = Array.from({ length: numChannels }, () => new Float32Array(total));
      let off = 0;
      for (const msg of chunks) {
        const len = msg[0].length;
        for (let c = 0; c < numChannels; c++) channels[c].set(msg[c], off);
        off += len;
      }
      await post(snapshotIndex, encodeWavFloat32(channels, sampleRate));
    },
    [post]
  );

  if (!open) return null;

  const residualClass = (r: number | null) =>
    r === null
      ? "text-muted-foreground/70"
      : Math.abs(r) < 1
        ? "text-emerald-600 dark:text-emerald-400"
        : Math.abs(r) < 3
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";

  return (
    <section className="mb-6 rounded-lg border border-border bg-card/60 p-4">
      <header className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Measure loudness</h2>
          <p className="text-xs text-muted-foreground">
            Ground-truth LUFS per snapshot vs. the estimator. Record off the Helix or upload a WAV.{" "}
            <Link href="/help" className="text-muted-foreground hover:text-foreground underline">
              Recording guide
            </Link>
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded-md border border-input bg-secondary hover:bg-accent"
        >
          Close
        </button>
      </header>

      <div className="mb-3 flex items-center gap-2 text-xs">
        <label className="text-muted-foreground">Input</label>
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="rounded-md border border-input bg-secondary px-2 py-1 text-foreground"
        >
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground/70">AGC / noise-suppression disabled for accuracy.</span>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-300 dark:border-red-900/50 bg-red-100 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-medium">Snapshot</th>
            <th className="py-1 font-medium text-right">Est. (dB)</th>
            <th className="py-1 font-medium text-right">Measured (LUFS)</th>
            <th className="py-1 font-medium text-right">Meas. rel (dB)</th>
            <th className="py-1 font-medium text-right">Residual</th>
            <th className="py-1 font-medium text-right">Capture</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row) => {
            const isRec = recording === row.index;
            const isBusy = busy === row.index;
            return (
              <tr key={row.index} className="border-t border-border">
                <td className="py-1.5 text-foreground/80">
                  {row.index}. {row.name}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.estimatedRelDb > 0 ? "+" : ""}
                  {row.estimatedRelDb.toFixed(1)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.measuredLufs === null ? "—" : row.measuredLufs.toFixed(1)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.measuredRelDb === null
                    ? "—"
                    : `${row.measuredRelDb > 0 ? "+" : ""}${row.measuredRelDb.toFixed(1)}`}
                </td>
                <td className={`py-1.5 text-right tabular-nums font-medium ${residualClass(row.residualDb)}`}>
                  {row.residualDb === null
                    ? "—"
                    : `${row.residualDb > 0 ? "+" : ""}${row.residualDb.toFixed(1)}`}
                </td>
                <td className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {isRec ? (
                      <button
                        onClick={() => stopRecording(row.index)}
                        className="px-2 py-1 text-xs rounded-md border border-red-400 dark:border-red-700/60 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-900/60"
                      >
                        ■ Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => startRecording(row.index)}
                        disabled={recording !== null || isBusy}
                        className="px-2 py-1 text-xs rounded-md border border-input bg-secondary hover:bg-accent disabled:opacity-40"
                      >
                        ● Rec
                      </button>
                    )}
                    <label
                      className={`px-2 py-1 text-xs rounded-md border border-input bg-secondary hover:bg-accent cursor-pointer ${
                        recording !== null || isBusy ? "opacity-40 pointer-events-none" : ""
                      }`}
                    >
                      {isBusy ? "…" : "WAV"}
                      <input
                        type="file"
                        accept="audio/wav,.wav"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) post(row.index, f);
                        }}
                      />
                    </label>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-muted-foreground/70">
        Residual = measured − estimated, both relative to snapshot 0.{" "}
        <span className="text-emerald-600 dark:text-emerald-400">green</span> &lt;1 dB,{" "}
        <span className="text-amber-600 dark:text-amber-400">amber</span> &lt;3 dB,{" "}
        <span className="text-red-600 dark:text-red-400">red</span> ≥3 dB off. Play a few seconds of full chords per
        snapshot.
      </p>
    </section>
  );
}
