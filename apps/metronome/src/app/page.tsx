"use client";

import { useState, useEffect, useCallback } from "react";
import { PlayIcon, StopIcon, HandTapIcon, MetronomeIcon, TimerIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { AppShell, SidebarItem, SidebarMenuButton } from "@music-apps/shared/app-shell";
import { useMetronome, type MetronomePattern } from "@/hooks/useMetronome";

const TIME_SIGNATURES = [
  { label: "4/4", beats: 4 },
  { label: "3/4", beats: 3 },
  { label: "6/8", beats: 6 },
] as const;

// R4 Rhythmic Alternation patterns. Glyphs mirror common notation: a single
// note for straight, a dotted-eighth + sixteenth pair for the dotted feels,
// and a triplet bracket for the triplet.
const PATTERNS: { value: MetronomePattern; label: string; desc: string }[] = [
  { value: "straight", label: "♩", desc: "Straight" },
  { value: "dotted-fwd", label: "♩.♬", desc: "Dotted →" },
  { value: "dotted-rev", label: "♬♩.", desc: "Dotted ←" },
  { value: "triplet", label: "♪³", desc: "Triplet" },
];

const TIMER_PRESETS = [
  { label: "Off", seconds: 0 },
  { label: "1m", seconds: 60 },
  { label: "2m", seconds: 120 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
] as const;

const MIN_BPM = 40;
const MAX_BPM = 320;
const VOLUME = 0.8;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MetronomePage() {
  const [bpm, setBpm] = useState(120);
  const [timeSigIndex, setTimeSigIndex] = useState(0);
  const [pattern, setPattern] = useState<MetronomePattern>("straight");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [customTimerMin, setCustomTimerMin] = useState(0);
  const [customTimerSec, setCustomTimerSec] = useState(0);

  const timeSig = TIME_SIGNATURES[timeSigIndex];

  const {
    isPlaying,
    currentBeat,
    timerRemaining,
    isFadingOut,
    tappedBpm,
    toggle,
    handleTapTempo,
    clearTappedBpm,
  } = useMetronome({
    bpm,
    volume: VOLUME,
    beatsPerMeasure: timeSig.beats,
    pattern,
    timerDuration: timerSeconds,
  });

  // Persist settings to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("metronome-settings");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.bpm) setBpm(Math.min(MAX_BPM, s.bpm));
        if (s.timeSigIndex !== undefined) setTimeSigIndex(s.timeSigIndex);
        if (s.timerSeconds !== undefined) setTimerSeconds(s.timerSeconds);
        if (s.pattern && PATTERNS.some((p) => p.value === s.pattern)) {
          setPattern(s.pattern as MetronomePattern);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "metronome-settings",
        JSON.stringify({ bpm, timeSigIndex, pattern, timerSeconds })
      );
    } catch {}
  }, [bpm, timeSigIndex, pattern, timerSeconds]);


  // Apply tapped BPM to slider when tapped
  useEffect(() => {
    if (tappedBpm !== null) {
      setBpm(tappedBpm);
    }
  }, [tappedBpm]);

  const handleCustomTimerApply = useCallback(() => {
    const total = customTimerMin * 60 + customTimerSec;
    setTimerSeconds(total);
  }, [customTimerMin, customTimerSec]);

  const effectiveBpm = tappedBpm ?? bpm;

  // One segmented-control look for every picker, the same as LickBank's tabs.
  const segment = (active: boolean) =>
    `h-11 lg:h-12 px-4 lg:px-5 rounded-xl text-sm lg:text-base font-semibold transition-all duration-300 ease-spring disabled:opacity-50 ${
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <AppShell
      appId="metronome"
      title="Metronome"
      sidebar={<SidebarItem active icon={<MetronomeIcon className="size-5" weight="fill" />} label="Metronome" />}
    >
      <div className="h-dvh flex flex-col select-none">
        {/* Header — the sidebar holds the name from iPad landscape up */}
        <header className="flex items-center gap-1 px-4 py-3 shrink-0 lg:hidden">
          <SidebarMenuButton />
          <h1 className="text-xl font-semibold tracking-tight">Metronome</h1>
        </header>

        {/* Main content — centered, no scroll */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-4 min-h-0">
          <div className="w-full max-w-2xl flex flex-col items-center gap-4 lg:gap-5">

            {/* BPM Display */}
            <div className="text-center">
              <div className="text-7xl lg:text-9xl font-black tabular-nums leading-none tracking-tighter">
                {effectiveBpm}
              </div>
              <div className="text-sm lg:text-base text-muted-foreground mt-1 flex items-center justify-center gap-2">
                BPM
                {tappedBpm !== null && (
                  <button
                    onClick={() => { clearTappedBpm(); }}
                    className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-accent transition-colors flex items-center gap-1"
                    title="Reset to slider BPM"
                  >
                    <ArrowCounterClockwiseIcon className="size-3" /> tap
                  </button>
                )}
              </div>
            </div>

            {/* Beat indicators */}
            <div className="flex items-center justify-center gap-3 lg:gap-4">
              {Array.from({ length: timeSig.beats }).map((_, i) => {
                const active = isPlaying && currentBeat === i;
                const color = active
                  ? i === 0
                    ? "bg-foreground border-transparent"
                    : "bg-foreground/60 border-transparent"
                  : "bg-transparent border-muted-foreground/40";
                const scale = active
                  ? i === 0
                    ? "scale-150"
                    : "scale-[1.35]"
                  : "scale-100";
                return (
                  <div
                    key={i}
                    className="w-4 h-4 lg:w-5 lg:h-5 flex items-center justify-center will-change-transform"
                  >
                    <div
                      className={`w-full h-full rounded-full border-2 transition-transform duration-[60ms] ease-out transform-gpu ${color} ${scale}`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Timer countdown — slot is always present so play state doesn't shift layout */}
            <div className="h-8 lg:h-10 flex items-center justify-center">
              {isPlaying && timerRemaining !== null && (
                <div className={`text-2xl lg:text-3xl font-semibold tabular-nums flex items-center gap-2 ${
                  isFadingOut ? "text-muted-foreground animate-pulse" : "text-foreground"
                }`}>
                  <TimerIcon className="size-5 lg:size-6" />
                  {formatTime(timerRemaining)}
                  {isFadingOut && <span className="text-sm text-muted-foreground">fading...</span>}
                </div>
              )}
            </div>

            {/* Tempo Slider */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>{MIN_BPM}</span>
                <span>Tempo</span>
                <span>{MAX_BPM}</span>
              </div>
              <input
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                value={tappedBpm ?? bpm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBpm(v);
                  if (tappedBpm !== null) clearTappedBpm();
                }}
                className="w-full h-3 lg:h-4 rounded-full appearance-none cursor-pointer bg-muted accent-foreground
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8
                  [&::-webkit-slider-thumb]:lg:w-10 [&::-webkit-slider-thumb]:lg:h-10
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground
                  [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-grab
                  [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:active:scale-110
                  [&::-webkit-slider-thumb]:transition-transform"
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3 lg:gap-4 flex-wrap justify-center">
              {/* Time signature selector */}
              <div className="flex p-1 rounded-2xl bg-muted">
                {TIME_SIGNATURES.map((ts, i) => (
                  <button
                    key={ts.label}
                    onClick={() => !isPlaying && setTimeSigIndex(i)}
                    disabled={isPlaying}
                    className={`${segment(i === timeSigIndex)} min-w-16 lg:text-lg`}
                  >
                    {ts.label}
                  </button>
                ))}
              </div>

              {/* Tap tempo */}
              <button
                onClick={handleTapTempo}
                className="h-[52px] lg:h-14 flex items-center gap-2 px-6 rounded-full bg-card border border-border hover:bg-muted active:scale-95 transition-all duration-200 ease-spring text-sm lg:text-base font-semibold"
              >
                <HandTapIcon className="size-5" />
                Tap
              </button>
            </div>

            {/* R4 Rhythm pattern picker — live-switchable while playing. */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                Rhythm
              </div>
              <div className="flex w-fit mx-auto p-1 rounded-2xl bg-muted">
                {PATTERNS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPattern(p.value)}
                    title={p.desc}
                    className={`${segment(pattern === p.value)} min-w-16`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timer presets */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <TimerIcon className="size-3.5" />
                Timer
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <div className="flex p-1 rounded-2xl bg-muted">
                  {TIMER_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => !isPlaying && setTimerSeconds(preset.seconds)}
                      disabled={isPlaying}
                      className={segment(timerSeconds === preset.seconds)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {/* Custom timer */}
                <div className="h-[52px] lg:h-14 flex items-center gap-1 bg-muted rounded-2xl pl-3 pr-1">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={customTimerMin}
                    onChange={(e) => setCustomTimerMin(Math.max(0, Math.min(99, Number(e.target.value))))}
                    disabled={isPlaying}
                    className="w-10 lg:w-12 text-center bg-transparent text-sm lg:text-base font-medium focus:outline-none disabled:opacity-50"
                    placeholder="m"
                  />
                  <span className="text-muted-foreground text-sm">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={customTimerSec}
                    onChange={(e) => setCustomTimerSec(Math.max(0, Math.min(59, Number(e.target.value))))}
                    disabled={isPlaying}
                    className="w-10 lg:w-12 text-center bg-transparent text-sm lg:text-base font-medium focus:outline-none disabled:opacity-50"
                    placeholder="s"
                  />
                  <button
                    onClick={handleCustomTimerApply}
                    disabled={isPlaying}
                    className="h-11 lg:h-12 px-4 rounded-xl bg-background text-sm lg:text-base font-semibold shadow-sm active:scale-95 transition-all duration-200 ease-spring disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>

            {/* Play/Stop button */}
            <button
              onClick={toggle}
              className={`relative w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center transition-all duration-300 ease-spring active:scale-95 shadow-lg bg-primary text-primary-foreground ${
                isPlaying ? "play-pulse" : ""
              }`}
            >
              {isPlaying ? (
                <StopIcon className="size-8 lg:size-12" weight="fill" />
              ) : (
                <PlayIcon className="size-8 lg:size-12 ml-1" weight="fill" />
              )}
            </button>

          </div>
        </main>
      </div>
    </AppShell>
  );
}
