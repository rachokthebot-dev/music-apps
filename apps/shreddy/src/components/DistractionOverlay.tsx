"use client";

// R6 Distraction Test — dual-task cognitive load overlay.
// Promoted from apps/shreddy/src/app/sandbox/distraction/page.tsx.
//
// Key changes vs the sandbox:
//   * 1s interval option added per user grading feedback.
//   * Distractor card sits in a fixed-height container so spawn/clear does
//     not reflow the surrounding transport bar (real bug in the sandbox
//     mockup).
//   * Reads currentTime + playing from the practice page instead of its own
//     useStubPlayer — no audio element, no parallel <audio> tags.
//
// Williamon & Valentine (2002) warning preserved per the pedagogical caveat
// in the original mockup.

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";

type Mode = "numbers" | "words" | "math";
type Interval = 1 | 3 | 5 | 10;

const WARNING_DISMISSED_KEY = "shreddy.distraction.warningDismissed";

const WORDS = [
  "apple", "river", "stone", "candle", "table", "north", "lemon",
  "voice", "circle", "salt", "thunder", "honey", "iron", "willow",
];

function generateDistractor(mode: Mode): string {
  if (mode === "numbers") {
    return String(Math.floor(Math.random() * 90) + 10);
  }
  if (mode === "words") {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  const a = Math.floor(Math.random() * 12) + 2;
  const b = Math.floor(Math.random() * 12) + 2;
  return `${a} + ${b}`;
}

interface Result {
  total: number;
  passed: number;
  failed: number;
}

interface DistractionOverlayProps {
  playing: boolean;
  currentTime: number;
  onClose: () => void;
}

export function DistractionOverlay({
  playing,
  currentTime,
  onClose,
}: DistractionOverlayProps) {
  const [mode, setMode] = useState<Mode>("numbers");
  const [interval, setIntervalSec] = useState<Interval>(5);
  const [distractor, setDistractor] = useState<string | null>(null);
  // Initial value is `false` to match SSR; the real value is hydrated in an
  // effect below so localStorage doesn't break the static render.
  const [showWarning, setShowWarning] = useState(false);
  const [result, setResult] = useState<Result>({ total: 0, passed: 0, failed: 0 });

  const lastShownRef = useRef(0);

  // Persist warning dismissal so iPad practice sessions don't re-show the
  // novice/advanced caveat every time the overlay opens. Read after mount to
  // avoid hydration mismatch.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(WARNING_DISMISSED_KEY) !== "1") {
        setShowWarning(true);
      }
    } catch {
      setShowWarning(true);
    }
  }, []);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    try {
      window.localStorage.setItem(WARNING_DISMISSED_KEY, "1");
    } catch {
      // private mode / quota — fall back to in-session dismissal only.
    }
  }, []);

  // Spawn a new distractor when interval has elapsed (driven by song
  // currentTime so distractor pacing follows tempo/seek, not wall-clock).
  useEffect(() => {
    if (!playing) {
      setDistractor(null);
      return;
    }
    if (currentTime - lastShownRef.current >= interval) {
      lastShownRef.current = currentTime;
      setDistractor(generateDistractor(mode));
    }
  }, [currentTime, interval, mode, playing]);

  const recordResult = useCallback(
    (passed: boolean) => {
      if (!distractor) return;
      setResult((r) => ({
        total: r.total + 1,
        passed: r.passed + (passed ? 1 : 0),
        failed: r.failed + (passed ? 0 : 1),
      }));
      setDistractor(null);
    },
    [distractor]
  );

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-3 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Distraction practice (R6)
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground active:scale-95 transition"
          aria-label="Close distraction overlay"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Skill-level warning (Williamon & Valentine 2002) */}
      {showWarning && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-foreground font-medium">
              Advanced practice — may hurt early learning.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Dual-task training reduces performance anxiety for advanced
              players (Shipley 2013) but impairs skill acquisition in novices
              (Williamon &amp; Valentine 2002). Use only when the passage is
              already fluent.
            </p>
          </div>
          <button
            onClick={dismissWarning}
            className="text-muted-foreground hover:text-foreground active:scale-95 transition"
            aria-label="Dismiss warning"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Distractor card — fixed height so spawn/clear does NOT reflow the
          transport bar below. The sandbox version reflowed; that was a bug. */}
      <section className="relative h-24 rounded-xl bg-muted/40 border border-border flex items-center justify-center overflow-hidden">
        {distractor ? (
          <div className="text-center">
            <div className="text-4xl sm:text-5xl font-mono tabular-nums text-foreground leading-none">
              {distractor}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider">
              every {interval}s
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            {playing ? (
              <span className="text-xs">
                Next in{" "}
                {Math.max(
                  0,
                  Math.ceil(interval - (currentTime - lastShownRef.current))
                )}
                s
              </span>
            ) : (
              <span className="text-xs">Press play to start</span>
            )}
          </div>
        )}
      </section>

      {/* Pass / fail — same fixed height regardless of distractor presence */}
      <div className="grid grid-cols-2 gap-2 h-10">
        <button
          onClick={() => recordResult(false)}
          disabled={!distractor}
          className="rounded-lg border border-destructive/40 text-destructive text-sm font-medium active:scale-95 transition disabled:opacity-30 disabled:active:scale-100"
        >
          <X className="size-4 inline-block mr-1.5 align-middle" />
          Failed
        </button>
        <button
          onClick={() => recordResult(true)}
          disabled={!distractor}
          className="rounded-lg bg-foreground text-background text-sm font-medium active:scale-95 transition disabled:opacity-30 disabled:active:scale-100"
        >
          <Check className="size-4 inline-block mr-1.5 align-middle" />
          Passed
        </button>
      </div>

      {/* Mode picker + interval picker — single row to save iPhone vertical
          real estate (was two stacked rows). 7 buttons fit in a row at 390px. */}
      <div className="flex gap-1 items-center">
        {(["numbers", "words", "math"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 h-8 rounded-md text-xs transition ${
              mode === m
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
            title={`Mode: ${m}`}
          >
            {m === "numbers" ? "#" : m === "math" ? "+" : "abc"}
          </button>
        ))}
        <span className="w-px h-5 bg-border mx-1" aria-hidden />
        {([1, 3, 5, 10] as const).map((s) => (
          <button
            key={s}
            onClick={() => setIntervalSec(s)}
            className={`flex-1 h-8 rounded-md text-xs transition ${
              interval === s
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}s
          </button>
        ))}
      </div>

      {/* Session stats — inline single line instead of three cards. */}
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono tabular-nums text-muted-foreground">
        <span>total {result.total}</span>
        <span className="text-foreground">passed {result.passed}</span>
        <span className="text-destructive">failed {result.failed}</span>
      </div>
    </div>
  );
}
