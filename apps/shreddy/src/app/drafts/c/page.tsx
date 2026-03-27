"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Play, Pause, SkipBack, Repeat, Repeat2, Star, Disc3, Volume2, StickyNote,
} from "lucide-react";
import { mockSong, mockSections, sectionColors, sectionDotColors, formatTime } from "../mock-data";

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

export default function DraftC() {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(105);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(["s5"]);
  const [loopSong, setLoopSong] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(false);

  const duration = mockSong.durationSec;

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4">
      {/* Nav */}
      <div className="flex items-center justify-between mb-3">
        <Link href="/drafts" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <Badge variant="outline" className="text-xs">Option C: Floating Player</Badge>
      </div>

      {/* === DARK FLOATING PLAYER === */}
      <div className="bg-zinc-900 rounded-2xl p-5 mb-4 shadow-xl">
        {/* Title inside player */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-white">{mockSong.title}</h1>
            <span className="text-sm text-zinc-400">{mockSong.artist} · {mockSong.genre} · {mockSong.bpm} BPM</span>
          </div>
          <button className="p-2 text-zinc-500 hover:text-zinc-300">
            <StickyNote className="size-5" />
          </button>
        </div>

        {/* Waveform inside dark card */}
        <div className="mb-4">
          <div className="relative h-16 rounded-xl overflow-hidden bg-zinc-800">
            {mockSections.map((section, idx) => {
              const leftPct = (section.startSec / duration) * 100;
              const widthPct = ((section.endSec - section.startSec) / duration) * 100;
              const isSelected = selectedIds.includes(section.id);
              const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
              return (
                <div
                  key={section.id}
                  className={`absolute inset-y-0 flex items-end transition-colors ${
                    isSelected ? "bg-blue-500/40" : isPlaying ? "bg-white/15" : sectionColors[idx % sectionColors.length].replace("/40", "/20")
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    borderRight: idx < mockSections.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  {widthPct > 8 && (
                    <span className="text-[10px] leading-none px-1.5 pb-1.5 truncate w-full text-zinc-400 font-medium">
                      {section.name}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Progress */}
            <div className="absolute inset-y-0 left-0 bg-white/5 pointer-events-none" style={{ width: `${(currentTime / duration) * 100}%` }} />
            {/* Playhead with glow */}
            <div className="absolute inset-y-0 pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }}>
              <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-400" />
            </div>
            {/* Time */}
            <div className="absolute bottom-1 left-2 text-[10px] text-zinc-500 tabular-nums pointer-events-none">{formatTime(currentTime)}</div>
            <div className="absolute bottom-1 right-2 text-[10px] text-zinc-500 tabular-nums pointer-events-none">{formatTime(duration)}</div>
            <input
              type="range" min={0} max={duration} step={0.1} value={currentTime}
              onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setLoopSong(!loopSong)}
            className={`size-10 rounded-full flex items-center justify-center transition-all ${
              loopSong ? "text-blue-400" : "text-zinc-600"
            }`}
          >
            <Repeat className="size-4" />
          </button>
          <button className="size-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white">
            <SkipBack className="size-5" />
          </button>
          <button
            className="size-16 rounded-full bg-white text-zinc-900 flex items-center justify-center active:scale-95 transition-transform shadow-lg"
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause className="size-7" /> : <Play className="size-7 ml-0.5" />}
          </button>
          <button className="size-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white">
            <Repeat2 className="size-5" />
          </button>
          <button
            onClick={() => setMetronomeOn(!metronomeOn)}
            className={`size-10 rounded-full flex items-center justify-center transition-all ${
              metronomeOn ? "text-blue-400" : "text-zinc-600"
            }`}
          >
            <Disc3 className={`size-4 ${metronomeOn ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* === HORIZONTAL SECTION STRIP === */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-foreground">Sections</h2>
          <span className="text-[11px] text-muted-foreground">Tap to select for looping</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {mockSections.map((section, idx) => {
            const isSelected = selectedIds.includes(section.id);
            const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
            return (
              <button
                key={section.id}
                onClick={() => setSelectedIds(prev =>
                  prev.includes(section.id) ? prev.filter(id => id !== section.id) : [...prev, section.id]
                )}
                className={`shrink-0 snap-start w-[130px] p-3 rounded-xl border transition-all text-left ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 shadow-sm"
                    : isPlaying
                    ? "bg-card border-primary/30 shadow-sm"
                    : "bg-card border-border hover:border-ring/30"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`size-2.5 rounded-full ${sectionDotColors[idx % sectionDotColors.length]} ${isPlaying ? "animate-pulse" : ""}`} />
                  <span className="text-sm font-medium text-foreground truncate">{section.name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatTime(section.startSec)} – {formatTime(section.endSec)}
                </span>
                <div className="flex items-center gap-0 mt-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`size-3 ${section.masteryRating && star <= section.masteryRating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/20"}`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* === COMPACT CONTROLS ROW === */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Tempo */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium">Tempo</span>
          <div className="flex gap-0.5">
            {TEMPO_VALUES.map((t) => (
              <button
                key={t}
                onClick={() => setTempo(t)}
                className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  tempo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t}x
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Pitch */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <span className="text-[11px] text-muted-foreground font-medium">Pitch</span>
          <Slider min={-6} max={6} step={1} value={[pitch]} onValueChange={(v) => setPitch(Array.isArray(v) ? v[0] : v)} className="flex-1" />
          <span className="text-[11px] text-muted-foreground tabular-nums w-5">{pitch > 0 ? `+${pitch}` : pitch}</span>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Metronome volume */}
        {metronomeOn && (
          <div className="flex items-center gap-2 min-w-[120px]">
            <Volume2 className="size-3.5 text-muted-foreground" />
            <Slider min={0} max={1} step={0.05} value={[0.5]} className="flex-1" />
          </div>
        )}
      </div>
    </main>
  );
}
