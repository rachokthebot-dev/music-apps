"use client";

// R4 Rhythmic Alternation — dotted-feel + triplet metronome subdivisions.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R4"
//
// The technique: re-rhythm an even passage by playing along to a dotted-feel
// click. The audio source stays straight; only the click changes (or in mode
// "click only", the audio is muted entirely).
//
// Pedagogy: schema theory (Schmidt 1975) + jazz pedagogy consensus. No music-
// specific RCTs; effective in theory once base rhythm is internalized.

import { useCallback, useState } from "react";
import { Play, Pause } from "lucide-react";
import {
  useMetronomePattern,
  type MetronomePattern,
} from "@/hooks/useMetronomePattern";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

const RHYTHMS: Array<{
  id: MetronomePattern;
  glyph: string;
  label: string;
}> = [
  { id: "straight", glyph: "♩ ♩ ♩ ♩", label: "straight" },
  { id: "dotted-forward", glyph: "♩. ♪ ♩. ♪", label: "dotted-fwd" },
  { id: "dotted-reverse", glyph: "♪ ♩. ♪ ♩.", label: "dotted-rev" },
  { id: "triplet", glyph: "♪ ♪ ♪", label: "triplet" },
];

type PlaybackMode = "audio-and-click" | "click-only";

export default function RhythmicAlternationPage() {
  const [pattern, setPattern] = useState<MetronomePattern>("straight");
  const [mode, setMode] = useState<PlaybackMode>("audio-and-click");
  const stubPlayer = useStubPlayer(defaultStub);
  const [clickEnabled, setClickEnabled] = useState(false);

  useMetronomePattern({
    bpm: defaultStub.bpm,
    pattern,
    enabled: clickEnabled,
    volume: 0.6,
  });

  const togglePlay = useCallback(() => {
    if (clickEnabled) {
      // Stop both
      setClickEnabled(false);
      if (mode === "audio-and-click") stubPlayer.pause();
      return;
    }
    // Start
    setClickEnabled(true);
    if (mode === "audio-and-click") void stubPlayer.play();
  }, [clickEnabled, mode, stubPlayer]);

  // When mode changes mid-session, sync audio accordingly
  const changeMode = useCallback(
    (next: PlaybackMode) => {
      setMode(next);
      if (!clickEnabled) return;
      if (next === "click-only" && stubPlayer.playing) stubPlayer.pause();
      if (next === "audio-and-click" && !stubPlayer.playing) void stubPlayer.play();
    },
    [clickEnabled, stubPlayer]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Rhythmic Alternation" requirementId="R4" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Rhythm picker — 4 buttons in a row */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Rhythm
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {RHYTHMS.map((r) => (
              <button
                key={r.id}
                onClick={() => setPattern(r.id)}
                className={`h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition active:scale-95 ${
                  pattern === r.id
                    ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
                    : "border border-border hover:border-border/80"
                }`}
              >
                <span className="font-mono text-lg text-foreground">{r.glyph}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Playback mode — two large radio rows */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Playback Mode
          </div>
          <div className="flex flex-col gap-2">
            <ModeRow
              active={mode === "audio-and-click"}
              onClick={() => changeMode("audio-and-click")}
              label="Audio + click"
              sub="hear the song; the click is the new rhythm"
            />
            <ModeRow
              active={mode === "click-only"}
              onClick={() => changeMode("click-only")}
              label="Click only — audio muted"
              sub="re-rhythm by feel against the click alone"
            />
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={togglePlay}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition"
            aria-label={clickEnabled ? "Stop" : "Start"}
          >
            {clickEnabled ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6 ml-0.5" />
            )}
          </button>
        </div>

        <div className="text-center text-xs font-mono tabular-nums text-muted-foreground">
          ♩ = {defaultStub.bpm} BPM
        </div>

        <footer className="mt-4 text-xs text-muted-foreground text-center">
          Master the straight feel first. Schema theory (Schmidt 1975)
          predicts parametric variation builds flexible motor schemas — but
          only once the base rhythm is internalized.
        </footer>
      </main>
    </div>
  );
}

function ModeRow({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg flex items-start gap-3 transition active:scale-[0.99] ${
        active
          ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
          : "border border-border hover:border-border/80"
      }`}
    >
      <span
        className={`mt-1 size-4 rounded-full border-2 shrink-0 ${
          active
            ? "border-foreground bg-foreground"
            : "border-muted-foreground"
        }`}
      />
      <div>
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </button>
  );
}
