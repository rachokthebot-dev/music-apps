"use client";

// R5 Vocal Integration — sing the line over the backing track.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R5"
//
// Three pre-mixed combinations swapped via <audio.src> on a single audio
// element to avoid the iPad-Safari 4-stream drift problem. This approach
// does NOT survive to v1 — v1 will use AudioBufferSourceNode-based per-stem
// control sharing a single AudioContext clock.
//
// George Benson attribution dropped from framing per research review (it's
// post-hoc rationalization, not causal evidence). Cognitive-overload caveat
// for novices applied via inline note.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

type StemMix = "all" | "no_vocals" | "vocals_only";

const MIXES: Array<{
  id: StemMix;
  label: string;
  sub: string;
  emphasized: boolean;
}> = [
  { id: "all", label: "All stems", sub: "full song, reference", emphasized: false },
  {
    id: "no_vocals",
    label: "No vocals — sing the lead",
    sub: "backing track only",
    emphasized: true,
  },
  {
    id: "vocals_only",
    label: "Vocals only",
    sub: "isolate the lead phrase",
    emphasized: false,
  },
];

export default function VocalIntegrationPage() {
  const { audioRef, playing, play, pause, swapSrc } = useStubPlayer(defaultStub);
  const [mix, setMix] = useState<StemMix>("all");
  const [stemsReady, setStemsReady] = useState<boolean | null>(null);
  const requestIdRef = useRef(0);

  // Check whether stems have been prepped (HEAD probe)
  useEffect(() => {
    let cancelled = false;
    fetch("/shreddy/api/sandbox/variant?stubId=song-a&kind=stems&name=no_vocals", {
      method: "HEAD",
    })
      .then((r) => {
        if (!cancelled) setStemsReady(r.ok);
      })
      .catch(() => {
        if (!cancelled) setStemsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = useCallback(
    async (next: StemMix) => {
      if (next === mix) return;
      const myId = ++requestIdRef.current;
      setMix(next);
      const url = `/shreddy/api/sandbox/variant?stubId=song-a&kind=stems&name=${next}`;
      try {
        await swapSrc(url);
        if (myId !== requestIdRef.current) return;
        if (audioRef.current) audioRef.current.preservesPitch = true;
      } catch (err) {
        if (myId !== requestIdRef.current) return;
        console.error("stem swap failed:", err);
      }
    },
    [mix, swapSrc, audioRef]
  );

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, play, pause]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Vocal Integration" requirementId="R5" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Stems-ready state */}
        {stemsReady === false && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-foreground font-medium">
              Stems not generated yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Run{" "}
              <code className="font-mono">
                apps/scripts/prep-sandbox-variants.sh stems
              </code>{" "}
              once. Takes ~30-90s on M-series. Demucs + ffmpeg required.
            </p>
          </div>
        )}

        {/* Three mix radio rows */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Playback
          </div>
          <div className="flex flex-col gap-2">
            {MIXES.map((m) => (
              <button
                key={m.id}
                onClick={() => void handlePick(m.id)}
                disabled={stemsReady === false}
                className={`text-left p-3 rounded-lg flex items-start gap-3 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                  mix === m.id
                    ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60"
                    : "border border-border hover:border-border/80"
                } ${m.emphasized && mix !== m.id ? "border-foreground/30" : ""}`}
              >
                <span
                  className={`mt-1 size-4 rounded-full border-2 shrink-0 ${
                    mix === m.id
                      ? "border-foreground bg-foreground"
                      : "border-muted-foreground"
                  }`}
                />
                <div className="flex-1">
                  <div
                    className={`text-sm ${
                      m.emphasized ? "text-foreground font-medium" : "text-foreground"
                    }`}
                  >
                    {m.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={togglePlay}
            disabled={stemsReady !== true}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition disabled:opacity-50"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="size-6" />
            ) : (
              <Play className="size-6 ml-0.5" />
            )}
          </button>
        </div>

        <footer className="mt-4 text-xs text-muted-foreground text-center">
          Pedagogy note: intermediate-and-above only. Singing while playing
          adds cognitive load that impairs initial motor learning for novices
          (Sweller 1988). Stage incrementally — sing to recording first, then
          add the instrument.
        </footer>
      </main>
    </div>
  );
}
