"use client";

// R6 Distraction Test — dual-task cognitive load overlay.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R6"
//
// IMPORTANT pedagogical caveat: Williamon & Valentine (2002) showed this
// technique HARMS novices — it benefits advanced performers (Shipley 2013)
// by reducing performance anxiety, but for early learners it impairs initial
// skill acquisition (Sweller cognitive-load theory). The mockup must show
// this warning so graders evaluate it as advanced-only.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, X, Check, AlertTriangle } from "lucide-react";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

type Mode = "numbers" | "words" | "math";
type Interval = 3 | 5 | 10;

const WORDS = [
  "apple", "river", "stone", "candle", "table", "north", "lemon",
  "voice", "circle", "salt", "thunder", "honey", "iron", "willow",
];

const generateDistractor = (mode: Mode): string => {
  if (mode === "numbers") {
    return String(Math.floor(Math.random() * 90) + 10);
  }
  if (mode === "words") {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  }
  // math — keep it 2-digit; user is supposed to be playing guitar
  const a = Math.floor(Math.random() * 12) + 2;
  const b = Math.floor(Math.random() * 12) + 2;
  return `${a} + ${b}`;
};

interface Result {
  total: number;
  passed: number;
  failed: number;
}

export default function DistractionPage() {
  const { playing, play, pause, currentTime } = useStubPlayer(defaultStub);
  const [mode, setMode] = useState<Mode>("numbers");
  const [interval, setIntervalSec] = useState<Interval>(5);
  const [distractor, setDistractor] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(true);
  const [result, setResult] = useState<Result>({ total: 0, passed: 0, failed: 0 });

  const lastShownRef = useRef(0);

  // Spawn new distractor on interval while playing
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

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, play, pause]);

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
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Distraction Test" requirementId="R6" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Skill-level warning — pedagogically required per research */}
        {showWarning && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--sandbox-accent)]/30 bg-[var(--sandbox-accent)]/5">
            <AlertTriangle className="size-5 text-[var(--sandbox-accent)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-foreground font-medium">
                Advanced practice — may hurt early learning.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Dual-task training reduces performance anxiety for advanced
                players (Shipley 2013) but impairs skill acquisition in
                novices (Williamon &amp; Valentine 2002). Use only when the
                passage is already fluent.
              </p>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="text-muted-foreground hover:text-foreground active:scale-95 transition"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Distractor overlay area — visible only while playing */}
        <section className="relative min-h-[14rem] rounded-2xl bg-card border border-border flex items-center justify-center overflow-hidden">
          {distractor ? (
            <div className="text-center transition-opacity duration-150">
              <div className="text-7xl sm:text-9xl font-mono tabular-nums text-foreground">
                {distractor}
              </div>
              <div className="text-xs text-muted-foreground mt-3 uppercase tracking-wider">
                every {interval}s
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              {playing ? (
                <span className="text-sm">
                  Next distractor in {Math.max(0, Math.ceil(interval - (currentTime - lastShownRef.current)))}s
                </span>
              ) : (
                <span className="text-sm">Tap play to start a session</span>
              )}
            </div>
          )}
        </section>

        {/* Pass / fail (visible whenever a distractor is shown) */}
        {distractor && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => recordResult(false)}
              className="h-14 rounded-xl border border-destructive/40 text-destructive font-medium active:scale-95 transition"
            >
              <X className="size-4 inline-block mr-2 align-middle" />
              Failed
            </button>
            <button
              onClick={() => recordResult(true)}
              className="h-14 rounded-xl bg-foreground text-background font-medium active:scale-95 transition"
            >
              <Check className="size-4 inline-block mr-2 align-middle" />
              Passed
            </button>
          </div>
        )}

        {/* Settings */}
        <section className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Mode
            </div>
            <div className="flex gap-1.5">
              {(["numbers", "words", "math"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 h-10 rounded-lg text-sm transition ${
                    mode === m
                      ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "numbers" ? "#" : m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Every
            </div>
            <div className="flex gap-1.5">
              {([3, 5, 10] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setIntervalSec(s)}
                  className={`flex-1 h-10 rounded-lg text-sm transition ${
                    interval === s
                      ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Session stats */}
        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              total
            </div>
            <div className="text-xl font-mono tabular-nums text-foreground">
              {result.total}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              passed
            </div>
            <div className="text-xl font-mono tabular-nums text-foreground">
              {result.passed}
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              failed
            </div>
            <div className="text-xl font-mono tabular-nums text-destructive">
              {result.failed}
            </div>
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={togglePlay}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6 ml-0.5" />
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
