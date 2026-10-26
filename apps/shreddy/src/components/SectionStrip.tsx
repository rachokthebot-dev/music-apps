"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowClockwiseIcon,
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShareNetworkIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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
  songMeta: SongMeta;
  onEditModeToggle: () => void;
  onSelectSection: (section: Section) => void;
  onEditSection: (section: Section) => void;
  onDeleteSection: (sectionId: string) => void;
  onAddSection: () => void;
}

export function SectionStrip({
  sections,
  selectedSectionIds,
  currentTime,
  loopCounts,
  editMode,
  beatTimestamps,
  timeSignature,
  songMeta,
  onEditModeToggle,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddSection,
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
    const [{ copyStructureText }, { copyText }] = await Promise.all([
      import("@/lib/export-structure"),
      import("@/lib/clipboard"),
    ]);
    const text = copyStructureText({
      ...songMeta,
      timeSignature,
      sections,
      beatTimestamps,
    });
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => { setCopied(false); setExportOpen(false); }, 1200);
    } else {
      setExportOpen(false);
    }
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
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-3 px-1">
        <h2 className="text-lg font-semibold text-foreground">Sections</h2>
        <span className="hidden sm:inline text-sm text-muted-foreground">Tap to loop</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {sections.length > 1 && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={onEditModeToggle}
              className="gap-1.5 h-10 px-3 text-sm"
            >
              <PencilSimpleIcon className="size-3" />
              {editMode ? "Done" : "Edit"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onAddSection} className="gap-1.5 h-10 px-3 text-sm">
            <PlusIcon className="size-4" /> Add
          </Button>
          {sections.length > 0 && (
            <div className="relative" ref={exportRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(!exportOpen)}
                className="h-10 w-10 p-0"
                title="Export structure"
              >
                <ShareNetworkIcon className="size-4" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-40 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={handleCopyText}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {copied ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
                    {copied ? "Copied!" : "Copy as text"}
                  </button>
                  <button
                    onClick={handleSaveImage}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <DownloadSimpleIcon className="size-3.5" />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {sections.map((section, idx) => {
            const isSelected = selectedSectionIds.includes(section.id);
            const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
            return (
              <div
                key={section.id}
                className={`min-w-0 px-4 py-3 rounded-2xl border transition-all duration-200 ease-spring cursor-pointer active:scale-[0.97] relative ${
                  isSelected
                    ? "bg-loop/10 border-loop ring-1 ring-inset ring-loop"
                    : isPlaying
                    ? "bg-card border-primary/30 shadow-sm"
                    : "bg-card border-border hover:border-ring/30"
                }`}
                onClick={() => onSelectSection(section)}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <div className={`size-2.5 shrink-0 rounded-full ${SECTION_DOT_COLORS[idx % SECTION_DOT_COLORS.length]} ${isPlaying ? "animate-pulse" : ""}`} />
                  <span className="text-base font-semibold text-foreground truncate">{section.name}</span>
                </div>
                <span className={`text-sm tabular-nums block ${isSelected ? "text-loop" : "text-muted-foreground"}`}>
                  {formatTime(section.startSec)} – {formatTime(section.endSec)}
                </span>
                {(() => {
                  const bars = getBarCount(section, beatTimestamps, timeSignature);
                  return bars !== null ? (
                    <span className="text-xs text-muted-foreground block">~{bars} {bars === 1 ? "bar" : "bars"}</span>
                  ) : null;
                })()}
                {editMode && (
                  <div className="flex items-center justify-end -mr-2 -mb-1">
                    <div className="flex items-center gap-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditSection(section); }}
                        className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <PencilSimpleIcon className="size-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteSection(section.id); }}
                        className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
                {(loopCounts[section.id] ?? 0) > 0 && (
                  <span className="text-xs text-loop font-medium flex items-center gap-1 mt-1">
                    <ArrowClockwiseIcon className="size-3" />
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
