"use client";

/**
 * /measure — standalone LUFS bench. Nothing here is saved.
 *
 * A place to answer the questions that decide whether live capture off the
 * Helix is trustworthy, before any of it is wired into a setlist:
 *
 *   1. Is the browser really giving us the Helix, and untouched? Safari won't
 *      say — it reports "not reported" for autoGainControl — so the panel
 *      falls back to evidence: the noise floor either side of the note. AGC
 *      winds gain up during quiet, so it leaves the floor higher after the
 *      note than before it. A passive path can't do that.
 *   2. Does the auto-region land where a human would put it? Each take shows
 *      the proposal, and the handles let you disagree with it.
 *
 * One recording per snapshot — play the chord, stop, read the number.
 *
 * Measurement is the shared package: the same BS.1770 code the upload path
 * runs server-side, here fed the Float32 channels straight off the worklet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  floorFromTrace,
  measureRegion,
  peakDbfsOver,
  proposeChordRegion,
  type FloorCheck,
} from "@music-apps/gain-estimator/src/loudness/analyze";
import {
  momentaryTrace,
  MOMENTARY_HOP_SEC,
} from "@music-apps/gain-estimator/src/loudness/bs1770";

/** Stop runaway takes from eating the tab's memory: 30 s at 48k stereo ≈ 11 MB. */
const MAX_SEC = 30;
const WAVE_BUCKETS = 900;
/** A floor this much higher after the note than before it is not the guitar. */
const FLOOR_RISE_ALARM = 3;

// Inline AudioWorklet, delivered as a Blob URL so there's no public/ file and
// no basePath coupling. It reports a peak ~20×/s always, and posts raw frames
// only while recording — polling the full stream into React would be 375
// messages a second for a meter that can't show them.
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

interface Take {
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  /** Pre-summarised waveform: one [min, max] pair per bucket, already scaled. */
  peaks: Array<[number, number]>;
  /** Largest sample in the take — the divisor the display was scaled by. */
  peakAbs: number;
  /** Momentary loudness curve, one value every MOMENTARY_HOP_SEC. */
  trace: Float32Array;
  startSec: number;
  endSec: number;
  /** False once you've dragged a handle — the algorithm no longer owns it. */
  auto: boolean;
}

interface Applied {
  label: string;
  sampleRate: number;
  channelCount: number;
  autoGainControl?: boolean;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  /** What the browser says it *could* do, which sometimes settles the question. */
  capabilities: string[];
}

function summarise(mono: Float32Array): { peaks: Array<[number, number]>; peakAbs: number } {
  let peakAbs = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = Math.abs(mono[i]);
    if (a > peakAbs) peakAbs = a;
  }
  // Normalise the display to just under full height. A digital tap off the
  // Helix can sit 40 dB down, and drawn to absolute scale it's a flat line —
  // you can't place a region on something you can't see.
  const gain = peakAbs > 0 ? 0.92 / peakAbs : 1;

  const step = Math.max(1, Math.floor(mono.length / WAVE_BUCKETS));
  const peaks: Array<[number, number]> = [];
  for (let i = 0; i + step <= mono.length; i += step) {
    let lo = 0;
    let hi = 0;
    for (let k = i; k < i + step; k++) {
      if (mono[k] < lo) lo = mono[k];
      if (mono[k] > hi) hi = mono[k];
    }
    peaks.push([lo * gain, hi * gain]);
  }
  return { peaks, peakAbs };
}

