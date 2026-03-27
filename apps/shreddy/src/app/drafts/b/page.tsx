"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Play, Pause, SkipBack, Repeat, Repeat2, Star, Pencil, Trash2,
  Plus, StickyNote, ChevronDown, Disc3, Volume2, Clock,
} from "lucide-react";
import { mockSong, mockSections, sectionColors, sectionDotColors, formatTime } from "../mock-data";

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

export default function DraftB() {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(105);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(["s5"]);
  const [loopSong, setLoopSong] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);

  const duration = mockSong.durationSec;
  const currentSection = mockSections.find(s => currentTime >= s.startSec && currentTime < s.endSec);

  return (
    <main className="flex-1 max-w-[1200px] mx-auto w-full px-4 py-4">
      {/* Nav bar */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/drafts" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <Badge variant="outline" className="text-xs">Option B: Dashboard Panels</Badge>
      </div>

      {/* === THREE-COLUMN GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_280px] gap-0 lg:gap-0">

        {/* LEFT PANEL: Controls */}
        <div className="lg:bg-muted/30 lg:rounded-l-2xl p-4 space-y-4">
          {/* Song info (mobile) */}
          <div className="lg:hidden mb-2">
            <h1 className="text-xl font-semibold text-foreground">{mockSong.title}</h1>
            <span className="text-sm text-muted-foreground">{mockSong.artist}</span>
          </div>

          {/* Tempo */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Tempo: {tempo}x
            </label>
            <div className="grid grid-cols-4 gap-1">
              {TEMPO_VALUES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTempo(t)}
                  className={`px-1.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    tempo === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent border border-border"
                  }`}
                >
                  {t}x
                </button>
              ))}
            </div>
            {mockSong.bpm && (
              <span className="text-[11px] text-muted-foreground mt-1 block">{Math.round(mockSong.bpm * tempo)} BPM</span>
            )}
          </div>

          {/* Pitch */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Pitch: {pitch > 0 ? `+${pitch}` : pitch} st
            </label>
            <div className="flex items-center gap-2">
              <Slider min={-6} max={6} step={1} value={[pitch]} onValueChange={(v) => setPitch(Array.isArray(v) ? v[0] : v)} className="flex-1" />
              <button onClick={() => setPitch(0)} className="text-[10px] text-muted-foreground hover:text-foreground">Reset</button>
            </div>
          </div>

          {/* Metronome */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Disc3 className={`size-3.5 ${metronomeOn ? "animate-spin text-primary" : ""}`} />
                Metronome
              </label>
              <button
                onClick={() => setMetronomeOn(!metronomeOn)}
                className={`relative w-9 h-5 rounded-full transition-colors ${metronomeOn ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${metronomeOn ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
            {metronomeOn && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-1.5">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`size-2.5 rounded-full ${i === 0 ? "bg-primary scale-125" : "bg-card border border-border"}`} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="size-3 text-muted-foreground" />
                  <Slider min={0} max={1} step={0.05} value={[0.5]} className="flex-1" />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <button className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-full">
              <StickyNote className="size-3.5" />
              Notes
              <ChevronDown className="size-3.5 ml-auto" />
            </button>
          </div>

          {/* Session timer */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 pt-2 border-t border-border/50">
            <Clock className="size-3" />
            Session: 2m 45s
          </div>
        </div>

        {/* CENTER: Stage */}
        <div className="p-4">
          {/* Title (desktop) */}
          <div className="hidden lg:block mb-3">
            <h1 className="text-lg font-semibold text-foreground">{mockSong.title}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{mockSong.artist}</span>
              <span>·</span>
              <span>{formatTime(duration)}</span>
              <span>·</span>
              <span>{mockSong.genre}</span>
              <span>·</span>
              <span>{mockSong.bpm} BPM</span>
            </div>
          </div>

          {/* Waveform bar */}
          <div className="mb-3">
            <div className="relative h-14 rounded-xl overflow-hidden bg-muted">
              {mockSections.map((section, idx) => {
                const leftPct = (section.startSec / duration) * 100;
                const widthPct = ((section.endSec - section.startSec) / duration) * 100;
                const isSelected = selectedIds.includes(section.id);
                const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
                return (
                  <div
                    key={section.id}
                    className={`absolute inset-y-0 flex items-end transition-colors ${
                      isSelected ? "bg-blue-400/50" : isPlaying ? sectionColors[idx % sectionColors.length].replace("/40", "/60") : sectionColors[idx % sectionColors.length]
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      borderRight: idx < mockSections.length - 1 ? "1px solid rgba(255,255,255,0.15)" : "none",
                    }}
                  >
                    {widthPct > 7 && (
                      <span className="text-[10px] leading-none px-1.5 pb-1.5 truncate w-full text-foreground/70 font-medium">
                        {section.name}
                      </span>
                    )}
                  </div>
                );
              })}
              <div className="absolute inset-y-0 left-0 bg-primary/10 pointer-events-none" style={{ width: `${(currentTime / duration) * 100}%` }} />
              <div className="absolute inset-y-0 pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }}>
                <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.3)]" />
                <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-white" />
              </div>
              <input
                type="range" min={0} max={duration} step={0.1} value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1 px-0.5">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              {currentSection && <span className="text-foreground/70 font-medium">{currentSection.name}</span>}
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => setLoopSong(!loopSong)}
              className={`size-11 rounded-full flex items-center justify-center border transition-all ${
                loopSong ? "text-primary border-primary/30 bg-primary/5" : "text-muted-foreground/40 border-transparent"
              }`}
            >
              <Repeat className="size-4" />
            </button>
            <Button variant="outline" size="icon" className="size-11"><SkipBack className="size-5" /></Button>
            <button
              className="size-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-md"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="size-8" /> : <Play className="size-8 ml-1" />}
            </button>
            <Button variant="outline" size="icon" className="size-11"><Repeat2 className="size-5" /></Button>
          </div>

          {/* Loop indicator */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <Repeat className="size-3 text-blue-500" />
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {mockSections.filter(s => selectedIds.includes(s.id)).map(s => s.name).join(" + ")}
              </span>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: Sections */}
        <div className="lg:bg-muted/30 lg:rounded-r-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Sections</h2>
            <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
              <Plus className="size-3" /> Add
            </Button>
          </div>
          <ul className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {mockSections.map((section, idx) => {
              const isSelected = selectedIds.includes(section.id);
              const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
              return (
                <li
                  key={section.id}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-100/50 dark:bg-blue-900/30"
                      : isPlaying
                      ? "bg-primary/5"
                      : "hover:bg-card"
                  }`}
                  style={{ borderLeft: `3px solid ${isSelected ? 'rgb(96,165,250)' : isPlaying ? 'var(--primary)' : 'transparent'}` }}
                  onClick={() => setSelectedIds(prev =>
                    prev.includes(section.id) ? prev.filter(id => id !== section.id) : [...prev, section.id]
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">{section.name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatTime(section.startSec)} – {formatTime(section.endSec)}
                      </span>
                    </div>
                    {/* Mastery bar */}
                    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (section.masteryRating ?? 0) >= 4 ? "bg-green-400" :
                          (section.masteryRating ?? 0) >= 2 ? "bg-yellow-400" :
                          (section.masteryRating ?? 0) >= 1 ? "bg-orange-400" : "bg-transparent"
                        }`}
                        style={{ width: `${((section.masteryRating ?? 0) / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button className="p-1.5 rounded text-muted-foreground/30 hover:text-foreground"><Pencil className="size-3" /></button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </main>
  );
}
