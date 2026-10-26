"use client";

/**
 * The practice transport, shared by the lick player and the clipper so both
 * views drive playback the same way. Presentational only — every piece of
 * state lives in the page, because what "loop" means differs (a whole lick
 * there, the current clip range here).
 *
 * It is one floating island rather than rows of small pills: on an iPad on a
 * music stand the controls you hit mid-take need thumb-sized targets in one
 * place. Tempo and count-in keep their less-used choices in popovers.
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowsClockwiseIcon,
  HandIcon,
  MinusIcon,
  MusicNotesSimpleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SkipBackIcon,
  TimerIcon,
  VideoCameraIcon,
  XIcon,
} from "@phosphor-icons/react";

export const SPEED_OPTIONS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

/** Count-in lengths in seconds; 0 means play starts straight away. */
export const COUNT_IN_OPTIONS = [0, 3, 4, 5];

// Lesson videos put the player on top and the tab underneath, so "Tab" and
// "Hands" are those halves cropped to fill the frame.
export const CROP_PRESETS = [
  { label: "Video", value: "full", style: {} },
  { label: "Tab", value: "bottom", style: { objectFit: "cover" as const, objectPosition: "bottom" } },
  { label: "Hands", value: "top", style: { objectFit: "cover" as const, objectPosition: "top" } },
] as const;

export type CropValue = typeof CROP_PRESETS[number]["value"];