export default function MeasureBench() {
  const [count, setCount] = useState(4);
  // The region is capped at this from the onset, which is why a proposal stops
  // partway through a still-ringing chord. Fixed rather than "however long it
  // rang" so a sustaining snapshot and a short one are averaged over the same
  // amount of time; 3 s is what the setlist path uses, so readings match.
  const [measureSec, setMeasureSec] = useState(3);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [meter, setMeter] = useState(0);
  const [recording, setRecording] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Record<number, Take>>({});
  const [error, setError] = useState<string | null>(null);

  const audio = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    node: AudioWorkletNode;
    blobUrl: string;
  } | null>(null);
  const chunks = useRef<Float32Array[][]>([]);
  const recordingRef = useRef<number | null>(null);

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

        // Labels are empty until permission has been granted once, so the
        // device list is only worth reading after getUserMedia resolves.
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "audioinput"));

        const track = stream.getAudioTracks()[0];
        const s = track.getSettings();
        setDeviceId(s.deviceId ?? "");

        // getSettings says what's applied; getCapabilities says what's even
        // possible. A device that only offers autoGainControl: [false] has
        // answered the question regardless of what settings omits.
        let capabilities: string[] = [];
        try {
          const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
          capabilities = ["autoGainControl", "echoCancellation", "noiseSuppression"]
            .filter((k) => caps && k in caps)
            .map((k) => `${k}: [${(caps![k] as unknown[]).join(", ")}]`);
        } catch {
          capabilities = [];
        }

        // Ask for 48k so the K-weighting coefficients land on the BS.1770
        // reference values; read back what we got, since iOS may refuse.
        const ctx = new AudioContext({ sampleRate: 48000 });
        await ctx.resume();
        const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);

        const src = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "capture", { numberOfOutputs: 1 });
        node.port.onmessage = (ev) => {
          const d = ev.data as { peak?: number; frames?: Float32Array[] };
          if (d.frames && recordingRef.current !== null) chunks.current.push(d.frames);
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

  const stop = useCallback(() => {
    const a = audio.current;
    const idx = recordingRef.current;
    recordingRef.current = null;
    setRecording(null);
    if (!a || idx === null) return;
    a.node.port.postMessage({ record: false });

    const msgs = chunks.current;
    chunks.current = [];
    if (msgs.length === 0) {
      setError("No audio captured — is the input enabled and the meter moving?");
      return;
    }

    const numChannels = msgs[0].length;
    const total = msgs.reduce((n, m) => n + m[0].length, 0);
    const channels = Array.from({ length: numChannels }, () => new Float32Array(total));
    let off = 0;
    for (const m of msgs) {
      for (let c = 0; c < numChannels; c++) channels[c].set(m[c], off);
      off += m[0].length;
    }

    const sampleRate = a.ctx.sampleRate;
    const mono =
      numChannels === 1 ? channels[0] : channels[0].map((v, i) => (v + channels[1][i]) / 2);
    const { peaks, peakAbs } = summarise(mono);
    const region = proposeChordRegion(channels, sampleRate, measureSec);

    setTakes((prev) => ({
      ...prev,
      [idx]: {
        channels,
        sampleRate,
        durationSec: total / sampleRate,
        peaks,
        peakAbs,
        trace: momentaryTrace(channels, sampleRate),
        startSec: region.startSec,
        endSec: region.endSec,
        auto: true,
      },
    }));
  }, [measureSec]);

  const start = useCallback((idx: number) => {
    if (!audio.current) return;
    setError(null);
    chunks.current = [];
    recordingRef.current = idx;
    setRecording(idx);
    setElapsed(0);
    audio.current.node.port.postMessage({ record: true });
  }, []);

  // Elapsed counter doubles as the runaway guard.
  useEffect(() => {
    if (recording === null) return;
    const t = setInterval(() => {
      setElapsed((e) => {
        if (e + 0.1 >= MAX_SEC) stop();
        return e + 0.1;
      });
    }, 100);
    return () => clearInterval(t);
  }, [recording, stop]);

  const setRegion = useCallback((idx: number, startSec: number, endSec: number) => {
    setTakes((prev) => {
      const t = prev[idx];
      if (!t) return prev;
      return { ...prev, [idx]: { ...t, startSec, endSec, auto: false } };
    });
  }, []);

  const reAuto = useCallback(
    (idx: number) => {
      setTakes((prev) => {
        const t = prev[idx];
        if (!t) return prev;
        const r = proposeChordRegion(t.channels, t.sampleRate, measureSec);
        return { ...prev, [idx]: { ...t, startSec: r.startSec, endSec: r.endSec, auto: true } };
      });
    },
    [measureSec]
  );

  const rows = Array.from({ length: count }, (_, i) => i);

  // Everything is relative to the first measured snapshot — the absolute LUFS
  // depends on the Helix's output trim, the differences don't.
  const results = useMemo(
    () =>
      rows
        .map((i) => {
          const t = takes[i];
          if (!t) return null;
          const m = measureRegion(t.channels, t.sampleRate, t.startSec, t.endSec);
          return { index: i, ...m, floor: floorFromTrace(t.trace, t.startSec, t.endSec, m.lufs) };
        })
        .filter(Boolean) as Array<
        { index: number; floor: FloorCheck } & ReturnType<typeof measureRegion>
      >,
    // rows is derived from count, and its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [takes, count]
  );
  const reference = results[0]?.lufs ?? null;

  // One verdict from every take that could offer evidence, so a single noisy
  // one doesn't decide it either way.
  const rises = results.map((r) => r.floor.riseDb).filter((v): v is number => v !== null);
  // A climb inside a silent stretch is enough on its own — it doesn't need a
  // second stretch to compare against.
  const climbs = results.map((r) => r.floor.climbDb).filter((v): v is number => v !== null);
  const verdict =
    climbs.length > 0 || rises.some((v) => v >= FLOOR_RISE_ALARM)
      ? ("suspect" as const)
      : rises.length > 0
        ? ("clean" as const)
        : null;

  /**
   * Second, independent evidence, and the one that works on takes with no
   * silence in them: automatic gain control exists to pull levels together.
   * If takes recorded at very different levels stay far apart, and each keeps
   * the same peak-to-loudness ratio, nothing is riding the gain.
   */
  const linearity = useMemo(() => {
    if (results.length < 2) return null;
    const lufs = results.map((r) => r.lufs);
    const crests = results.map((r) => r.crestDb);
    const span = Math.max(...lufs) - Math.min(...lufs);
    const crestSpread = Math.max(...crests) - Math.min(...crests);
    if (span < 6) return null;
    return { span, crestSpread, takes: results.length };
  }, [results]);

  return (
    <main className="p-6 max-w-3xl mx-auto min-h-screen">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Measure bench</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One recording per snapshot, straight off the Helix. Nothing is saved — this is here to
          find out whether the capture path is honest.{" "}
          <Link href="/" className="underline hover:text-foreground">
            Back to library
          </Link>
        </p>
      </header>

      {applied && (
        <StickyMeter
          meter={meter}
          label={applied.label}
          recording={recording}
          elapsed={elapsed}
        />
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}

      <section className="mb-6 rounded-xl border border-border p-4">
        <h2 className="text-[15px] font-semibold mb-1">1 · Input</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Connect the Helix by USB first, then enable. Device names are hidden until you&apos;ve
          granted permission once, so the list fills in after the first tap.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => enable(deviceId || undefined)}
            className="text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border hover:bg-secondary"
          >
            {applied ? "Reconnect" : "Enable input"}
          </button>
          <select
            value={deviceId}
            onChange={(e) => {
              setDeviceId(e.target.value);
              if (applied) enable(e.target.value);
            }}
            className="text-[12.5px] px-2 py-2 rounded-lg border border-border bg-background flex-1 min-w-48"
          >
            <option value="">System default input</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </div>

        {applied && (
          <>
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11.5px]">
              <Fact label="Device" value={applied.label} />
              <Fact label="Sample rate" value={`${applied.sampleRate} Hz`} />
              <Fact
                label="Channels"
                value={String(applied.channelCount)}
                warn={
                  applied.channelCount < 2
                    ? "Mono capture — readings are not comparable with stereo ones"
                    : undefined
                }
              />
              <Flag label="Auto gain control" on={applied.autoGainControl} />
              <Flag label="Echo cancellation" on={applied.echoCancellation} />
              <Flag label="Noise suppression" on={applied.noiseSuppression} />
            </dl>

            {applied.capabilities.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                capabilities — {applied.capabilities.join(" · ")}
              </p>
            )}

            <ProcessingVerdict
              verdict={verdict}
              rises={rises}
              climbs={climbs}
              linearity={linearity}
            />
          </>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-border p-4">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h2 className="text-[15px] font-semibold">2 · Snapshots</h2>
          <div className="flex items-center gap-4">
            <label className="text-[11.5px] text-muted-foreground flex items-center gap-2">
              Window
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={measureSec}
                onChange={(e) =>
                  setMeasureSec(Math.max(0.5, Math.min(10, Number(e.target.value) || 3)))
                }
                title="Seconds measured from the onset. Fixed so a sustaining snapshot and a short one are averaged over the same span; 3 s matches the setlist path."
                className="w-16 px-2 py-1 rounded-md border border-border bg-background tabular-nums"
              />
            </label>
            <label className="text-[11.5px] text-muted-foreground flex items-center gap-2">
              How many
              <input
                type="number"
                min={1}
                max={8}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                className="w-14 px-2 py-1 rounded-md border border-border bg-background tabular-nums"
              />
            </label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Start recording, wait a second or two, play the chord, then <strong>let it decay all the
          way to silence before stopping</strong>. The quiet at both ends is what proves nothing is
          adding gain — a take that never goes quiet gives no verdict. The shaded band is the
          proposed region; drag either edge to overrule it.
        </p>

        <div className="flex flex-col gap-3">
          {rows.map((i) => (
            <SnapshotRow
              key={i}
              index={i}
              take={takes[i]}
              armed={Boolean(applied)}
              recording={recording === i}
              otherRecording={recording !== null && recording !== i}
              elapsed={elapsed}
              onStart={() => start(i)}
              onStop={stop}
              onRegion={(a, b) => setRegion(i, a, b)}
              onReAuto={() => reAuto(i)}
            />
          ))}
        </div>
      </section>

      {results.length > 0 && (
        <section className="rounded-xl border border-border p-4">
          <h2 className="text-[15px] font-semibold mb-1">3 · Readings</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Δ is against snapshot {results[0].index + 1} — that difference is what alignment acts
            on, and unlike the absolute LUFS it doesn&apos;t depend on the Helix&apos;s output trim.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="text-right">
                  <th className="text-left font-medium pb-2">Snapshot</th>
                  <th className="font-medium pb-2">LUFS</th>
                  <th className="font-medium pb-2">Δ</th>
                  <th className="font-medium pb-2">Peak</th>
                  <th className="font-medium pb-2">Crest</th>
                  <th className="font-medium pb-2">Floor before → after</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index} className="border-t border-border text-right">
                    <td className="text-left py-1.5">{r.index + 1}</td>
                    <td>{r.lufs.toFixed(2)}</td>
                    <td>
                      {reference === null || r.index === results[0].index
                        ? "—"
                        : `${r.lufs - reference >= 0 ? "+" : ""}${(r.lufs - reference).toFixed(2)}`}
                    </td>
                    <td className={r.clipped ? "text-destructive font-semibold" : ""}>
                      {r.peakDbfs.toFixed(1)}
                    </td>
                    <td>{r.crestDb.toFixed(1)}</td>
                    <td
                      className={
                        r.floor.riseDb !== null && r.floor.riseDb >= FLOOR_RISE_ALARM
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : "text-muted-foreground"
                      }
                    >
                      {r.floor.riseDb === null ? (
                        <span className="text-muted-foreground/60 font-normal text-[11px]">
                          {r.floor.reason ?? "no verdict"}
                        </span>
                      ) : (
                        `${r.floor.beforeDb} → ${r.floor.afterDb}  (${r.floor.riseDb >= 0 ? "+" : ""}${r.floor.riseDb})`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * The meter has to be visible while recording, and the record buttons are far
 * enough down the page that section 1 has scrolled away by then.
 */
function StickyMeter({
  meter,
  label,
  recording,
  elapsed,
}: {
  meter: number;
  label: string;
  recording: number | null;
  elapsed: number;
}) {
  const db = meter > 0 ? 20 * Math.log10(meter) : -Infinity;
  return (
    <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 mb-4 bg-background/90 backdrop-blur border-b border-border">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground truncate max-w-40" title={label}>
          {label}
        </span>
        <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full transition-[width] duration-75 ${
              db > -0.5 ? "bg-destructive" : db > -6 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            // -60 dBFS at the left edge, 0 at the right.
            style={{ width: `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums w-20 text-right">
          {db === -Infinity ? "—" : `${db.toFixed(1)} dBFS`}
        </span>
        {recording !== null && (
          <span className="text-[11px] font-semibold text-destructive tabular-nums whitespace-nowrap">
            ● {recording + 1} · {elapsed.toFixed(1)}s
          </span>
        )}
      </div>
    </div>
  );
}

function ProcessingVerdict({
  verdict,
  rises,
  climbs,
  linearity,
}: {
  verdict: "clean" | "suspect" | null;
  rises: number[];
  climbs: number[];
  linearity: { span: number; crestSpread: number; takes: number } | null;
}) {
  if (verdict === null) {
    return (
      <>
        {linearity && (
          <p className="mt-3 text-[11.5px] text-emerald-700 dark:text-emerald-300">
            <strong>Nothing is riding the gain.</strong> Across {linearity.takes} takes the
            loudness spans {linearity.span.toFixed(1)} dB while the crest factor varies by only{" "}
            {linearity.crestSpread.toFixed(1)} dB. Automatic gain control exists to close a gap
            like that, and it hasn&apos;t been closed.
          </p>
        )}
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          The noise-floor check needs a take that <em>starts</em> and <em>ends</em> in silence:
          record a second or two before the chord, then let it decay all the way out before
          stopping. Without that there&apos;s no floor to compare, only the note.
        </p>
      </>
    );
  }
  return (
    <p
      className={`mt-3 text-[11.5px] ${
        verdict === "suspect"
          ? "text-amber-700 dark:text-amber-300"
          : "text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {verdict === "suspect" ? (
        <>
          <strong>Something is adding gain.</strong>{" "}
          {climbs.length > 0
            ? `The level rises ${Math.max(...climbs).toFixed(1)} dB during a stretch where nothing is playing.`
            : `The noise floor is up to ${Math.max(...rises).toFixed(1)} dB higher after the note than before it.`}{" "}
          Nothing passive does that — check Mic Mode in Control Center, then compare against
          another browser.
        </>
      ) : (
        <>
          <strong>Input path looks passive.</strong> The noise floor moved at most{" "}
          {Math.max(...rises.map(Math.abs)).toFixed(1)} dB between before and after the note across{" "}
          {rises.length} take{rises.length === 1 ? "" : "s"}, and held steady within each — which is
          what a path with no gain control does.
        </>
      )}
    </p>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`truncate ${warn ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}
        title={warn ?? value}
      >
        {value}
        {warn && " ⚠"}
      </dd>
      {/* A mono downmix loses 3 dB on a dry patch and 6 dB on a wide one, so
          the error rides on how much stereo each snapshot has — it doesn't
          cancel in the difference between them, which is the only number
          alignment uses. Nothing can recover it after the fact. */}
      {warn && <dd className="text-[10.5px] text-amber-600/80 dark:text-amber-400/80">{warn}</dd>}
    </div>
  );
}

/** Undefined means the browser declined to report — that's its own answer. */
function Flag({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          on === undefined
            ? "text-amber-600 dark:text-amber-400"
            : on
              ? "text-destructive font-semibold"
              : "text-emerald-600 dark:text-emerald-400"
        }
      >
        {on === undefined ? "not reported" : on ? "ON — readings invalid" : "off"}
      </dd>
    </div>
  );
}

function SnapshotRow({
  index,
  take,
  armed,
  recording,
  otherRecording,
  elapsed,
  onStart,
  onStop,
  onRegion,
  onReAuto,
}: {
  index: number;
  take?: Take;
  armed: boolean;
  recording: boolean;
  otherRecording: boolean;
  elapsed: number;
  onStart: () => void;
  onStop: () => void;
  onRegion: (startSec: number, endSec: number) => void;
  onReAuto: () => void;
}) {
  const { reading, floor } = useMemo(() => {
    if (!take) return { reading: null, floor: null };
    const m = measureRegion(take.channels, take.sampleRate, take.startSec, take.endSec);
    // The window starts after the attack, and the attack is what clips — judge
    // it over the note including its transient, as the recorder does.
    const peakDbfs = Math.max(
      m.peakDbfs,
      peakDbfsOver(take.channels, take.sampleRate, Math.max(0, take.startSec - 0.35), take.startSec)
    );
    const r = { ...m, peakDbfs, clipped: peakDbfs >= -0.1 };
    return { reading: r, floor: floorFromTrace(take.trace, take.startSec, take.endSec, r.lufs) };
  }, [take]);
  const peakDbfs = take && take.peakAbs > 0 ? 20 * Math.log10(take.peakAbs) : null;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-medium">Snapshot {index + 1}</span>
        <button
          onClick={recording ? onStop : onStart}
          disabled={!armed || otherRecording}
          className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-md border disabled:opacity-40 ${
            recording
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border hover:bg-secondary"
          }`}
        >
          {recording ? `Stop · ${elapsed.toFixed(1)}s` : take ? "Re-record" : "Record"}
        </button>
        {reading && (
          <span className="text-[13px] font-semibold tabular-nums ml-auto">
            {reading.lufs.toFixed(2)} LUFS
          </span>
        )}
      </div>

      {take && (
        <>
          <Waveform take={take} onRegion={onRegion} />
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground mt-1.5">
            <span className="tabular-nums">
              {take.startSec.toFixed(2)}–{take.endSec.toFixed(2)}s
            </span>
            <span>{take.auto ? "auto-detected" : "adjusted by hand"}</span>
            {peakDbfs !== null && (
              <span className="tabular-nums" title="Display is normalised; this is the true peak.">
                peak {peakDbfs.toFixed(1)} dBFS · zoom ×{(0.92 / take.peakAbs).toFixed(0)}
              </span>
            )}
            {reading?.clipped && (
              <span className="text-destructive font-semibold">
                clipped — the reading understates the level
              </span>
            )}
            {!take.auto && (
              <button onClick={onReAuto} className="underline hover:text-foreground">
                reset to auto
              </button>
            )}
          </div>
          {floor?.reason && (
            <p className="text-[11px] text-muted-foreground/70 mt-1">{floor.reason}</p>
          )}
        </>
      )}
    </div>
  );
}

const WAVE_H = 96;

function Waveform({
  take,
  onRegion,
}: {
  take: Take;
  onRegion: (startSec: number, endSec: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    cv.width = w * dpr;
    cv.height = WAVE_H * dpr;
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, WAVE_H);

    const xOf = (sec: number) => (sec / take.durationSec) * w;
    const mid = WAVE_H / 2;

    // Region band first, so everything else draws over it.
    g.fillStyle = "rgba(139, 92, 246, 0.18)";
    g.fillRect(xOf(take.startSec), 0, xOf(take.endSec) - xOf(take.startSec), WAVE_H);

    g.strokeStyle = "rgba(120, 120, 130, 0.85)";
    g.lineWidth = 1;
    const n = take.peaks.length;
    for (let x = 0; x < w; x++) {
      const [lo, hi] = take.peaks[Math.min(n - 1, Math.floor((x / w) * n))] ?? [0, 0];
      g.beginPath();
      g.moveTo(x + 0.5, mid - hi * mid);
      g.lineTo(x + 0.5, mid - lo * mid);
      g.stroke();
    }

    // Momentary loudness over the top, -70…0 LUFS across the full height. The
    // waveform shows where the note is; this shows what the level is doing,
    // which is where a gain control gives itself away.
    if (take.trace.length > 1) {
      g.strokeStyle = "rgba(16, 185, 129, 0.9)";
      g.lineWidth = 1.5;
      g.beginPath();
      let started = false;
      for (let i = 0; i < take.trace.length; i++) {
        const v = take.trace[i];
        if (!Number.isFinite(v)) continue;
        const x = xOf(i * MOMENTARY_HOP_SEC + 0.2);
        const y = WAVE_H - Math.max(0, Math.min(1, (v + 70) / 70)) * WAVE_H;
        if (started) g.lineTo(x, y);
        else {
          g.moveTo(x, y);
          started = true;
        }
      }
      g.stroke();
    }

    g.strokeStyle = "rgb(139, 92, 246)";
    g.lineWidth = 2;
    for (const sec of [take.startSec, take.endSec]) {
      g.beginPath();
      g.moveTo(xOf(sec), 0);
      g.lineTo(xOf(sec), WAVE_H);
      g.stroke();
    }
  }, [take]);

  const secAt = (clientX: number): number => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * take.durationSec;
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sec = secAt(e.clientX);
    // Grab whichever handle is nearer — with two handles that's unambiguous,
    // and it beats hunting for a hit target with a fingertip.
    dragging.current =
      Math.abs(sec - take.startSec) <= Math.abs(sec - take.endSec) ? "start" : "end";
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const sec = secAt(e.clientX);
    const MIN = 0.45; // one BS.1770 block, below which there's nothing to measure
    if (dragging.current === "start") onRegion(Math.min(sec, take.endSec - MIN), take.endSec);
    else onRegion(take.startSec, Math.max(sec, take.startSec + MIN));
  };

  return (
    <canvas
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
      // touch-action: none, or the iPad scrolls the page instead of dragging.
      className="w-full mt-2.5 rounded-md bg-secondary/40 touch-none cursor-ew-resize"
      style={{ height: WAVE_H }}
    />
  );
}

/**
 * Rolling history of the input level.
 *
 * For the question a meter can't answer: does the Helix's volume knob move the
 * USB signal? Watching a bar while turning a knob is a judgement call; a trace
 * makes a step obvious, and it stays on screen long enough to compare before
 * and after. It also shows drift — a level that wanders while nothing is being
 * played is gain control, not the guitar.
 */
const HISTORY_SEC = 30;
const HISTORY_HZ = 20; // the worklet's peak report rate
const HISTORY_H = 84;

function LevelHistory({ db }: { db: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const buf = useRef<number[]>([]);
  const latest = useRef(db);
  latest.current = db;

  // Sampled on a timer, not on `db` changing. A steady signal — and digital
  // silence especially — reports the same value over and over, so a
  // value-driven effect stops firing and the trace freezes precisely when you
  // want to see that it's flat.
  useEffect(() => {
    const draw = () => {
      const v = latest.current;
      buf.current.push(Number.isFinite(v) ? v : -100);
      if (buf.current.length > HISTORY_SEC * HISTORY_HZ) buf.current.shift();

      const cv = ref.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = HISTORY_H * dpr;
      }
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, HISTORY_H);

      // -90…0 dBFS across the height, with a gridline every 20 dB.
      const y = (t: number) =>
        HISTORY_H - ((Math.max(-90, Math.min(0, t)) + 90) / 90) * HISTORY_H;
      g.strokeStyle = "rgba(130,130,140,0.25)";
      g.lineWidth = 1;
      g.font = "9px system-ui";
      g.fillStyle = "rgba(130,130,140,0.7)";
      for (const t of [-20, -40, -60, -80]) {
        g.beginPath();
        g.moveTo(26, y(t) + 0.5);
        g.lineTo(w, y(t) + 0.5);
        g.stroke();
        g.fillText(`${t}`, 2, y(t) + 3);
      }

      const n = buf.current.length;
      const span = HISTORY_SEC * HISTORY_HZ;
      g.strokeStyle = "rgb(16,185,129)";
      g.lineWidth = 1.5;
      g.beginPath();
      buf.current.forEach((t, i) => {
        // Anchored right, so the newest sample is always at the edge.
        const x = 26 + ((i + (span - n)) / span) * (w - 26);
        if (i === 0) g.moveTo(x, y(t));
        else g.lineTo(x, y(t));
      });
      g.stroke();
    };

    draw();
    const id = setInterval(draw, 1000 / HISTORY_HZ);
    return () => clearInterval(id);
  }, []);

  return (
    <canvas
      ref={ref}
      className="w-full mt-2 rounded-md bg-secondary/40"
      style={{ height: HISTORY_H }}
    />
  );
}
