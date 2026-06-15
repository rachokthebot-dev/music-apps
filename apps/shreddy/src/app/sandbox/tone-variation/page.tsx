"use client";

// R7 Tone Variation — pre-rendered EQ presets.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R7"
//
// CAVEAT (pedagogy): Tone variation as a practice technique has ZERO published
// research backing. Key variation is validated (Royer 1994); tone variation is
// novel speculation. The header banner makes this clear so grading evaluates
// the UX, not whether the technique compounds learning.

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Play, Pause, X } from "lucide-react";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

type Tone = "clean" | "dirty" | "dry" | "wet";

const TONES: Tone[] = ["clean", "dirty", "dry", "wet"];

export default function ToneVariationPage() {
  const { audioRef, playing, play, pause, swapSrc } = useStubPlayer(defaultStub);
  const [tone, setTone] = useState<Tone | null>(null);
  const [showCaveat, setShowCaveat] = useState(true);
  const requestIdRef = useRef(0);

  const handlePick = useCallback(
    async (next: Tone) => {
      if (next === tone) return;
      const myId = ++requestIdRef.current;
      setTone(next);
      const url = `/shreddy/api/sandbox/variant?stubId=song-a&kind=tone&name=${next}`;
      try {
        await swapSrc(url);
        if (myId !== requestIdRef.current) return;
        if (audioRef.current) audioRef.current.preservesPitch = true;
      } catch (err) {
        if (myId !== requestIdRef.current) return;
        console.error("tone swap failed:", err);
      }
    },
    [tone, swapSrc, audioRef]
  );

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, play, pause]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Tone Variation" requirementId="R7" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Pedagogy caveat — required per research review */}
        {showCaveat && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--sandbox-accent)]/30 bg-[var(--sandbox-accent)]/5">
            <AlertTriangle className="size-5 text-[var(--sandbox-accent)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-foreground font-medium">
                No published research backing.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Key variation has direct music evidence (Royer &amp; Sinatra
                1994). Tone variation as a practice technique is novel
                speculation — testing UX here, not pedagogy. Risk: tone change
                can mask timing/intonation issues.
              </p>
            </div>
            <button
              onClick={() => setShowCaveat(false)}
              className="text-muted-foreground hover:text-foreground active:scale-95 transition"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* 2x2 tone preset grid */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Tone Preset
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => void handlePick(t)}
                className={`aspect-square rounded-xl flex items-center justify-center text-lg font-sans tracking-tight transition active:scale-95 ${
                  tone === t
                    ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60 text-foreground"
                    : "border border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={togglePlay}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition disabled:opacity-50"
            disabled={tone === null}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6 ml-0.5" />
            )}
          </button>
        </div>

        {tone === null && (
          <p className="text-center text-xs text-muted-foreground">
            Pick a tone to begin.
          </p>
        )}
      </main>
    </div>
  );
}
