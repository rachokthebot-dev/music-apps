"use client";

// R3 Mental Rehearsal — silent visualization with metronome.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R3"
//
// Strongest empirical evidence of the seven techniques (Driskell et al. 1994
// meta-analysis d=0.53; Kosslyn et al. 2006 fMRI). Ironically the simplest
// to build — no audio, just a metronome and a scrolling timeline.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { useMetronome } from "@/hooks/useMetronome";
import { defaultStub, type StubSection } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

const CUE_PROMPTS = [
  "Hear the chord, not your fingers.",
  "Feel the downbeat.",
  "See the shape on the fretboard.",
  "Quiet the hands.",
  "Notice the breath between phrases.",
  "Trust the next note.",
];

const SECONDS_PER_CUE = 8; // rotate cue every ~8 bars; we use seconds here

export default function MentalRehearsalPage() {
  const [playing, setPlaying] = useState(false);
  const [showChords, setShowChords] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sections, setSections] = useState<StubSection[]>([]);
  const [cueIndex, setCueIndex] = useState(0);

  // Silent audio element ref — useMetronome needs an audioRef even though
  // we're standalone. Pass a null ref; standalone mode short-circuits reads.
  const nullAudioRef = useRef<HTMLAudioElement | null>(null);

  // Lazy-load sections from song-a.json
  useEffect(() => {
    let cancelled = false;
    fetch(defaultStub.jsonUrl)
      .then((r) => r.json())
      .then((data: { sections?: Array<Omit<StubSection, "id" | "orderIndex">> }) => {
        if (cancelled || !data.sections) return;
        setSections(
          data.sections.map((s, i) => ({
            ...s,
            id: `s${i}`,
            orderIndex: i,
          }))
        );
      })
      .catch(() => {
        // Silent — page still works with no section overlay
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Drive elapsed time with rAF while playing
  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setElapsedSec((t) => {
        const next = t + dt;
        // loop back to 0 at song end
        return next >= defaultStub.durationSec ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Rotate cue
  useEffect(() => {
    if (!playing) return;
    const next = Math.floor(elapsedSec / SECONDS_PER_CUE) % CUE_PROMPTS.length;
    setCueIndex(next);
  }, [elapsedSec, playing]);

  useMetronome({
    bpm: defaultStub.bpm,
    enabled: playing,
    volume: 0.6,
    playing,
    audioRef: nullAudioRef,
    tempo: 1.0,
    standalone: true,
  });

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const reset = useCallback(() => {
    setElapsedSec(0);
    setCueIndex(0);
  }, []);

  const currentSection = sections.find(
    (s) => elapsedSec >= s.startSec && elapsedSec < s.endSec
  );
  const currentBar =
    Math.floor((elapsedSec * defaultStub.bpm) / (60 * defaultStub.beatsPerBar)) + 1;
  const totalBars = Math.floor(
    (defaultStub.durationSec * defaultStub.bpm) / (60 * defaultStub.beatsPerBar)
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Mental Rehearsal" requirementId="R3" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Chord overlay toggle (top right) */}
        <div className="flex items-center justify-end gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showChords}
              onChange={(e) => setShowChords(e.target.checked)}
              className="accent-[var(--sandbox-accent)]"
            />
            Chord overlay
          </label>
        </div>

        {/* Chord overlay (placeholder — song-a.json has no chord data so we
            invent generic guitar chords by section. Real impl would consume
            chord data emitted by analyze.py.) */}
        {showChords && currentSection && (
          <div className="text-center">
            <span className="font-mono text-3xl text-foreground/40">
              ⌐ ───── {sectionChordHint(currentSection.name)} ───── ¬
            </span>
          </div>
        )}

        {/* Timeline */}
        <section className="flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Timeline
          </div>
          <div className="relative h-12 bg-muted/40 rounded-lg overflow-hidden">
            {sections.map((s, i) => (
              <div
                key={s.id}
                className="absolute top-0 bottom-0 border-r border-border/50 flex items-end justify-center pb-1"
                style={{
                  left: `${(s.startSec / defaultStub.durationSec) * 100}%`,
                  width: `${
                    ((s.endSec - s.startSec) / defaultStub.durationSec) * 100
                  }%`,
                  backgroundColor: sectionTint(i),
                }}
              >
                <span className="text-[9px] uppercase tracking-wider text-foreground/60 truncate px-1">
                  {s.name}
                </span>
              </div>
            ))}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground transition-transform"
              style={{
                left: `${(elapsedSec / defaultStub.durationSec) * 100}%`,
              }}
              aria-hidden
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>
              Bar {currentBar} of {totalBars}
            </span>
            <span>{currentSection?.name ?? "—"}</span>
          </div>
        </section>

        {/* Metronome row */}
        <section className="flex items-center justify-center gap-4 py-2">
          <div className="font-mono text-sm tabular-nums text-foreground">
            ♩ = {defaultStub.bpm}
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: defaultStub.beatsPerBar }).map((_, i) => (
              <span
                key={i}
                className={`size-2 rounded-full ${
                  i === 0 ? "bg-foreground" : "bg-foreground/40"
                }`}
                aria-hidden
              />
            ))}
          </div>
        </section>

        {/* Guided cue */}
        <section className="text-center min-h-[3rem] flex items-center justify-center">
          <p className="text-base italic text-foreground/70 max-w-xs transition-opacity duration-300">
            {playing ? CUE_PROMPTS[cueIndex] : "Put the instrument down. Close your eyes."}
          </p>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={reset}
            className="size-9 md:size-11 rounded-full border border-border bg-card flex items-center justify-center active:scale-90 transition"
            aria-label="Reset"
          >
            <RotateCcw className="size-4" />
          </button>
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
          <div className="size-9 md:size-11" aria-hidden />
        </div>

        <footer className="mt-6 text-xs text-muted-foreground text-center">
          Mental rehearsal has the strongest empirical evidence of the seven
          techniques. Use after the motor pattern is learned, with an external
          reference (score, video) to prevent error reinforcement.
        </footer>
      </main>
    </div>
  );
}

function sectionTint(i: number): string {
  // Subtle bands keyed to section index; transparent so the playhead reads cleanly.
  const tints = [
    "oklch(0.7 0.05 280 / 0.15)",
    "oklch(0.7 0.05 200 / 0.15)",
    "oklch(0.7 0.05 140 / 0.15)",
    "oklch(0.7 0.05 60 / 0.15)",
    "oklch(0.7 0.05 20 / 0.15)",
    "oklch(0.7 0.05 320 / 0.15)",
  ];
  return tints[i % tints.length];
}

function sectionChordHint(name: string): string {
  // Stub chord hints by section type — placeholder until analyze.py emits chord data.
  const lower = name.toLowerCase();
  if (lower.includes("intro")) return "Am";
  if (lower.includes("verse")) return "G";
  if (lower.includes("chorus")) return "C";
  if (lower.includes("solo")) return "Dm";
  if (lower.includes("bridge")) return "F";
  if (lower.includes("outro")) return "Am";
  return "?";
}
