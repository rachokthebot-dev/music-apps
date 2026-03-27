"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Play, Pause, SkipBack, Repeat, Repeat2, Star, Pencil, Trash2,
  Plus, StickyNote, ChevronDown, Disc3, Volume2, RotateCw, Clock,
} from "lucide-react";
import { mockSong, mockSections, sectionColors, sectionDotColors, formatTime } from "../mock-data";

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

export default function DraftA() {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(105);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(["s5"]);
  const [loopSong, setLoopSong] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(false);

  const duration = mockSong.durationSec;
  const currentSection = mockSections.find(s => currentTime >= s.startSec && currentTime < s.endSec);

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-4">
      {/* Nav */}
      <div className="flex items-center justify-between mb-3">
        <Link href="/drafts" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <Badge variant="outline" className="text-xs">Option A: Cinema Transport</Badge>
      </div>

      {/* Title + metadata */}
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-foreground">{mockSong.title}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[13px] text-muted-foreground">{mockSong.artist} · {formatTime(duration)}</span>
          <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{mockSong.genre}</span>
          <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{mockSong.bpm} BPM</span>
          <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 ml-auto">
            <Clock className="size-3" />
            Session: 2m 45s
          </span>
        </div>
      </div>

      {/* === LARGE WAVEFORM BAR (2x height) === */}
      <div className="mb-3">
        <div className="relative h-20 rounded-2xl overflow-hidden bg-gradient-to-b from-zinc-800 to-zinc-900 shadow-inner">
          {mockSections.map((section, idx) => {
            const leftPct = (section.startSec / duration) * 100;
            const widthPct = ((section.endSec - section.startSec) / duration) * 100;
            const isSelected = selectedIds.includes(section.id);
            const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
            return (
              <div
                key={section.id}
                className={`absolute inset-y-0 flex flex-col justify-end transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-blue-400/50"
                    : isPlaying
                    ? sectionColors[idx % sectionColors.length].replace("/40", "/60")
                    : sectionColors[idx % sectionColors.length]
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  borderRight: idx < mockSections.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none",
                }}
                onClick={() => setSelectedIds(prev =>
                  prev.includes(section.id) ? prev.filter(id => id !== section.id) : [...prev, section.id]
                )}
              >
                {widthPct > 6 && (
                  <span className="text-[11px] leading-none px-2 pb-2 truncate w-full text-white/80 font-medium">
                    {section.name}
                  </span>
                )}
              </div>
            );
          })}
          {/* Progress overlay */}
          <div
            className="absolute inset-y-0 left-0 bg-white/5 pointer-events-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          {/* Playhead */}
          <div
            className="absolute inset-y-0 pointer-events-none z-10"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]" />
            <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
          </div>
          {/* Time overlays */}
          <div className="absolute bottom-1.5 left-2 text-[11px] text-white/60 tabular-nums pointer-events-none">{formatTime(currentTime)}</div>
          <div className="absolute bottom-1.5 right-2 text-[11px] text-white/60 tabular-nums pointer-events-none">{formatTime(duration)}</div>
          {/* Scrubber */}
          <input
            type="range" min={0} max={duration} step={0.1} value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>
        {currentSection && (
          <div className="text-center mt-1">
            <span className="text-xs text-foreground/70 font-medium">{currentSection.name}</span>
          </div>
        )}
      </div>

      {/* === UNIFIED TRANSPORT BAR === */}
      <div className="bg-card border border-border rounded-2xl p-3 mb-4">
        <div className="flex items-center justify-between">
          {/* Left: Tempo inline */}
          <div className="flex items-center gap-1">
            {TEMPO_VALUES.map((t) => (
              <button
                key={t}
                onClick={() => setTempo(t)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  tempo === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t}x
              </button>
            ))}
          </div>

          {/* Center: Transport */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoopSong(!loopSong)}
              className={`size-9 rounded-full flex items-center justify-center transition-all ${
                loopSong ? "text-primary" : "text-muted-foreground/40"
              }`}
            >
              <Repeat className="size-4" />
            </button>
            <Button variant="outline" size="icon" className="size-9">
              <SkipBack className="size-4" />
            </Button>
            <button
              className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="size-6" /> : <Play className="size-6 ml-0.5" />}
            </button>
            <Button variant="outline" size="icon" className="size-9">
              <Repeat2 className="size-4" />
            </Button>
          </div>

          {/* Right: Pitch inline */}
          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Pitch</span>
            <Slider min={-6} max={6} step={1} value={[pitch]} onValueChange={(v) => setPitch(Array.isArray(v) ? v[0] : v)} className="flex-1" />
            <span className="text-[11px] text-muted-foreground tabular-nums w-6 text-right">{pitch > 0 ? `+${pitch}` : pitch}</span>
          </div>
        </div>
      </div>

      {/* === BOTTOM: Metronome + Sections (2 col) === */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Left: Metronome + Notes */}
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Disc3 className={`size-4 ${metronomeOn ? "animate-spin text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-semibold text-foreground">Metronome</span>
                {metronomeOn && <span className="text-xs text-muted-foreground">{mockSong.bpm} BPM</span>}
              </div>
              <button
                onClick={() => setMetronomeOn(!metronomeOn)}
                className={`relative w-10 h-5 rounded-full transition-colors ${metronomeOn ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${metronomeOn ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {metronomeOn && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`size-3 rounded-full ${i === 0 ? "bg-primary scale-125" : "bg-muted"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="size-3.5 text-muted-foreground" />
                  <Slider min={0} max={1} step={0.05} value={[0.5]} className="flex-1" />
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-3">
            <button className="flex items-center gap-2 text-sm font-semibold text-foreground w-full">
              <StickyNote className="size-4 text-muted-foreground" />
              Notes
              <ChevronDown className="size-4 text-muted-foreground ml-auto" />
            </button>
          </div>
        </div>

        {/* Right: Sections */}
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Sections</h2>
            <Button variant="outline" size="sm" className="gap-1 h-8 text-xs">
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          <ul className="space-y-1 max-h-[40vh] overflow-y-auto">
            {mockSections.map((section, idx) => {
              const isSelected = selectedIds.includes(section.id);
              const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
              return (
                <li
                  key={section.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                      : isPlaying
                      ? "bg-primary/5 border border-primary/20 shadow-sm"
                      : "border border-transparent hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedIds(prev =>
                    prev.includes(section.id) ? prev.filter(id => id !== section.id) : [...prev, section.id]
                  )}
                >
                  <div className={`size-3.5 rounded-full shrink-0 ${sectionDotColors[idx % sectionDotColors.length]} ${isPlaying ? "ring-2 ring-primary/30 animate-pulse" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate flex items-center gap-1.5 text-foreground">
                      {section.name}
                      <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal text-muted-foreground">Auto</Badge>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatTime(section.startSec)} – {formatTime(section.endSec)}
                      </span>
                      <span className="flex items-center -ml-0.5">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star
                            key={star}
                            className={`size-3.5 ${section.masteryRating && star <= section.masteryRating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0">
                    <button className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground"><Pencil className="size-3.5" /></button>
                    <button className="p-2 rounded-lg text-muted-foreground/40 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
