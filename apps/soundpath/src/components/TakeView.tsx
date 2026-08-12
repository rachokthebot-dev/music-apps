"use client";

/**
 * One recorded take: waveform, the proposed region, and what it measures.
 *
 * The waveform is normalised to near full height and says by how much. A
 * digital tap off the Helix can sit 40 dB down, and drawn to absolute scale
 * it's a flat line — you can't place a region on something you can't see.
 *
 * Over it runs the momentary loudness curve, which is what makes the shape of
 * the take legible: where the note actually starts, whether it has decayed,
 * and whether anything is propping the level up.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  floorFromTrace,
  measureRegion,
  peakDbfsOver,
  proposeChordRegion,
} from "@music-apps/gain-estimator/src/loudness/analyze";
import { momentaryTrace, MOMENTARY_HOP_SEC } from "@music-apps/gain-estimator/src/loudness/bs1770";

const WAVE_BUCKETS = 900;
const WAVE_H = 96;

/** The cap a proposed window is made under — it bounds how much of the note is measured. */
export const DEFAULT_MEASURE_SEC = 3;

export interface Take {
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  peaks: Array<[number, number]>;
  peakAbs: number;
  trace: Float32Array;
  startSec: number;
  endSec: number;
  auto: boolean;
}

/** Build a Take from raw capture, with the region already proposed. */
export function makeTake(
  channels: Float32Array[],
  sampleRate: number,
  measureSec = DEFAULT_MEASURE_SEC
): Take {
  const total = channels[0]?.length ?? 0;
  const mono =
    channels.length === 1 ? channels[0] : channels[0].map((v, i) => (v + channels[1][i]) / 2);

  let peakAbs = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = Math.abs(mono[i]);
    if (a > peakAbs) peakAbs = a;
  }
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

  const region = proposeChordRegion(channels, sampleRate, measureSec);
  return {
    channels,
    sampleRate,
    durationSec: total / sampleRate,
    peaks,
    peakAbs,
    trace: momentaryTrace(channels, sampleRate),
    startSec: region.startSec,
    endSec: region.endSec,
    auto: true,
  };
}

export function TakeView({
  take,
  onRegion,
  onReAuto,
}: {
  take: Take;
  onRegion: (startSec: number, endSec: number) => void;
  onReAuto: () => void;
}) {
  const { reading, floor } = useMemo(() => {
    // The same call the save path makes, so what you see flagged is what gets
    // refused.
    const m = readingOf(take);
    return { reading: m, floor: floorFromTrace(take.trace, take.startSec, take.endSec, m.lufs) };
  }, [take]);

  const peakDbfs = take.peakAbs > 0 ? 20 * Math.log10(take.peakAbs) : null;

  return (
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
        {reading.clipped && (
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
      {floor.reason && (
        <p className="text-[11px] text-muted-foreground/70 mt-1">{floor.reason}</p>
      )}
    </>
  );
}

/**
 * The reading a take currently yields, for callers that only want the number.
 *
 * Loudness comes from the region; clipping is judged over the note *with* its
 * attack. The window deliberately starts after the transient, and the
 * transient is what hits the converter — take the peak from inside the window
 * alone and a take that slammed 0 dBFS on the way in would be accepted, its
 * flattened peak sitting just outside the range we looked at.
 */
export function readingOf(take: Take) {
  const m = measureRegion(take.channels, take.sampleRate, take.startSec, take.endSec);
  const peakDbfs = Math.max(
    m.peakDbfs,
    peakDbfsOver(take.channels, take.sampleRate, Math.max(0, take.startSec - 0.35), take.startSec)
  );
  return { ...m, peakDbfs, clipped: peakDbfs >= -0.1 };
}

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

    // Momentary loudness, -70…0 LUFS across the full height.
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
    // Grab whichever handle is nearer — unambiguous with two, and it beats
    // hunting for a hit target with a fingertip.
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