const CROP_ICONS: Record<CropValue, typeof VideoCameraIcon> = {
  full: VideoCameraIcon,
  bottom: MusicNotesSimpleIcon,
  top: HandIcon,
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 0.7 → "0.7×", 0.75 → "0.75×", 1 → "1.0×". */
function formatSpeed(speed: number): string {
  return `${speed.toFixed(2).replace(/(\.\d)0$/, "$1")}×`;
}

/** The segmented Video / Tab / Hands control for the page header. */
export function ViewSwitch({ crop, onCrop }: { crop: CropValue; onCrop: (crop: CropValue) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-muted" role="radiogroup" aria-label="View">
      {CROP_PRESETS.map((preset) => {
        const Icon = CROP_ICONS[preset.value];
        const active = crop === preset.value;
        return (
          <button
            key={preset.value}
            role="radio"
            aria-checked={active}
            onClick={() => onCrop(preset.value)}
            className={`h-10 px-3 sm:px-4 rounded-full flex items-center gap-2 text-sm font-semibold transition-all duration-300 ease-spring active:scale-95 ${
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-5" weight={active ? "fill" : "regular"} />
            <span className="hidden sm:inline">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface PracticeControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  abA: number | null;
  abB: number | null;
  onSetA: () => void;
  onSetB: () => void;
  onClearAB: () => void;
  onRewind: () => void;
  speed: number;
  onSpeed: (speed: number) => void;
  pitch: number;
  onPitch: (pitch: number) => void;
  pitchProcessing: boolean;
  countdownDuration: number;
  onCountdownDuration: (seconds: number) => void;
  countdownOnLoop: boolean;
  onToggleCountdownOnLoop: () => void;
  className?: string;
}

const iconButton =
  "size-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 ease-spring active:scale-90 disabled:opacity-40 disabled:active:scale-100";
const idle = "text-foreground hover:bg-foreground/5";
const lit = "bg-loop/15 text-loop";

function Divider() {
  return <div className="hidden sm:block w-px h-8 bg-border mx-1 shrink-0" />;
}

export function PracticeControls({
  isPlaying,
  onPlayPause,
  loopEnabled,
  onToggleLoop,
  abA,
  abB,
  onSetA,
  onSetB,
  onClearAB,
  onRewind,
  speed,
  onSpeed,
  pitch,
  onPitch,
  pitchProcessing,
  countdownDuration,
  onCountdownDuration,
  countdownOnLoop,
  onToggleCountdownOnLoop,
  className,
}: PracticeControlsProps) {
  const [popover, setPopover] = useState<"tempo" | "countin" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPopover(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopover(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover]);

  // Steps land on the preset list even when a saved tempo sits between two.
  const slower = [...SPEED_OPTIONS].reverse().find((s) => s < speed - 1e-6);
  const faster = SPEED_OPTIONS.find((s) => s > speed + 1e-6);
  const countInOn = countdownDuration > 0;

  return (
    <div
      ref={ref}
      className={`relative rounded-[2rem] bg-card/85 backdrop-blur-2xl border border-border shadow-2xl shadow-black/30 px-2 py-2 flex flex-wrap items-center justify-center gap-1 ${className ?? ""}`}
    >
      {/* Tempo */}
      <div className="flex items-center">
        <button className={`${iconButton} ${idle}`} onClick={() => slower && onSpeed(slower)} disabled={!slower} aria-label="Slower">
          <MinusIcon className="size-5" />
        </button>
        <button
          className={`h-11 min-w-16 px-2 rounded-full font-mono text-base font-semibold transition-all active:scale-95 ${
            speed !== 1 ? "text-loop" : "text-foreground"
          } hover:bg-foreground/5`}
          onClick={() => setPopover(popover === "tempo" ? null : "tempo")}
          aria-haspopup="dialog"
          aria-expanded={popover === "tempo"}
          title="Tempo"
        >
          {formatSpeed(speed)}
        </button>
        <button className={`${iconButton} ${idle}`} onClick={() => faster && onSpeed(faster)} disabled={!faster} aria-label="Faster">
          <PlusIcon className="size-5" />
        </button>
      </div>

      <Divider />

      {/* Transport */}
      <div className="flex items-center gap-1">
        <button
          className={`${iconButton} ${loopEnabled ? lit : idle}`}
          onClick={onToggleLoop}
          aria-pressed={loopEnabled}
          title="Toggle loop"
        >
          <ArrowsClockwiseIcon className="size-5" weight={loopEnabled ? "bold" : "regular"} />
        </button>
        <button
          className={`${iconButton} ${idle}`}
          onClick={onRewind}
          title={abA !== null ? "Rewind to A point" : "Rewind to start"}
        >
          <SkipBackIcon className="size-5" />
        </button>
        <button
          className={`relative size-16 shrink-0 mx-1 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-90 transition-transform duration-200 ease-spring ${
            isPlaying ? "play-pulse" : ""
          }`}
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : countInOn ? `Play after a ${countdownDuration}-second count-in` : "Play"}
        >
          {isPlaying ? <PauseIcon className="size-7" weight="fill" /> : <PlayIcon className="size-7 translate-x-0.5" weight="fill" />}
        </button>
        <button
          className={`${iconButton} text-base font-bold ${abA !== null ? lit : idle}`}
          onClick={onSetA}
          title={abA !== null ? `A: ${formatTime(abA)}` : "Set A point"}
        >
          A
        </button>
        <button
          className={`${iconButton} text-base font-bold ${abB !== null ? lit : idle}`}
          onClick={onSetB}
          disabled={abA === null}
          title={abB !== null ? `B: ${formatTime(abB)}` : "Set B point"}
        >
          B
        </button>
        {abA !== null && (
          <button className={`${iconButton} text-muted-foreground hover:text-destructive`} onClick={onClearAB} title="Clear A-B loop">
            <XIcon className="size-5" />
          </button>
        )}
      </div>

      <Divider />

      {/* Count-in */}
      <button
        className={`h-11 px-3 shrink-0 rounded-full flex items-center gap-1.5 text-base font-semibold transition-all duration-200 ease-spring active:scale-95 ${
          countInOn ? lit : idle
        }`}
        onClick={() => setPopover(popover === "countin" ? null : "countin")}
        aria-haspopup="dialog"
        aria-expanded={popover === "countin"}
        title="Count-in"
      >
        <TimerIcon className="size-5" />
        {countInOn ? countdownDuration : <span className="text-sm text-muted-foreground">Off</span>}
      </button>

      <Divider />

      {/* Key */}
      <div className="flex items-center">
        <button
          className={`${iconButton} ${idle}`}
          onClick={() => onPitch(Math.max(-12, pitch - 1))}
          disabled={pitch <= -12 || pitchProcessing}
          aria-label="Key down a semitone"
        >
          <MinusIcon className="size-5" />
        </button>
        <button
          className="h-11 min-w-12 px-1 rounded-full flex flex-col items-center justify-center leading-none hover:bg-foreground/5 active:scale-95 transition-all disabled:opacity-60"
          onClick={() => onPitch(0)}
          disabled={pitchProcessing || pitch === 0}
          title="Reset key"
        >
          <span className="text-xs text-muted-foreground">Key</span>
          <span className={`text-base font-semibold font-mono mt-0.5 ${pitch !== 0 ? "text-loop" : ""}`}>
            {pitchProcessing ? "…" : pitch > 0 ? `+${pitch}` : pitch}
          </span>
        </button>
        <button
          className={`${iconButton} ${idle}`}
          onClick={() => onPitch(Math.min(12, pitch + 1))}
          disabled={pitch >= 12 || pitchProcessing}
          aria-label="Key up a semitone"
        >
          <PlusIcon className="size-5" />
        </button>
      </div>

      {/* Popovers open upward, since the island sits at the bottom */}
      {popover === "tempo" && (
        <div role="dialog" aria-label="Tempo" className="absolute bottom-full left-2 mb-3 z-50 w-72 rounded-3xl border border-border bg-popover p-3 shadow-2xl">
          <p className="px-1 pb-2 text-sm font-semibold">Tempo</p>
          <div className="grid grid-cols-4 gap-2">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                className={`h-11 rounded-xl font-mono text-sm font-semibold transition-all active:scale-95 ${
                  Math.abs(speed - s) < 1e-6 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
                }`}
                onClick={() => {
                  onSpeed(s);
                  setPopover(null);
                }}
              >
                {formatSpeed(s)}
              </button>
            ))}
          </div>
        </div>
      )}
      {popover === "countin" && (
        <div role="dialog" aria-label="Count-in" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-72 rounded-3xl border border-border bg-popover p-3 shadow-2xl">
          <div className="flex items-baseline justify-between px-1 pb-2">
            <p className="text-sm font-semibold">Count-in</p>
            <p className="text-xs text-muted-foreground">seconds before you play</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {COUNT_IN_OPTIONS.map((d) => (
              <button
                key={d}
                className={`h-11 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  countdownDuration === d ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
                }`}
                onClick={() => onCountdownDuration(d)}
              >
                {d === 0 ? "Off" : d}
              </button>
            ))}
          </div>
          <button
            role="switch"
            aria-checked={countdownOnLoop}
            disabled={!countInOn}
            onClick={onToggleCountdownOnLoop}
            className="mt-3 w-full h-11 px-1 flex items-center justify-between text-sm font-medium disabled:opacity-40"
          >
            Every loop
            <span className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-300 ${countdownOnLoop ? "bg-loop" : "bg-muted"}`}>
              <span
                className={`block size-6 rounded-full bg-white shadow transition-transform duration-300 ease-spring ${
                  countdownOnLoop ? "translate-x-5" : ""
                }`}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
