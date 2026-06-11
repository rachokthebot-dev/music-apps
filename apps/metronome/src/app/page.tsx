"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Square, Hand, Sun, Moon, Timer, RotateCcw } from "lucide-react";
import { AppSwitcher } from "@music-apps/shared/app-switcher";
import { useMetronome } from "@/hooks/useMetronome";

const TIME_SIGNATURES = [
  { label: "4/4", beats: 4 },
  { label: "3/4", beats: 3 },
  { label: "6/8", beats: 6 },
] as const;

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
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [customTimerMin, setCustomTimerMin] = useState(0);
  const [customTimerSec, setCustomTimerSec] = useState(0);
  const [isDark, setIsDark] = useState(false);

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
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "metronome-settings",
        JSON.stringify({ bpm, timeSigIndex, timerSeconds })
      );
    } catch {}
  }, [bpm, timeSigIndex, timerSeconds]);

  // Dark mode sync
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }, [isDark]);

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

  return (
    <div className="h-full flex flex-col select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4 shrink-0">
        <h1 className="text-lg lg:text-xl font-bold tracking-tight">Metronome</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg bg-secondary text-secondary-foreground hover:bg-accent transition-colors flex items-center justify-center"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 lg:w-5 lg:h-5" /> : <Moon className="w-4 h-4 lg:w-5 lg:h-5" />}
          </button>
          <AppSwitcher currentAppId="metronome" />
        </div>
      </header>

      {/* Main content — centered, no scroll */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 pb-4 min-h-0">
        <div className="w-full max-w-2xl flex flex-col items-center gap-4 lg:gap-6">

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
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary hover:bg-accent transition-colors flex items-center gap-1"
                  title="Reset to slider BPM"
                >
                  <RotateCcw className="w-3 h-3" /> tap
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
                <Timer className="w-5 h-5 lg:w-6 lg:h-6" />
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
            <div className="flex rounded-xl border border-border overflow-hidden">
              {TIME_SIGNATURES.map((ts, i) => (
                <button
                  key={ts.label}
                  onClick={() => !isPlaying && setTimeSigIndex(i)}
                  disabled={isPlaying}
                  className={`px-5 py-3 lg:px-6 lg:py-3.5 text-base lg:text-lg font-semibold transition-colors ${
                    i === timeSigIndex
                      ? "bg-foreground text-background ring-2 ring-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-50"
                  }`}
                >
                  {ts.label}
                </button>
              ))}
            </div>

            {/* Tap tempo */}
            <button
              onClick={handleTapTempo}
              className="flex items-center gap-2 px-5 py-2.5 lg:px-6 lg:py-3 rounded-xl border border-border bg-secondary text-secondary-foreground hover:bg-accent active:scale-95 transition-all text-sm lg:text-base font-semibold"
            >
              <Hand className="w-4 h-4 lg:w-5 lg:h-5" />
              Tap
            </button>
          </div>

          {/* Timer presets */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Timer className="w-3.5 h-3.5" />
              Timer
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => !isPlaying && setTimerSeconds(preset.seconds)}
                  disabled={isPlaying}
                  className={`px-4 py-2 lg:px-5 lg:py-2.5 rounded-xl text-sm lg:text-base font-medium transition-colors ${
                    timerSeconds === preset.seconds
                      ? "bg-foreground text-background"
                      : "bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              {/* Custom timer */}
              <div className="flex items-center gap-1 bg-secondary rounded-xl px-3 py-1.5">
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
                  className="text-xs lg:text-sm px-2 py-1 rounded-lg bg-foreground/10 hover:bg-foreground/20 transition-colors font-medium disabled:opacity-50"
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* Play/Stop button */}
          <button
            onClick={toggle}
            className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-lg ${
              isPlaying
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-foreground text-background hover:bg-foreground/90"
            }`}
          >
            {isPlaying ? (
              <Square className="w-8 h-8 lg:w-12 lg:h-12" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8 lg:w-12 lg:h-12 ml-1" fill="currentColor" />
            )}
          </button>

        </div>
      </main>
    </div>
  );
}
