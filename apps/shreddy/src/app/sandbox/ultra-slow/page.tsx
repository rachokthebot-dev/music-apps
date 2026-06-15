"use client";

// R1 Ultra-Slow Tempo — server-rendered playback below 0.5×.
// Plan: docs/plans/2026-06-15-001-feat-shreddy-deep-practice-sandbox-plan.md §"R1"
//
// HTMLAudioElement.playbackRate clamps at 0.5 on Safari — for true ultra-slow
// we round-trip through the server via /api/sandbox/tempo (chained atempo or
// rubberband filter, cached on disk).

import { useCallback, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { useStubPlayer } from "@/hooks/useStubPlayer";
import { defaultStub } from "@/app/sandbox/mock-data";
import { SandboxHeader } from "@/app/sandbox/_components/SandboxHeader";

const SERVER_TIER = [0.1, 0.2, 0.3, 0.4] as const;
const LIVE_TIER = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;

type SwapState =
  | { kind: "idle" }
  | { kind: "rendering"; multiplier: number; controller: AbortController }
  | { kind: "playing"; multiplier: number };

export default function UltraSlowPage() {
  const { audioRef, playing, currentTime, play, pause, swapSrc } =
    useStubPlayer(defaultStub);
  const [tempo, setTempo] = useState(1.0);
  const [swap, setSwap] = useState<SwapState>({ kind: "idle" });
  const requestIdRef = useRef(0);

  const handlePick = useCallback(
    async (multiplier: number) => {
      if (multiplier === tempo) return;
      const myId = ++requestIdRef.current;

      // Live-tier: just set playbackRate on the existing audio element.
      if (multiplier >= 0.5) {
        // Cancel any pending render
        if (swap.kind === "rendering") swap.controller.abort();
        const a = audioRef.current;
        if (a) {
          a.playbackRate = multiplier;
          a.preservesPitch = true;
        }
        setTempo(multiplier);
        setSwap({ kind: "playing", multiplier });
        return;
      }

      // Server-rendered tier
      if (swap.kind === "rendering") swap.controller.abort();
      const controller = new AbortController();
      setSwap({ kind: "rendering", multiplier, controller });
      setTempo(multiplier);

      try {
        const res = await fetch("/shreddy/api/sandbox/tempo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stubId: defaultStub.id, multiplier }),
          signal: controller.signal,
        });
        if (myId !== requestIdRef.current) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "render failed" }));
          throw new Error(typeof err.error === "string" ? err.error : "render failed");
        }
        const { url } = (await res.json()) as { ok: boolean; url: string };
        if (myId !== requestIdRef.current) return;
        await swapSrc(url);
        if (myId !== requestIdRef.current) return;
        // playbackRate stays at 1.0 — the file IS the slowed audio
        if (audioRef.current) {
          audioRef.current.playbackRate = 1.0;
          audioRef.current.preservesPitch = true;
        }
        setSwap({ kind: "playing", multiplier });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (myId !== requestIdRef.current) return;
        console.error("ultra-slow render failed:", err);
        setSwap({ kind: "idle" });
      }
    },
    [tempo, swap, swapSrc, audioRef]
  );

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, play, pause]);

  const rendering = swap.kind === "rendering";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SandboxHeader technique="Ultra-Slow Tempo" requirementId="R1" />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Tempo readout */}
        <section className="text-center">
          <div className="text-5xl font-mono tabular-nums text-foreground">
            {tempo.toFixed(2)}×
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {tempo >= 0.5 ? "live playbackRate" : "server-rendered"}
            {rendering && " · preparing…"}
          </div>
        </section>

        {/* Server-rendered tier (with muted band per design) */}
        <section className="rounded-xl bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Re-rendered tier — slower load
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SERVER_TIER.map((v) => (
              <TempoButton
                key={v}
                value={v}
                active={tempo === v}
                disabled={rendering}
                onClick={() => void handlePick(v)}
              />
            ))}
          </div>
        </section>

        {/* Live playbackRate tier */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Live tier
          </div>
          <div className="grid grid-cols-6 gap-2">
            {LIVE_TIER.map((v) => (
              <TempoButton
                key={v}
                value={v}
                active={tempo === v}
                disabled={rendering}
                onClick={() => void handlePick(v)}
              />
            ))}
          </div>
        </section>

        {/* Transport */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <div className="size-9 md:size-11" aria-hidden />
          <button
            onClick={togglePlay}
            className="size-16 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition disabled:opacity-50"
            disabled={rendering}
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

        {/* Position readout */}
        <div className="text-center text-xs font-mono tabular-nums text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(defaultStub.durationSec)}
        </div>

        <footer className="mt-4 text-xs text-muted-foreground text-center">
          Floor 0.40× per motor-learning research (Schmidt &amp; Lee 2011) —
          below this, timing decouples from auditory processing.
        </footer>
      </main>
    </div>
  );
}

function TempoButton({
  value,
  active,
  disabled,
  onClick,
}: {
  value: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-10 sm:h-11 rounded-lg font-mono tabular-nums text-sm transition active:scale-95 ${
        active
          ? "bg-card ring-2 ring-[var(--sandbox-accent)]/60 text-foreground"
          : "border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {value.toFixed(2)}
    </button>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
