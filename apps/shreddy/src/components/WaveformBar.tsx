"use client";

import { RefObject } from "react";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
  masteryRating: number | null;
}

// Waveform bar is always dark, so use fixed colors (no dark: variant)
const WAVEFORM_COLORS = [
  "bg-violet-500/40", "bg-sky-500/40", "bg-emerald-500/40", "bg-amber-500/40", "bg-rose-500/40",
  "bg-cyan-500/40", "bg-fuchsia-500/40", "bg-lime-500/40", "bg-orange-500/40", "bg-teal-500/40",
];
const WAVEFORM_COLORS_ACTIVE = [
  "bg-violet-500/60", "bg-sky-500/60", "bg-emerald-500/60", "bg-amber-500/60", "bg-rose-500/60",
  "bg-cyan-500/60", "bg-fuchsia-500/60", "bg-lime-500/60", "bg-orange-500/60", "bg-teal-500/60",
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface WaveformBarProps {
  sections: Section[];
  duration: number;
  currentTime: number;
  selectedSectionIds: string[];
  abLoop: { a: number; b: number } | null;
  editMode: boolean;
  dragBorderIdx: number | null;
  waveformRef: RefObject<HTMLDivElement | null>;
  currentSectionName?: string;
  onSeek: (value: number) => void;
  onBorderPointerDown: (idx: number, e: React.PointerEvent) => void;
}

export function WaveformBar({
  sections,
  duration,
  currentTime,
  selectedSectionIds,
  abLoop,
  editMode,
  dragBorderIdx,
  waveformRef,
  currentSectionName,
  onSeek,
  onBorderPointerDown,
}: WaveformBarProps) {
  // One region for whatever is looping: the A-B points, else the selected
  // sections. It fills as the pass plays so you can see how far in you are.
  const selected = sections.filter((s) => selectedSectionIds.includes(s.id));
  const loop = abLoop
    ? abLoop
    : selected.length
    ? { a: Math.min(...selected.map((s) => s.startSec)), b: Math.max(...selected.map((s) => s.endSec)) }
    : null;
  const loopFill = loop ? Math.min(1, Math.max(0, (currentTime - loop.a) / (loop.b - loop.a))) : 0;

  return (
    <div className="mb-4">
      <div ref={waveformRef} className={`relative h-28 md:h-44 rounded-2xl overflow-hidden bg-zinc-900 transition-all ${
        editMode ? "ring-2 ring-yellow-500/50 ring-offset-1 ring-offset-background" : ""
      }`}>
        {sections.map((section, idx) => {
          const leftPct = (section.startSec / duration) * 100;
          const widthPct = ((section.endSec - section.startSec) / duration) * 100;
          const isSelected = selectedSectionIds.includes(section.id);
          const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
          const abHighlight = abLoop && section.startSec < abLoop.b && section.endSec > abLoop.a;
          return (
            <div
              key={section.id}
              className={`absolute inset-y-0 flex items-start transition-colors ${
                isSelected || abHighlight
                  ? isPlaying ? "bg-loop/45" : "bg-loop/30"
                  : isPlaying
                  ? WAVEFORM_COLORS_ACTIVE[idx % WAVEFORM_COLORS_ACTIVE.length]
                  : WAVEFORM_COLORS[idx % WAVEFORM_COLORS.length]
              }`}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                borderRight: idx < sections.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              {widthPct > 4 && (
                <span className="text-xs font-semibold px-2 pt-2 truncate w-full text-white/85 pointer-events-none">
                  {section.name}
                </span>
              )}
            </div>
          );
        })}
        {/* Drag handles for edit mode */}
        {editMode && sections.map((section, idx) => {
          if (idx >= sections.length - 1) return null;
          const borderPct = (section.endSec / duration) * 100;
          const isDragging = dragBorderIdx === idx;
          return (
            <div
              key={`border-${idx}`}
              className={`absolute inset-y-0 z-30 flex items-center justify-center cursor-ew-resize touch-none ${
                isDragging ? "" : "group/handle"
              }`}
              style={{ left: `calc(${borderPct}% - 12px)`, width: "24px" }}
              onPointerDown={(e) => onBorderPointerDown(idx, e)}
            >
              <div className={`w-1 h-12 rounded-full transition-all ${
                isDragging
                  ? "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)] w-1.5"
                  : "bg-white/50 group-hover/handle:bg-yellow-400 group-hover/handle:shadow-[0_0_6px_rgba(250,204,21,0.4)]"
              }`} />
            </div>
          );
        })}
        {loop && (
          <div
            className="absolute inset-y-0 border-2 border-loop rounded-lg pointer-events-none z-[5]"
            style={{ left: `${(loop.a / duration) * 100}%`, width: `${((loop.b - loop.a) / duration) * 100}%` }}
          >
            <div className="absolute inset-y-0 left-0 bg-loop/20" style={{ width: `${loopFill * 100}%` }} />
          </div>
        )}
        {/* Progress overlay */}
        <div className="absolute inset-y-0 left-0 bg-white/5 pointer-events-none" style={{ width: `${(currentTime / duration) * 100}%` }} />
        {/* Playhead */}
        <div className="absolute inset-y-0 pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }}>
          <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
          <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
        </div>
        {/* Scrubber */}
        <input
          type="range" min={0} max={duration} step={0.1} value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        />
      </div>
      <div className="flex justify-between items-center mt-2 px-1">
        <span className="text-sm text-foreground font-medium tabular-nums">{formatTime(currentTime)}</span>
        {currentSectionName && <span className="text-sm text-muted-foreground">{currentSectionName}</span>}
        <span className="text-sm text-muted-foreground tabular-nums">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
