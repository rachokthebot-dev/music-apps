"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, Plus, Trash2, RotateCw, Share2, Copy, Download, Check, ArrowRightLeft } from "lucide-react";
import { Button } from "@music-apps/ui";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
  masteryRating: number | null;
}

const SECTION_DOT_COLORS = [
  "bg-violet-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400",
  "bg-cyan-400", "bg-fuchsia-400", "bg-lime-400", "bg-orange-400", "bg-teal-400",
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getBarCount(
  section: { startSec: number; endSec: number },
  beatTimestamps: number[],
  timeSignature: number
): number | null {
  if (!beatTimestamps.length) return null;
  const beats = beatTimestamps.filter(
    t => t >= section.startSec && t < section.endSec
  );
  if (beats.length === 0) return null;
  return Math.round(beats.length / timeSignature);
}

interface SongMeta {
  title: string;
  artist: string;
  musicalKey: string;
  bpm: number | null;
  durationSec: number | null;
}

interface SectionStripProps {
  sections: Section[];
  selectedSectionIds: string[];
  currentTime: number;
  loopCounts: Record<string, number>;
  editMode: boolean;
  beatTimestamps: number[];
  timeSignature: number;
  /** Used to convert "2 bars" into a seconds window around the transition. */
  songBpm: number | null;
  songDurationSec: number | null;
  /** Current A-B loop, so the per-section "Loop transition" toggle can
   *  show active state when it owns the current loop. */
  abLoop?: { a: number; b: number } | null;
  songMeta: SongMeta;
  onEditModeToggle: () => void;
  onSelectSection: (section: Section) => void;
  onEditSection: (section: Section) => void;
  onDeleteSection: (sectionId: string) => void;
  onAddSection: () => void;
  /** Loop the boundary between this section and the next one — 2 bars
   *  on each side, clamped to song duration / neighbour bounds. */
  onTransitionLoop?: (boundarySec: number, aSec: number, bSec: number) => void;
  /** Clear the current A-B loop (toggle off). */
  onClearTransition?: () => void;
}

const TRANSITION_BARS_BEFORE = 2;
const TRANSITION_BARS_AFTER = 2;
// A-B loop edge match tolerance. Two transitions can land within 1s of
// the same boundary at different bar counts — 0.1s is below the smallest
// realistic transition window so false matches are unlikely.
const AB_MATCH_TOL_SEC = 0.1;

export function SectionStrip({
  sections,
  selectedSectionIds,
  currentTime,
  loopCounts,
  editMode,
  beatTimestamps,
  timeSignature,
  songBpm,
  songDurationSec,
  abLoop,
  songMeta,
  onEditModeToggle,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddSection,
  onTransitionLoop,
  onClearTransition,
}: SectionStripProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const handleCopyText = async () => {
    const { copyStructureText } = await import("@/lib/export-structure");
    const text = copyStructureText({
      ...songMeta,
      timeSignature,
      sections,
      beatTimestamps,
    });
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => { setCopied(false); setExportOpen(false); }, 1200);
  };

  const handleSaveImage = async () => {
    const { generateStructureImage } = await import("@/lib/export-structure");
    generateStructureImage({
      ...songMeta,
      timeSignature,
      sections,
      beatTimestamps,
    });
    setExportOpen(false);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">Sections</h2>
        <span className="text-[11px] text-muted-foreground">Tap to loop</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {sections.length > 1 && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={onEditModeToggle}
              className="gap-1 h-7 text-xs"
            >
              <Pencil className="size-3" />
              {editMode ? "Done" : "Edit"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onAddSection} className="gap-1 h-7 text-xs">
            <Plus className="size-3" /> Add
          </Button>
          {sections.length > 0 && (
            <div className="relative" ref={exportRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(!exportOpen)}
                className="gap-1 h-7 text-xs"
                title="Export structure"
              >
                <Share2 className="size-3" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={handleCopyText}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied!" : "Copy as text"}
                  </button>
                  <button
                    onClick={handleSaveImage}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <Download className="size-3.5" />
                    Save as image
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {sections.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">No sections yet. Add one to start looping.</p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {sections.map((section, idx) => {
            const isSelected = selectedSectionIds.includes(section.id);
            const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
            // Transition pill: only on sections that have a next section.
            // The boundary lives at section.endSec === next.startSec; we
            // build a ±2 bar window using songBpm + timeSignature.
            const nextSection = sections[idx + 1];
            const canTransition =
              !!nextSection && !!onTransitionLoop && (songBpm ?? 0) > 0;
            const transitionRange = canTransition && songBpm
              ? (() => {
                  const secPerBar = (60 / songBpm) * (timeSignature || 4);
                  const boundary = section.endSec;
                  const a = Math.max(
                    section.startSec,
                    boundary - TRANSITION_BARS_BEFORE * secPerBar
                  );
                  const b = Math.min(
                    nextSection!.endSec,
                    songDurationSec ?? boundary + TRANSITION_BARS_AFTER * secPerBar,
                    boundary + TRANSITION_BARS_AFTER * secPerBar
                  );
                  return b - a < 0.5 ? null : { boundary, a, b };
                })()
              : null;
            const isTransitionActive =
              !!transitionRange &&
              !!abLoop &&
              Math.abs(abLoop.a - transitionRange.a) < AB_MATCH_TOL_SEC &&
              Math.abs(abLoop.b - transitionRange.b) < AB_MATCH_TOL_SEC;
            const handleTransition = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!transitionRange) return;
              if (isTransitionActive) {
                onClearTransition?.();
              } else {
                onTransitionLoop?.(transitionRange.boundary, transitionRange.a, transitionRange.b);
              }
            };
            return (
              <div
                key={section.id}
                className={`shrink-0 snap-start w-[120px] sm:w-[140px] p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.97] relative ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 shadow-sm"
                    : isPlaying
                    ? "bg-card border-primary/30 shadow-sm"
                    : "bg-card border-border hover:border-ring/30"
                }`}
                onClick={() => onSelectSection(section)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`size-2.5 rounded-full ${SECTION_DOT_COLORS[idx % SECTION_DOT_COLORS.length]} ${isPlaying ? "animate-pulse" : ""}`} />
                  <span className="text-sm font-medium text-foreground truncate">{section.name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums block">
                  {formatTime(section.startSec)} – {formatTime(section.endSec)}
                </span>
                {(() => {
                  const bars = getBarCount(section, beatTimestamps, timeSignature);
                  return bars !== null ? (
                    <span className="text-[10px] text-muted-foreground/70 block mb-1">~{bars} {bars === 1 ? "bar" : "bars"}</span>
                  ) : <span className="mb-1 block" />;
                })()}
                {canTransition && transitionRange && (
                  <button
                    onClick={handleTransition}
                    title={
                      isTransitionActive
                        ? `Stop looping the transition into ${nextSection!.name}`
                        : `Loop the ±${TRANSITION_BARS_BEFORE}-bar transition into ${nextSection!.name}`
                    }
                    className={`w-full h-7 mt-1 rounded-md text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors active:scale-95 ${
                      isTransitionActive
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <ArrowRightLeft className="size-3" />
                    {isTransitionActive ? "Looping" : "Transition"}
                  </button>
                )}
                {editMode && (
                  <div className="flex items-center justify-end">
                    <div className="flex items-center gap-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditSection(section); }}
                        className="p-1 rounded text-muted-foreground/60 hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteSection(section.id); }}
                        className="p-1 rounded text-muted-foreground/60 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                )}
                {(loopCounts[section.id] ?? 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-1">
                    <RotateCw className="size-2.5" />
                    {loopCounts[section.id]} loops
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
