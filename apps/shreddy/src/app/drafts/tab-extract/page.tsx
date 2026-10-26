"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@music-apps/ui";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  PauseIcon,
  PlayIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { mockSong, mockSections, sectionColors, SELECTED_SECTION_ID, formatTime } from "./mock-data";
import {
  extractedNotes, extractedStats, EXTRACTED_BARS,
  STEM_URL, SECTION_START, SECTION_END,
} from "./extracted-data";
import type { ExtractedNote } from "./types";
import { toAsciiTab } from "@/lib/ascii-tab";

const STRING_GAP = 22;
const STAFF_H = STRING_GAP * 5;
const SLOTS = 16;
const BAR_W = 190;
const LABEL_W = 20;

// Two axes, two encodings, chosen so they compose instead of competing:
//   detectConf ("is this note real")      -> weight/opacity of the number
//   fretConf   ("is this position right") -> the bar underneath it
const AMBIGUOUS = 0.7;
const FAINT = 0.5;

export default function TabExtractPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(SECTION_START);
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const section = mockSections.find(s => s.id === SELECTED_SECTION_ID)!;
  const notes = extractedNotes;
  const selected = notes.find(n => n.id === selectedId) ?? null;

  const xOf = useCallback(
    (n: ExtractedNote) => (n.bar - 1) * BAR_W + (n.beat / SLOTS) * BAR_W + 10,
    []
  );

  // Playhead x: interpolate between the notes bracketing the current time.
  // Deriving it from the notes themselves keeps the cursor honest — it tracks
  // what was actually transcribed, not an idealised grid.
  const playheadX = useMemo(() => {
    if (!notes.length) return 0;
    if (t <= notes[0].startSec) return xOf(notes[0]);
    const last = notes[notes.length - 1];
    if (t >= last.startSec) return xOf(last);
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i], b = notes[i + 1];
      if (t >= a.startSec && t < b.startSec) {
        const f = (t - a.startSec) / Math.max(1e-6, b.startSec - a.startSec);
        return xOf(a) + f * (xOf(b) - xOf(a));
      }
    }
    return xOf(last);
  }, [t, notes, xOf]);

  // follow the cursor
  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = playheadX - el.clientWidth * 0.4;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [playheadX, playing]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      setT(a.currentTime);
      if (a.currentTime >= SECTION_END) { a.pause(); setPlaying(false); }
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (a.currentTime < SECTION_START || a.currentTime >= SECTION_END) a.currentTime = SECTION_START;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  function seek(sec: number) {
    const a = audioRef.current;
    if (a) a.currentTime = sec;
    setT(sec);
  }

  const asciiTab = useMemo(
    () => toAsciiTab(notes, {
      header: `Paranoid — Solo (${formatTime(SECTION_START)}–${formatTime(SECTION_END)})\n` +
              `${mockSong.bpm} BPM · E standard · machine transcription, verify before use`,
    }),
    [notes]
  );

  function downloadAscii() {
    const url = URL.createObjectURL(new Blob([asciiTab], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "paranoid-solo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAscii() {
    try {
      await navigator.clipboard.writeText(asciiTab);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const activeId = useMemo(() => {
    let cur: string | null = null;
    for (const n of notes) if (n.startSec <= t + 0.02) cur = n.id;
    return cur;
  }, [t, notes]);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-3">
      <audio ref={audioRef} src={STEM_URL} preload="auto" />

      <div className="flex items-center justify-between mb-2">
        <Link href="/drafts" className="text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-5" />
        </Link>
        <Badge variant="outline" className="text-xs">Solo → Tab</Badge>
      </div>

      {/* Song + section context */}
      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">Paranoid</h1>
          <span className="text-sm text-muted-foreground">{mockSong.artist}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
          <span>{mockSong.bpm} BPM</span>
          <span>E standard</span>
          <span>{EXTRACTED_BARS} bars</span>
        </div>
      </div>

      <div className="py-2 border-b border-border">
        <div className="relative h-10 rounded-lg overflow-hidden bg-muted">
          {mockSections.map((s, i) => {
            const on = s.id === SELECTED_SECTION_ID;
            return (
              <div
                key={s.id}
                className={`absolute inset-y-0 px-1.5 py-1 ${on ? "bg-blue-400/60 ring-2 ring-inset ring-blue-400" : sectionColors[i % sectionColors.length]}`}
                style={{
                  left: `${(s.startSec / mockSong.durationSec) * 100}%`,
                  width: `${((s.endSec - s.startSec) / mockSong.durationSec) * 100}%`,
                }}
              >
                <span className="text-[10px] font-medium text-foreground/75 truncate block">{s.name}</span>
              </div>
            );
          })}
          {playing && (
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground pointer-events-none"
              style={{ left: `${(t / mockSong.durationSec) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Result summary — the numbers that tell you how much to trust it */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 text-xs border-b border-border">
        <Stat label="rendered" value={`${extractedStats.rendered} notes`} />
        <Stat label="raw detections" value={String(extractedStats.rawDetections)} />
        <Stat label="ambiguous fret" value={`${extractedStats.ambiguousFrets}`} tone="amber" />
        <Stat label="faint detection" value={`${extractedStats.lowDetect}`} tone="muted" />
        <Stat label="grid error" value={`${extractedStats.quantMedianMs}ms`} />
        <Stat label="detect" value={`${extractedStats.detectSec}s`} />
      </div>

      {/* Staff */}
      <div className="mt-3 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
            >
              {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
              {playing ? "Pause" : "Play guitar stem"}
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTime(t)} / {formatTime(SECTION_END)}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
            <WaveformIcon className="size-3" /> isolated stem — check the tab against what you hear
          </span>
        </div>

        <div ref={scrollRef} className="px-4 pb-3 overflow-x-auto">
          <Staff
            notes={notes}
            xOf={xOf}
            bars={EXTRACTED_BARS}
            selectedId={selectedId}
            activeId={activeId}
            playheadX={playheadX}
            onSelect={id => {
              setSelectedId(id);
              const n = notes.find(x => x.id === id);
              if (n) seek(n.startSec);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 px-4 pb-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-foreground">12</span>
            <span className="font-mono opacity-40">12</span>
            confident → faint detection
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded bg-amber-500" />
            ambiguous position — alternates exist
          </span>
        </div>
      </div>

      {/* Pitch ribbon — the diagnostic layer */}
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground mb-2">
          Pitch over time — what the detector saw, before fretting
        </p>
        <PitchRibbon notes={notes} t={t} onSeek={seek} />
      </div>

      {/* Inspector */}
      <div className="mt-3 rounded-xl border border-border bg-card p-3 min-h-[112px]">
        {selected ? <Inspector note={selected} /> : (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Select a note to see its alternate positions and jump playback there.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={downloadAscii}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
        >
          <DownloadSimpleIcon className="size-3" /> ASCII tab (.txt)
        </button>
        <button
          onClick={copyAscii}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
        >
          {copied ? <CheckIcon className="size-3 text-emerald-500" /> : <CopyIcon className="size-3" />}
          {copied ? "Copied — paste into Guitar Scribble" : "Copy for Guitar Scribble"}
        </button>
        <a
          href="https://guitarscribble.com/guitar-tab-editor"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Open editor <ArrowSquareOutIcon className="size-2.5" />
        </a>
        <span className="text-[10px] text-muted-foreground/60 ml-1">
          Guitar Scribble imports ASCII — Guitar Pro / MusicXML / MIDI not yet wired
        </span>
      </div>

      <p className="mt-5 mb-2 text-[10px] text-muted-foreground/60 text-center">
        Machine transcription of your own library copy — a draft to correct, not a finished tab.
      </p>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "muted" }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tabular-nums font-medium ${
        tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground"
      }`}>{value}</span>
      <span className="text-muted-foreground/70">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */

function Staff({
  notes, xOf, bars, selectedId, activeId, playheadX, onSelect,
}: {
  notes: ExtractedNote[];
  xOf: (n: ExtractedNote) => number;
  bars: number;
  selectedId: string | null;
  activeId: string | null;
  playheadX: number;
  onSelect: (id: string) => void;
}) {
  const width = LABEL_W + BAR_W * bars;
  return (
    <div style={{ width, minWidth: width }} className="relative select-none">
      <div className="relative h-4" style={{ marginLeft: LABEL_W }}>
        {Array.from({ length: bars }, (_, i) => (
          <span key={i} className="absolute text-[10px] text-muted-foreground/50 tabular-nums" style={{ left: i * BAR_W + 3 }}>
            {i + 1}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height: STAFF_H + 10 }}>
        {["e", "B", "G", "D", "A", "E"].map((s, i) => (
          <span key={i} className="absolute text-[10px] text-muted-foreground/50 font-mono -translate-y-1/2" style={{ left: 0, top: i * STRING_GAP }}>
            {s}
          </span>
        ))}

        <div className="absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 h-px bg-border" style={{ top: i * STRING_GAP }} />
          ))}
          {Array.from({ length: bars + 1 }, (_, i) => (
            <div key={i} className="absolute w-px bg-border" style={{ left: i * BAR_W, top: 0, height: STAFF_H }} />
          ))}

          <div
            className="absolute w-px bg-primary/70 pointer-events-none z-20"
            style={{ left: playheadX, top: -4, height: STAFF_H + 8 }}
          />

          {notes.map(n => {
            const x = xOf(n);
            const y = (n.string - 1) * STRING_GAP;
            const sel = n.id === selectedId;
            const active = n.id === activeId;
            const faint = n.detectConf < FAINT;
            const ambiguous = n.fretConf < AMBIGUOUS;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-1 rounded text-[11px] font-mono tabular-nums leading-[15px] transition-colors z-10 ${
                  sel ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                  : active ? "bg-foreground text-background"
                  : "bg-card text-foreground hover:bg-muted"
                }`}
                style={{ left: x, top: y, opacity: sel || active ? 1 : faint ? 0.4 : 1 }}
                title={`detect ${Math.round(n.detectConf * 100)}% · fret ${Math.round(n.fretConf * 100)}%`}
              >
                {n.fret}
                {ambiguous && !sel && (
                  <span className="absolute left-0.5 right-0.5 -bottom-0.5 h-0.5 rounded bg-amber-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PitchRibbon({ notes, t, onSeek }: { notes: ExtractedNote[]; t: number; onSeek: (s: number) => void }) {
  const H = 88;
  const lo = Math.min(...notes.map(n => n.midi));
  const hi = Math.max(...notes.map(n => n.midi));
  const span = SECTION_END - SECTION_START;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative w-full rounded-lg bg-muted/50 cursor-pointer overflow-hidden"
      style={{ height: H }}
      onClick={e => {
        const r = ref.current?.getBoundingClientRect();
        if (r) onSeek(SECTION_START + ((e.clientX - r.left) / r.width) * span);
      }}
    >
      {notes.map(n => {
        const left = ((n.startSec - SECTION_START) / span) * 100;
        const w = Math.max(0.35, ((n.endSec - n.startSec) / span) * 100);
        const top = H - 8 - ((n.midi - lo) / Math.max(1, hi - lo)) * (H - 16);
        return (
          <div
            key={n.id}
            className="absolute rounded-sm bg-primary"
            style={{ left: `${left}%`, width: `${w}%`, top, height: 4, opacity: 0.25 + 0.75 * n.detectConf }}
          />
        );
      })}
      <div
        className="absolute inset-y-0 w-px bg-foreground/70 pointer-events-none"
        style={{ left: `${((t - SECTION_START) / span) * 100}%` }}
      />
      <span className="absolute left-1.5 top-1 text-[9px] text-muted-foreground/60 font-mono">MIDI {hi}</span>
      <span className="absolute left-1.5 bottom-1 text-[9px] text-muted-foreground/60 font-mono">{lo}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STRING_NAMES = ["high e", "B", "G", "D", "A", "low E"];

function Inspector({ note }: { note: ExtractedNote }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">
            Bar {note.bar} · beat {(note.beat / 4 + 1).toFixed(2).replace(/\.00$/, "")}
          </span>
          <span className="text-xs text-muted-foreground">
            {STRING_NAMES[note.string - 1]} string, fret {note.fret}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className={note.detectConf < FAINT ? "text-muted-foreground" : "text-foreground"}>
            detect {Math.round(note.detectConf * 100)}%
          </span>
          <span className={note.fretConf < AMBIGUOUS ? "text-amber-600 dark:text-amber-400" : "text-foreground"}>
            position {Math.round(note.fretConf * 100)}%
          </span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mb-1.5">
        {note.alts.length
          ? "Same pitch, other places on the neck — cost is how much worse the whole passage gets"
          : "Only one place on the neck plays this pitch"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-primary/10 ring-1 ring-primary/30 px-2 py-1 text-[11px] font-mono text-foreground">
          str {note.string} · fr {note.fret} <span className="text-primary">chosen</span>
        </span>
        {note.alts.map(a => (
          <button key={`${a.string}-${a.fret}`} className="rounded-md border border-border px-2 py-1 text-[11px] font-mono text-foreground hover:bg-muted flex items-center gap-1">
            str {a.string} · fr {a.fret}
            <span className="text-muted-foreground">+{a.extra}</span>
            <CaretRightIcon className="size-2.5 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
