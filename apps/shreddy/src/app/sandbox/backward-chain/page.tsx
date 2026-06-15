"use client";

// R2 Backward Chaining — auto-drill from the end of a section outward.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R2"
//
// Royer & Sinatra (1994) is the foundational study (n=24, piano). Default
// reps per stage = 5 (lower bound of their 5-10 range; tune during grading).
//
// Visual: a single timeline bar with a shaded region that grows leftward
// each stage advance. transition-[left,width] handles the motion.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ChevronRight } from "lucide-react";
import { useBackwardChain } from "@/hooks/useBackwardChain";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub, type StubSection } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

export default function BackwardChainPage() {
  const { audioRef, playing, currentTime, play, pause } = useStubPlayer(defaultStub);
  const [sections, setSections] = useState<StubSection[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [barsToStart, setBarsToStart] = useState(4);
  const [repsPerStage, setRepsPerStage] = useState(5);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const justCompletedRef = useRef(false);

  // Load sections
  useEffect(() => {
    fetch(defaultStub.jsonUrl)
      .then((r) => r.json())
      .then((data: { sections?: Array<Omit<StubSection, "id" | "orderIndex">> }) => {
        if (!data.sections) return;
        const list = data.sections.map((s, i) => ({
          ...s,
          id: `s${i}`,
          orderIndex: i,
        }));
        setSections(list);
        // Default to second section if available — gives a meaningful starting
        // point relative to the song.
        setSectionId(list[1]?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const section = sections.find((s) => s.id === sectionId);

  const chain = useBackwardChain({
    sectionStart: section?.startSec ?? 0,
    sectionEnd: section?.endSec ?? 0,
    bpm: defaultStub.bpm,
    beatsPerBar: defaultStub.beatsPerBar,
    initialBarsFromEnd: barsToStart,
    repsPerStage,
    autoAdvance,
  });

  // Detect loop completion via timeupdate. When currentTime crosses the
  // loop's B boundary, seek back to A and fire notifyLoopCompleted.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || chain.state.status !== "running") return;
    const { loop } = chain.state;

    let lastCheckTime = a.currentTime;
    let raf: number;
    const tick = () => {
      const t = a.currentTime;
      if (lastCheckTime < loop.b && t >= loop.b) {
        // Crossed B → loop back
        a.currentTime = loop.a;
        chain.notifyLoopCompleted();
        justCompletedRef.current = true;
      } else if (t < loop.a - 0.05 || t > loop.b + 0.05) {
        // Audio outside loop range; seek to A
        a.currentTime = loop.a;
      }
      lastCheckTime = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chain, audioRef]);

  const handleStart = useCallback(() => {
    if (!section) return;
    if (chain.state.status === "idle" || chain.state.status === "completed") {
      chain.start();
    }
    if (audioRef.current) {
      const initialLoop = {
        a: Math.max(
          section.startSec,
          section.endSec - ((60 / defaultStub.bpm) * defaultStub.beatsPerBar) * barsToStart
        ),
        b: section.endSec,
      };
      audioRef.current.currentTime = initialLoop.a;
    }
    void play();
  }, [section, chain, audioRef, barsToStart, play]);

  const handleTogglePlay = useCallback(() => {
    if (playing) pause();
    else handleStart();
  }, [playing, pause, handleStart]);

  const handleReset = useCallback(() => {
    pause();
    chain.reset();
  }, [chain, pause]);

  if (!section) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SandboxHeader technique="Backward Chaining" requirementId="R2" />
        <main className="flex-1 p-6 text-sm text-muted-foreground">
          Loading sections from song-a.json…
        </main>
      </div>
    );
  }

  const sectionDurationSec = section.endSec - section.startSec;
  const secPerBar = (60 / defaultStub.bpm) * defaultStub.beatsPerBar;
  const sectionBars = Math.max(1, Math.floor(sectionDurationSec / secPerBar));

  // Current loop window (for the timeline visualization)
  const currentLoop =
    chain.state.status === "running" || chain.state.status === "between-stages"
      ? chain.state.status === "running"
        ? chain.state.loop
        : chain.state.nextLoop
      : null;

  const loopStartPct = currentLoop
    ? ((currentLoop.a - section.startSec) / sectionDurationSec) * 100
    : 100;
  const loopWidthPct = currentLoop
    ? ((currentLoop.b - currentLoop.a) / sectionDurationSec) * 100
    : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Backward Chaining" requirementId="R2" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Section picker */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Section
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSectionId(s.id);
                  chain.reset();
                }}
                className={`px-3 h-9 rounded-lg text-sm transition active:scale-95 ${
                  sectionId === s.id
                    ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>

        {/* Schedule + Current stage */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Schedule controls */}
          <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Schedule
            </div>
            <NumberField
              label="Bars to start"
              value={barsToStart}
              min={1}
              max={Math.max(1, sectionBars)}
              onChange={(v) => {
                setBarsToStart(v);
                chain.reset();
              }}
            />
            <NumberField
              label="Reps per stage"
              value={repsPerStage}
              min={1}
              max={20}
              onChange={(v) => {
                setRepsPerStage(v);
                chain.reset();
              }}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="accent-[var(--sandbox-accent)]"
              />
              Auto-advance
            </label>
          </div>

          {/* Current stage indicator */}
          <div className="rounded-xl border border-border p-4 flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current stage
            </div>
            {chain.state.status === "idle" && (
              <div className="text-sm text-muted-foreground">
                Idle — press play to start.
              </div>
            )}
            {chain.state.status === "running" && (
              <>
                <div className="text-2xl font-mono tabular-nums text-foreground">
                  {chain.state.stage} of {chain.totalStages}
                </div>
                <div className="text-sm text-muted-foreground">
                  Bars from end:{" "}
                  <span className="font-mono">{chain.state.barsFromEnd}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Reps left:{" "}
                  <span className="font-mono">{chain.state.repsLeft}</span> /{" "}
                  {repsPerStage}
                </div>
                <ProgressBar
                  value={(repsPerStage - chain.state.repsLeft) / repsPerStage}
                />
              </>
            )}
            {chain.state.status === "between-stages" && (
              <>
                <div className="text-sm text-foreground">
                  Stage {chain.state.completedStage} done. Next: bars{" "}
                  {chain.state.nextBarsFromEnd} from end.
                </div>
                <button
                  onClick={() => chain.advanceStage()}
                  className="inline-flex items-center justify-center gap-1 h-10 rounded-lg bg-foreground text-background text-sm active:scale-95 transition"
                >
                  Next stage <ChevronRight className="size-4" />
                </button>
              </>
            )}
            {chain.state.status === "completed" && (
              <div className="text-sm text-foreground">
                All {chain.state.totalStages} stages complete. ✓
              </div>
            )}
          </div>
        </section>

        {/* Timeline */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Timeline
          </div>
          <div className="relative h-12 bg-muted/40 rounded-lg overflow-hidden">
            {/* Bar count axis */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: sectionBars }).map((_, i) => (
                <div
                  key={i}
                  className="border-r border-border/20 flex-1"
                  aria-hidden
                />
              ))}
            </div>
            {/* Shaded current-loop region */}
            {currentLoop && (
              <div
                className="absolute top-0 bottom-0 bg-[var(--sandbox-accent)]/30 transition-all duration-300 ease-out"
                style={{
                  left: `${loopStartPct}%`,
                  width: `${loopWidthPct}%`,
                }}
                aria-hidden
              />
            )}
            {/* Playhead */}
            {playing && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                style={{
                  left: `${Math.max(0, Math.min(100, ((currentTime - section.startSec) / sectionDurationSec) * 100))}%`,
                }}
                aria-hidden
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground mt-1">
            <span>Bar 1</span>
            <span>Bar {sectionBars}</span>
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={handleReset}
            disabled={chain.state.status === "idle"}
            className="size-9 md:size-11 rounded-full border border-border bg-card flex items-center justify-center active:scale-90 transition disabled:opacity-30"
            aria-label="Reset"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            onClick={handleTogglePlay}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6 ml-0.5" />
            )}
          </button>
          <div className="size-9 md:size-11" aria-hidden />
        </div>

        <footer className="mt-4 text-xs text-muted-foreground text-center">
          Default reps = 5 (Royer &amp; Sinatra 1994: 5–10 range). Drill the
          last 4 bars first; expand backward each stage. Watch for awkward
          timing at section joins — common failure mode (1994 paper notes).
        </footer>
      </main>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="inline-flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="size-7 rounded-md border border-border text-foreground active:scale-90 transition"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="w-12 text-center font-mono text-sm tabular-nums bg-transparent border border-border rounded-md h-7 outline-none focus:border-[var(--sandbox-accent)]/60"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="size-7 rounded-md border border-border text-foreground active:scale-90 transition"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-foreground transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
