"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft, Play, Pause, SkipBack, Repeat, Repeat2, Star, Disc3, Volume2, StickyNote, Clock,
} from "lucide-react";
import { mockSong, mockSections, sectionColors, sectionDotColors, formatTime } from "../mock-data";

const TEMPO_VALUES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

export default function DraftD() {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(105);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(["s5"]);
  const [loopSong, setLoopSong] = useState(true);
  const [metronomeOn, setMetronomeOn] = useState(true);

  const duration = mockSong.durationSec;

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-3">
      {/* Nav */}
      <div className="flex items-center justify-between mb-2">
        <Link href="/drafts" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <Badge variant="outline" className="text-xs">Option D: Studio Mixer</Badge>
      </div>

      {/* === STRIP 1: Title bar === */}
      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">{mockSong.title}</h1>
          <span className="text-sm text-muted-foreground">{mockSong.artist}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">{mockSong.bpm} BPM</span>
          <span>{mockSong.genre}</span>
          <span className="tabular-nums">{formatTime(duration)}</span>
          <span className="flex items-center gap-1 text-muted-foreground/50">
            <Clock className="size-3" /> 2:45
          </span>
          <button className="p-1 text-muted-foreground hover:text-foreground"><StickyNote className="size-4" /></button>
        </div>
      </div>

      {/* === STRIP 2: TALL INTERACTIVE SECTION BAR === */}
      <div className="py-2 border-b border-border">
        <div className="relative h-24 rounded-xl overflow-hidden bg-muted">
          {mockSections.map((section, idx) => {
            const leftPct = (section.startSec / duration) * 100;
            const widthPct = ((section.endSec - section.startSec) / duration) * 100;
            const isSelected = selectedIds.includes(section.id);
            const isPlaying = currentTime >= section.startSec && currentTime < section.endSec;
            const masteryPct = ((section.masteryRating ?? 0) / 5) * 100;
            return (
              <div
                key={section.id}
                className={`absolute inset-y-0 flex flex-col justify-between cursor-pointer transition-colors group ${
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
                {/* Top accent when playing */}
                {isPlaying && <div className="h-0.5 bg-primary w-full" />}
                {!isPlaying && <div className="h-0.5" />}

                {/* Section info */}
                <div className="px-1.5 py-1 overflow-hidden">
                  {widthPct > 5 && (
                    <>
                      <span className="text-[11px] font-semibold text-foreground/80 truncate block leading-tight">
                        {section.name}
                      </span>
                      {widthPct > 8 && (
                        <span className="text-[9px] text-foreground/50 tabular-nums block">
                          {formatTime(section.startSec)} – {formatTime(section.endSec)}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Mastery bar at bottom */}
                <div className="px-1 pb-1">
                  {widthPct > 4 && (
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`size-2 ${section.masteryRating && star <= section.masteryRating ? "text-yellow-400 fill-yellow-400" : "text-foreground/10"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {/* Progress */}
          <div className="absolute inset-y-0 left-0 bg-primary/8 pointer-events-none" style={{ width: `${(currentTime / duration) * 100}%` }} />
          {/* Playhead */}
          <div className="absolute inset-y-0 pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }}>
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)]" />
            <div className="absolute -top-0.5 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-white" />
          </div>
          <input
            type="range" min={0} max={duration} step={0.1} value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1 px-1 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* === STRIP 3: Transport + Tempo + Pitch (ALL IN ONE ROW) === */}
      <div className="flex items-center justify-between py-3 border-b border-border gap-4">
        {/* Tempo */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground font-mono mr-1">TEMPO</span>
          {TEMPO_VALUES.map((t) => (
            <button
              key={t}
              onClick={() => setTempo(t)}
              className={`px-1.5 py-1 rounded text-[11px] font-mono transition-colors ${
                tempo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}x
            </button>
          ))}
        </div>

        {/* Transport (center) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLoopSong(!loopSong)}
            className={`size-9 rounded-full flex items-center justify-center transition-all ${
              loopSong ? "text-primary" : "text-muted-foreground/30"
            }`}
          >
            <Repeat className="size-4" />
          </button>
          <button className="size-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-border">
            <SkipBack className="size-4" />
          </button>
          <button
            className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-sm"
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause className="size-6" /> : <Play className="size-6 ml-0.5" />}
          </button>
          <button className="size-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-border">
            <Repeat2 className="size-4" />
          </button>
        </div>

        {/* Pitch */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <span className="text-[11px] text-muted-foreground font-mono">PITCH</span>
          <Slider min={-6} max={6} step={1} value={[pitch]} onValueChange={(v) => setPitch(Array.isArray(v) ? v[0] : v)} className="flex-1" />
          <span className="text-[11px] text-muted-foreground font-mono tabular-nums w-7 text-right">{pitch > 0 ? `+${pitch}` : pitch}st</span>
        </div>
      </div>

      {/* === STRIP 4: Metronome row === */}
      <div className="flex items-center justify-between py-2.5 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMetronomeOn(!metronomeOn)}
            className={`flex items-center gap-1.5 text-[11px] font-mono transition-colors ${
              metronomeOn ? "text-primary" : "text-muted-foreground/50"
            }`}
          >
            <Disc3 className={`size-3.5 ${metronomeOn ? "animate-spin" : ""}`} />
            METRONOME
          </button>
          {metronomeOn && (
            <>
              <span className="text-[11px] text-muted-foreground font-mono tabular-nums">{Math.round(mockSong.bpm * tempo)} BPM</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`size-2.5 rounded-full ${i === 0 ? "bg-primary" : "bg-muted border border-border"}`} />
                ))}
              </div>
              <div className="flex items-center gap-1.5 min-w-[100px]">
                <Volume2 className="size-3 text-muted-foreground" />
                <Slider min={0} max={1} step={0.05} value={[0.5]} className="flex-1" />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {selectedIds.length > 0 && (
            <span className="flex items-center gap-1 text-blue-400 font-mono">
              <Repeat className="size-3" />
              {mockSections.filter(s => selectedIds.includes(s.id)).map(s => s.name).join(" + ")}
            </span>
          )}
        </div>
      </div>

      {/* Info text */}
      <p className="text-[10px] text-muted-foreground/40 mt-2 text-center font-mono">
        Tap sections in the bar above to select for looping. All controls visible — no scrolling needed.
      </p>
    </main>
  );
}
