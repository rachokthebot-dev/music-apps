"use client";

// R4 Rhythmic Alternation — metronome with subdivided beat patterns.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R4"
//
// Sibling to useMetronome that schedules clicks on dotted / triplet subdivisions
// rather than straight beats. Forked rather than parameterized so the existing
// metronome stays simple. The two share the AudioContext unlock pattern and
// look-ahead scheduling idiom.
//
// Patterns (offsets within each beat, as fractions 0..1):
//   straight       — every beat. [0]
//   dotted-forward — long-short. [0, 0.667]   (dotted-eighth + sixteenth feel)
//   dotted-reverse — short-long. [0, 0.333]
//   triplet        — three even subdivisions. [0, 0.333, 0.667]

import { useCallback, useEffect, useRef, useState } from "react";

export type MetronomePattern =
  | "straight"
  | "dotted-forward"
  | "dotted-reverse"
  | "triplet";

const PATTERN_OFFSETS: Record<MetronomePattern, number[]> = {
  straight: [0],
  "dotted-forward": [0, 0.667],
  "dotted-reverse": [0, 0.333],
  triplet: [0, 0.333, 0.667],
};

const SCHEDULE_AHEAD = 0.15;
const TICK_INTERVAL = 20;

export interface UseMetronomePatternOptions {
  bpm: number;
  pattern: MetronomePattern;
  enabled: boolean;
  volume: number;
}

export function useMetronomePattern({
  bpm,
  pattern,
  enabled,
  volume,
}: UseMetronomePatternOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTickRef = useRef(0);
  const subdivIndexRef = useRef(0);
  const [running, setRunning] = useState(false);

  const bpmRef = useRef(bpm);
  const patternRef = useRef(pattern);
  const volumeRef = useRef(volume);
  bpmRef.current = bpm;
  patternRef.current = pattern;
  volumeRef.current = volume;

  const ensureCtx = useCallback((): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = volumeRef.current;
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  }, []);

  const scheduleClick = useCallback((time: number, accent: boolean) => {
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    const osc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    osc.frequency.value = accent ? 1000 : 800;
    osc.type = "sine";
    clickGain.gain.setValueAtTime(0, time);
    clickGain.gain.linearRampToValueAtTime(1, time + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(clickGain);
    clickGain.connect(gain);
    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  // Listen for AudioContext suspend on tab hide / device lock and reset on resume.
  // (julik's review §"R3 + R4 metronome".)
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const onStateChange = () => {
      if (ctx.state === "running") {
        nextTickRef.current = ctx.currentTime + 0.05;
        subdivIndexRef.current = 0;
      }
    };
    ctx.addEventListener("statechange", onStateChange);
    return () => ctx.removeEventListener("statechange", onStateChange);
  }, [running]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRunning(false);
      return;
    }
    const ctx = ensureCtx();
    void ctx.resume();
    nextTickRef.current = ctx.currentTime + 0.05;
    subdivIndexRef.current = 0;
    setRunning(true);

    timerRef.current = setInterval(() => {
      const c = audioCtxRef.current;
      if (!c) return;
      const horizon = c.currentTime + SCHEDULE_AHEAD;
      while (nextTickRef.current < horizon) {
        const offsets = PATTERN_OFFSETS[patternRef.current];
        const sIdx = subdivIndexRef.current % offsets.length;
        const isDownbeat = sIdx === 0;
        scheduleClick(nextTickRef.current, isDownbeat);
        const secPerBeat = 60 / bpmRef.current;
        // advance to next subdivision; wrap to next beat at end of pattern
        const nextSubdiv = (sIdx + 1) % offsets.length;
        const thisOffset = offsets[sIdx];
        const nextOffset = offsets[nextSubdiv];
        const delta =
          nextSubdiv === 0
            ? (1 - thisOffset + nextOffset) * secPerBeat
            : (nextOffset - thisOffset) * secPerBeat;
        nextTickRef.current += delta;
        subdivIndexRef.current = nextSubdiv;
      }
    }, TICK_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, ensureCtx, scheduleClick]);

  // Suspend (not close) on unmount so the AudioContext slot is reusable
  // across sandbox page navigations. (julik's review §"Unmount contract".)
  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.suspend();
    };
  }, []);

  return { running };
}
