"use client";

import { useEffect, useState } from "react";

/**
 * Loading state for LLM-backed actions (~10s typical).
 *
 * Rotates through phase labels at a steady cadence so it feels like work is
 * happening rather than a dead spinner. The phases are display-only — under
 * the hood we just await Gemini once — but the staged messaging matches what
 * Gemini is actually doing internally on the way to its single response.
 */

type Props = {
  /** Optional override phases for different LLM tasks. */
  phases?: string[];
  /** Approximate seconds for the call so the progress bar fills proportionally. */
  expectedSeconds?: number;
};

const DEFAULT_PHASES = [
  "Reading your rig…",
  "Looking up real-world references…",
  "Choosing settings…",
  "Writing it up…",
];

export default function LlmProgress({ phases = DEFAULT_PHASES, expectedSeconds = 10 }: Props) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const sec = (Date.now() - start) / 1000;
      setElapsed(sec);
      const next = Math.min(phases.length - 1, Math.floor((sec / expectedSeconds) * phases.length));
      setPhaseIdx(next);
    }, 200);
    return () => clearInterval(tick);
  }, [phases.length, expectedSeconds]);

  const pct = Math.min(95, (elapsed / expectedSeconds) * 100);

  return (
    <div className="rounded-md border border-blue-900/40 bg-blue-950/20 p-4">
      <div className="flex items-center gap-3 mb-2">
        <Spinner />
        <div className="flex-1">
          <div className="text-sm text-blue-100 font-medium">{phases[phaseIdx]}</div>
          <div className="text-[11px] text-blue-300/60 mt-0.5 tabular-nums">
            {elapsed.toFixed(1)}s elapsed · expected ~{expectedSeconds}s
          </div>
        </div>
      </div>
      <div className="h-1 rounded bg-blue-950 overflow-hidden">
        <div
          className="h-full bg-blue-500/70 transition-all duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-blue-300" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
