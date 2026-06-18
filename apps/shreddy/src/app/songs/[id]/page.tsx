"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Slider,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@music-apps/ui";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  Repeat,
  X,
  Pencil,
  Loader2,
  Clock,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useMetronome } from "@/hooks/useMetronome";
import { usePitchShifter } from "@/hooks/usePitchShifter";
import { useTempoStretch } from "@/hooks/useTempoStretch";
import { useABLoop } from "@/hooks/useABLoop";
import { useSectionEditor } from "@/hooks/useSectionEditor";
import { WaveformBar } from "@/components/WaveformBar";
import { SectionStrip } from "@/components/SectionStrip";
import { MetronomePanel } from "@/components/MetronomePanel";
import { NotesPanel } from "@/components/NotesPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SilentToggle } from "@/components/SilentToggle";
import { CueOverlay } from "@/components/CueOverlay";
import { DistractionOverlay } from "@/components/DistractionOverlay";
import { StemMixer } from "@/components/StemMixer";
import { TempoSelect } from "@/components/TempoSelect";
import { useStemsEngine } from "@/hooks/useStemsEngine";
import { STEM_NAMES, type StemName } from "@/lib/stems-engine";
import { Brain } from "lucide-react";

interface Section {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
  autoDetected: boolean;
  masteryRating: number | null;
}

interface Song {
  id: string;
  title: string;
  normalizedAudioPath: string | null;
  durationSec: number | null;
  processingStatus: string;
  bpm: number | null;
  musicalKey: string;
  beatTimestamps: string | null;
  notes: string;
  lastPositionSec: number;
  lastTempo: number | null;
  lastPitch: number | null;
  lastSelectedSections: string | null;
  artist: string;
  album: string;
  genre: string;
  year: string;
  timeSignature: number;
  sections: Section[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function transposeKey(key: string, semitones: number): string {
  const match = key.match(/^([A-G]#?)\s*(Major|Minor)$/i);
  if (!match) return key;
  const idx = NOTE_NAMES.indexOf(match[1]);
  if (idx === -1) return key;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return `${NOTE_NAMES[newIdx]} ${match[2]}`;
}

// R1 Ultra-slow tempo: 0.1 .. 0.4 require a server-side ffmpeg stretch (iPad
// Safari clamps audio.playbackRate at 0.5). useTempoStretch handles the swap.
const TEMPO_VALUES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];


function PracticeSkeleton() {
  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3 mb-6 animate-pulse">
        <div className="size-8 rounded-lg bg-muted" />
        <div className="h-6 bg-muted rounded w-1/2" />
      </div>
      <div className="h-4 bg-muted rounded w-full mb-6 animate-pulse" />
      <div className="flex justify-center mb-6 animate-pulse">
        <div className="size-16 rounded-full bg-muted" />
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="flex gap-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded w-12" />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [song, setSong] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempo, setTempo] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopSong, setLoopSong] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsRestored, setSettingsRestored] = useState(false);

  // Metadata editing (title / artist / album / year)
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState({ title: "", artist: "", album: "", year: "" });

  // Notes
  const [notesDraft, setNotesDraft] = useState("");
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A-B loop (custom range, not section-based)
  const { abLoop, pendingA, setA: _setA, setB, clearABLoop } = useABLoop();

  // Section editor
  const {
    sectionDialogOpen, setSectionDialogOpen,
    editingSection, sectionName, setSectionName,
    sectionStart, setSectionStart, sectionEnd, setSectionEnd,
    openNewSection: _openNewSection, openEditSection,
    setStartToCurrent: _setStartToCurrent, setEndToCurrent: _setEndToCurrent,
    getParsedTimes, closeDialog: closeSectionDialog,
  } = useSectionEditor();

  // Interactive section border editing
  const [editMode, setEditMode] = useState(false);
  const [dragBorderIdx, setDragBorderIdx] = useState<number | null>(null);
  const [dragSections, setDragSections] = useState<Section[] | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [activePlayTime, setActivePlayTime] = useState(0);

  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const [metronomeStandalone, setMetronomeStandalone] = useState(false);

  // R3 Silent: mute audio + show rotating cue overlay above the waveform.
  // R6 Distraction: open the dual-task overlay below the waveform.
  const [silent, setSilent] = useState(false);
  const [distractionOpen, setDistractionOpen] = useState(false);

  const activePlayTimeRef = useRef(0);
  const [loopCounts, setLoopCounts] = useState<Record<string, number>>({});
  const [sectionTimes, setSectionTimes] = useState<Record<string, number>>({});
  const lastSectionRef = useRef<string | null>(null);
  const sectionEnteredAtRef = useRef<number>(Date.now());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Captured once from the first song fetch — used to seek to the user's last position
  // on initial load. We deliberately don't follow `song.lastPositionSec` afterwards,
  // because every PATCH that saves the bookmark would otherwise tear down the audio
  // element (and silently drop any pitched-audio source already loaded).
  const initialPositionRef = useRef<number | null>(null);

  const lastSaveRef = useRef(0);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSong = useCallback(async () => {
    try {
      const res = await fetch(`/api/songs/${id}`);
      if (!res.ok) throw new Error("Song not found");
      const data = await res.json();
      // Capture the bookmark from the first fetch only; subsequent refetches
      // (rename/delete/add section, periodic bookmark saves) must not move the play head.
      if (initialPositionRef.current === null) {
        initialPositionRef.current = data.lastPositionSec ?? 0;
      }
      setSong(data);
      setNotesDraft(data.notes || "");
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load song");
    }
  }, [id]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  // Restore last practice settings when song loads
  useEffect(() => {
    if (!song || settingsRestored) return;
    if (song.lastTempo !== null) setTempo(song.lastTempo);
    if (song.lastPitch !== null) setPitch(song.lastPitch);
    setSettingsRestored(true);
  }, [song, settingsRestored]);

  // Save practice settings on change (debounced)
  const savePracticeSettings = useCallback((t: number, p: number, sIds: string[]) => {
    if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastTempo: t,
          lastPitch: p,
          lastSelectedSections: JSON.stringify(sIds),
        }),
      }).catch(() => {});
    }, 1000);
  }, [id]);

  useEffect(() => {
    if (!settingsRestored) return;
    savePracticeSettings(tempo, pitch, selectedSectionIds);
  }, [tempo, pitch, selectedSectionIds, settingsRestored, savePracticeSettings]);

  // Start practice session on mount, end on unmount
  useEffect(() => {
    if (!song || song.processingStatus !== "ready") return;
    fetch("/api/practice-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: id, tempo, pitch }),
    })
      .then(res => res.json())
      .then(data => {
        setSessionId(data.id);
        sessionIdRef.current = data.id;
      })
      .catch(() => {});

    return () => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      const durationSec = activePlayTimeRef.current;
      const endData = JSON.stringify({
        endedAt: new Date().toISOString(),
        durationSec,
      });
      // Use fetch with keepalive (sendBeacon only sends POST, but we need PATCH)
      fetch(`/api/practice-sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: endData,
        keepalive: true,
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.processingStatus]);

  // Flush section practice logs periodically (every 30s)
  // Use refs so the interval doesn't get recreated when counts change
  const loopCountsRef = useRef(loopCounts);
  const sectionTimesRef = useRef(sectionTimes);
  loopCountsRef.current = loopCounts;
  sectionTimesRef.current = sectionTimes;

  useEffect(() => {
    if (!sessionId) return;

    const flush = () => {
      const counts = loopCountsRef.current;
      const times = sectionTimesRef.current;
      for (const sId of Object.keys(counts)) {
        if (counts[sId] > 0 || (times[sId] ?? 0) > 0) {
          fetch(`/api/practice-sessions/${sessionId}/logs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sectionId: sId,
              loopCount: counts[sId] ?? 0,
              durationSec: times[sId] ?? 0,
            }),
          }).catch(() => {});
        }
      }
    };

    flushTimerRef.current = setInterval(flush, 30000);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flush();
    };
  }, [sessionId]);

  // Track which section is currently playing and accumulate time
  useEffect(() => {
    if (!playing || !song) return;
    const interval = setInterval(() => {
      const cs = song.sections.find(
        s => currentTime >= s.startSec && currentTime < s.endSec
      );
      if (cs) {
        if (lastSectionRef.current !== cs.id) {
          // Section changed — if we had a previous section and loop is active, count a loop
          if (lastSectionRef.current && loopEnabled && selectedSectionIds.includes(lastSectionRef.current)) {
            setLoopCounts(prev => ({
              ...prev,
              [lastSectionRef.current!]: (prev[lastSectionRef.current!] ?? 0) + 1,
            }));
          }
          lastSectionRef.current = cs.id;
          sectionEnteredAtRef.current = Date.now();
        }
        // Accumulate time in current section
        setSectionTimes(prev => ({
          ...prev,
          [cs.id]: (prev[cs.id] ?? 0) + 1,
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [playing, song, currentTime, loopEnabled, selectedSectionIds]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setActivePlayTime(prev => {
        activePlayTimeRef.current = prev + 1;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [playing]);

  // Metronome
  const parsedBeats: number[] = (() => {
    if (!song?.beatTimestamps) return [];
    try { return JSON.parse(song.beatTimestamps); } catch { return []; }
  })();

  const { isActive: metronomeActive, currentBeat, tapSync, doCountIn, handleTapTempo, manualBpm, resetManualBpm } = useMetronome({
    bpm: (song?.bpm ?? 0) * tempo,
    enabled: metronomeEnabled,
    volume: metronomeVolume,
    playing,
    audioRef,
    beatTimestamps: parsedBeats,
    tempo,
    standalone: metronomeStandalone,
  });

  const baseBpm = manualBpm ?? song?.bpm ?? 0;
  const effectiveBpm = baseBpm * tempo;

  // Count-in then play
  async function handleCountInPlay() {
    if (!audioRef.current || playing) return;
    setMetronomeEnabled(true);
    await doCountIn();
    audioRef.current.play();
    setPlaying(true);
  }

  // Re-analyze
  const [reanalyzing, setReanalyzing] = useState(false);
  async function handleReanalyze() {
    if (reanalyzing) return;
    setReanalyzing(true);
    try {
      await fetch(`/api/songs/${id}/reanalyze`, { method: "POST" });
      // Poll until processing is done
      const poll = setInterval(async () => {
        const res = await fetch(`/api/songs/${id}`);
        const data = await res.json();
        if (data.processingStatus === "ready") {
          clearInterval(poll);
          setSong(data);
          setNotesDraft(data.notes || "");
          setReanalyzing(false);
        }
      }, 2000);
    } catch {
      setReanalyzing(false);
    }
  }

  const [sharing, setSharing] = useState(false);
  async function handleShare() {
    if (!song?.normalizedAudioPath || sharing) return;
    setSharing(true);
    try {
      // Selected stems = the ones the user has NOT muted in the dropdown.
      // When all 4 are on (the default), this is the full song. When some
      // are muted, the clip route mixes only the audible ones.
      const audibleStems = STEM_NAMES.filter((s) => !stems.muted[s]);
      const partialStems = audibleStems.length < STEM_NAMES.length;
      const useClip = selectedSectionIds.length > 0 && loopRange;
      let url: string;
      if (useClip || partialStems) {
        // Default clip range = whole song when no section is selected.
        const startSec = useClip ? loopRange.startSec : 0;
        const endSec = useClip ? loopRange.endSec : song.durationSec ?? 0;
        const qs = new URLSearchParams({
          start: String(startSec),
          end: String(endSec),
        });
        if (partialStems) qs.set("stems", audibleStems.join(","));
        url = `/api/songs/${song.id}/clip?${qs.toString()}`;
      } else {
        url = `/api/media/${song.normalizedAudioPath}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const suffixParts: string[] = [];
      if (useClip) {
        suffixParts.push(loopRange.names.length === 1 ? loopRange.names[0] : "Loop");
      }
      if (partialStems) {
        suffixParts.push(audibleStems.length === 1 ? audibleStems[0] : `${audibleStems.length}stems`);
      }
      const baseName = [song.artist, song.title, ...suffixParts]
        .filter(Boolean)
        .join(" - ");
      const safeName = baseName.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() + ".mp3";
      const file = new File([blob], safeName, { type: "audio/mpeg" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = safeName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* user cancelled share sheet */
    } finally {
      setSharing(false);
    }
  }

  // Set up audio element
  useEffect(() => {
    if (!song?.normalizedAudioPath) return;

    const audio = new Audio(`/api/media/${song.normalizedAudioPath}`);
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
      // Restore last position — read from the ref so we use the value from the
      // first fetch, not whatever the current `song` happens to hold.
      const initial = initialPositionRef.current ?? 0;
      if (initial > 0 && initial < audio.duration) {
        audio.currentTime = initial;
        setCurrentTime(initial);
      }
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      if (abLoopRef.current) {
        audio.currentTime = abLoopRef.current.a;
        audio.play();
      } else if (loopEnabledRef.current && loopRangeRef.current) {
        audio.currentTime = loopRangeRef.current.startSec;
        audio.play();
      } else if (loopSongRef.current) {
        audio.currentTime = 0;
        audio.play();
      } else {
        setPlaying(false);
      }
    });

    return () => {
      // Save position on unmount
      if (audio.currentTime > 0) {
        fetch(`/api/songs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPositionSec: audio.currentTime }),
        }).catch(() => {});
      }
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
    // Intentionally NOT depending on song.lastPositionSec — see initialPositionRef.
  }, [song?.normalizedAudioPath, id]);

  // R5 stems: pre-decode in the background as soon as the server reports
  // stems ready, so the dropdown's checkboxes apply with no perceptible
  // latency. Trades ~250MB of decoded audio for instant interaction.
  const stems = useStemsEngine({ songId: song?.id ?? null, eager: true });
  const stemsActive = !!stems.engine;
  const anyStemMuted = useMemo(
    () => Object.values(stems.muted).some(Boolean),
    [stems.muted]
  );

  // R3 Silent + R5 stems: keep audio.muted in sync. The audio element is
  // recreated when normalizedAudioPath swaps (pitch / tempo render), so this
  // effect re-applies after a swap. When the stems engine is active the
  // audible output comes from it; the audio element stays muted but keeps
  // playing so currentTime / loops / bookmark logic still work unchanged.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = silent || stemsActive;
  }, [silent, stemsActive, song?.normalizedAudioPath]);

  // Mirror play/pause/tempo from the audio element into the stems engine.
  // Seek is mirrored explicitly at each user-seek call site (see seek()).
  useEffect(() => {
    const engine = stems.engine;
    const audio = audioRef.current;
    if (!engine || !audio) return;
    if (playing) {
      engine.play(audio.currentTime, tempo);
    } else {
      engine.pause();
    }
  }, [playing, stems.engine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    stems.engine?.setPlaybackRate(tempo);
  }, [tempo, stems.engine]);

  // First-mute handler. Activates the engine (lazy load + decode the 4
  // stems), then applies the requested mute. Audio element keeps playing,
  // muted, so currentTime + transport logic stay intact.
  const handleStemMuteToggle = useCallback(
    async (stem: StemName) => {
      const next = !stems.muted[stem];
      if (!stems.engine) {
        const engine = await stems.activate();
        if (!engine) return; // stems weren't ready yet
        // After activation, sync to current playback so the engine catches up.
        const audio = audioRef.current;
        if (audio) {
          if (!audio.paused) {
            engine.play(audio.currentTime, tempo);
          } else {
            engine.seek(audio.currentTime, tempo);
          }
        }
      }
      stems.setMute(stem, next);
    },
    [stems, tempo]
  );

  // Save bookmark every 10 seconds while playing
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (audio && Math.abs(audio.currentTime - lastSaveRef.current) > 5) {
        lastSaveRef.current = audio.currentTime;
        fetch(`/api/songs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastPositionSec: audio.currentTime }),
        }).catch(() => {});
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [playing, id]);

  const loopRange = useMemo(() => {
    if (selectedSectionIds.length === 0 || !song) return null;
    const selected = song.sections.filter((s) => selectedSectionIds.includes(s.id));
    if (selected.length === 0) return null;
    const startSec = Math.min(...selected.map((s) => s.startSec));
    const endSec = Math.max(...selected.map((s) => s.endSec));
    const names = selected.sort((a, b) => a.orderIndex - b.orderIndex).map((s) => s.name);
    return { startSec, endSec, names };
  }, [selectedSectionIds, song]);

  const loopRangeRef = useRef(loopRange);
  const abLoopRef = useRef(abLoop);
  const loopEnabledRef = useRef(loopEnabled);
  const loopSongRef = useRef(loopSong);
  loopRangeRef.current = loopRange;
  abLoopRef.current = abLoop;
  loopEnabledRef.current = loopEnabled;
  loopSongRef.current = loopSong;

  // Loop enforcement via rAF — only active when a loop mode is on
  const hasAnyLoop = loopSong || (loopEnabled && !!loopRange) || !!abLoop;
  useEffect(() => {
    if (!playing || !hasAnyLoop) return;
    let rafId: number;

    const check = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const t = audio.currentTime;
      const dur = audio.duration;

      // A-B loop takes highest priority
      if (abLoopRef.current) {
        if (t >= abLoopRef.current.b) {
          audio.currentTime = abLoopRef.current.a;
        }
      }
      // Section loop
      else if (loopEnabledRef.current && loopRangeRef.current) {
        if (t >= loopRangeRef.current.endSec || t < loopRangeRef.current.startSec) {
          audio.currentTime = loopRangeRef.current.startSec;
        }
      }
      // Whole-song loop
      else if (loopSongRef.current && dur > 0 && t >= dur - 0.05) {
        audio.currentTime = 0;
        if (audio.paused) audio.play();
      }

      rafId = requestAnimationFrame(check);
    };

    rafId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(rafId);
  }, [playing, hasAnyLoop]);

  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const { processing: pitchProcessing } = usePitchShifter({
    songId: song?.id ?? null,
    audioUrl: song?.normalizedAudioPath ? `/api/media/${song.normalizedAudioPath}` : null,
    pitch, tempo, audioRef, onPause: pausePlayback,
  });

  // R1 Ultra-slow: when tempo < 0.5 (and pitch == 0), useTempoStretch renders
  // and swaps audio.src. Otherwise it's a no-op and the normal playbackRate
  // path runs.
  const { processing: tempoProcessing } = useTempoStretch({
    songId: song?.id ?? null,
    audioUrl: song?.normalizedAudioPath ? `/api/media/${song.normalizedAudioPath}` : null,
    tempo, pitch, audioRef, onPause: pausePlayback,
  });

  const transportBusy = pitchProcessing || tempoProcessing;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || transportBusy) return;
    if (playing) {
      audio.pause();
    } else {
      if (abLoop && (audio.currentTime < abLoop.a || audio.currentTime >= abLoop.b)) {
        audio.currentTime = abLoop.a;
        setCurrentTime(abLoop.a);
      } else if (loopEnabled && loopRange && (audio.currentTime < loopRange.startSec || audio.currentTime >= loopRange.endSec)) {
        audio.currentTime = loopRange.startSec;
        setCurrentTime(loopRange.startSec);
      }
      audio.play();
    }
    setPlaying(!playing);
  }

  function seek(value: number | readonly number[]) {
    const audio = audioRef.current;
    if (!audio) return;
    const v = Array.isArray(value) ? value[0] : value;
    audio.currentTime = v;
    setCurrentTime(v);
    // Stems engine doesn't observe audio.currentTime — mirror explicitly so
    // it stays sample-locked with the visible playhead after a user seek.
    stems.engine?.seek(v, tempo);
  }

  function jumpToStart() {
    const audio = audioRef.current;
    if (!audio) return;
    if (abLoop) {
      audio.currentTime = abLoop.a;
    } else if (loopEnabled && loopRange) {
      audio.currentTime = loopRange.startSec;
    } else {
      audio.currentTime = 0;
    }
    setCurrentTime(audio.currentTime);
  }

  function selectSection(section: Section, extend: boolean) {
    // Clear A-B loop when selecting sections
    if (abLoop) {
      clearLoop();
    }

    if (extend && selectedSectionIds.length > 0 && song) {
      // Shift+click: range selection (desktop)
      const allIds = song.sections.map((s) => s.id);
      const firstSelectedIdx = allIds.indexOf(selectedSectionIds[0]);
      const clickedIdx = allIds.indexOf(section.id);
      const start = Math.min(firstSelectedIdx, clickedIdx);
      const end = Math.max(firstSelectedIdx, clickedIdx);
      const rangeIds = allIds.slice(start, end + 1);
      setSelectedSectionIds(rangeIds);
    } else if (selectedSectionIds.includes(section.id)) {
      // Tap-to-toggle: deselect if already selected
      const remaining = selectedSectionIds.filter(sid => sid !== section.id);
      if (remaining.length === 0) {
        clearLoop();
        return;
      }
      setSelectedSectionIds(remaining);
    } else if (selectedSectionIds.length > 0) {
      // Tap-to-toggle: add to selection (touch-friendly multi-select)
      setSelectedSectionIds([...selectedSectionIds, section.id]);
    } else {
      // First selection
      setSelectedSectionIds([section.id]);
    }
    setLoopEnabled(true);
    if (audioRef.current) {
      audioRef.current.currentTime = section.startSec;
      setCurrentTime(section.startSec);
    }
  }

  function clearLoop() {
    setSelectedSectionIds([]);
    setLoopEnabled(false);
  }

  function setA() {
    clearLoop();
    _setA(currentTime);
  }

  function openMetadataDialog() {
    if (!song) return;
    setMetadataDraft({
      title: song.title,
      artist: song.artist,
      album: song.album,
      year: song.year,
    });
    setMetadataDialogOpen(true);
  }

  async function saveMetadata() {
    if (!song || !metadataDraft.title.trim()) return;
    // Only send fields that actually changed.
    const patch: Record<string, string> = {};
    if (metadataDraft.title !== song.title) patch.title = metadataDraft.title;
    if (metadataDraft.artist !== song.artist) patch.artist = metadataDraft.artist;
    if (metadataDraft.album !== song.album) patch.album = metadataDraft.album;
    if (metadataDraft.year !== song.year) patch.year = metadataDraft.year;
    if (Object.keys(patch).length === 0) {
      setMetadataDialogOpen(false);
      return;
    }
    await fetch(`/api/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setMetadataDialogOpen(false);
    await fetchSong();
  }

  // Notes auto-save
  function handleNotesChange(value: string) {
    setNotesDraft(value);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/songs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      }).catch(() => {});
    }, 1000);
  }

  function openNewSection() {
    _openNewSection(currentTime, duration);
  }

  async function saveSection() {
    const { startSec, endSec } = getParsedTimes();
    if (!sectionName.trim() || endSec <= startSec) return;

    if (editingSection) {
      // Pause on rename (name changed) so the user can re-orient. Time-only edits
      // via this dialog are treated like border adjustments and keep playing.
      // Adding a new section (the else branch) also keeps playing.
      if (sectionName !== editingSection.name) pausePlayback();
      await fetch(`/api/sections/${editingSection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sectionName, startSec, endSec }),
      });
    } else {
      await fetch(`/api/songs/${id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sectionName, startSec, endSec }),
      });
    }

    closeSectionDialog();
    await fetchSong();
  }

  async function deleteSection(sectionId: string) {
    pausePlayback();
    await fetch(`/api/sections/${sectionId}`, { method: "DELETE" });
    if (selectedSectionIds.includes(sectionId)) {
      const remaining = selectedSectionIds.filter((id) => id !== sectionId);
      setSelectedSectionIds(remaining);
      if (remaining.length === 0) setLoopEnabled(false);
    }
    await fetchSong();
  }

  function setStartToCurrent() {
    _setStartToCurrent(currentTime);
  }

  function setEndToCurrent() {
    _setEndToCurrent(currentTime);
  }

  // Interactive border dragging
  const displaySections = dragSections ?? song?.sections ?? [];

  function handleBorderPointerDown(borderIdx: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!song) return;
    setDragBorderIdx(borderIdx);
    setDragSections([...song.sections]);

    const onMove = (ev: PointerEvent) => {
      if (!waveformRef.current || !song) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const timeSec = pct * duration;

      setDragSections(prev => {
        if (!prev) return prev;
        const sections = [...prev];
        const left = sections[borderIdx];
        const right = sections[borderIdx + 1];
        if (!left || !right) return prev;

        // Minimum section width of 0.5 seconds
        const minLeft = (borderIdx > 0 ? sections[borderIdx - 1].endSec : left.startSec) + 0.5;
        const maxRight = (borderIdx + 2 < sections.length ? sections[borderIdx + 2].startSec : right.endSec) - 0.5;
        const clampedTime = Math.max(minLeft, Math.min(maxRight, timeSec));

        sections[borderIdx] = { ...left, endSec: clampedTime };
        sections[borderIdx + 1] = { ...right, startSec: clampedTime };
        return sections;
      });
    };

    const onUp = async () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setDragBorderIdx(null);

      // Persist the changes and update local song state (no refetch to avoid stopping music)
      setDragSections(prev => {
        if (!prev || !song) return null;
        const left = prev[borderIdx];
        const right = prev[borderIdx + 1];
        if (left && right) {
          // Save to API in background
          fetch(`/api/sections/${left.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endSec: left.endSec }),
          }).catch(() => {});
          fetch(`/api/sections/${right.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ startSec: right.startSec }),
          }).catch(() => {});
          // Update local song state with new section boundaries
          setSong(s => s ? { ...s, sections: prev } : s);
        }
        return null;
      });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // Format practice time
  function formatPracticeTime(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  if (!song && !loadError) {
    return <PracticeSkeleton />;
  }

  if (loadError) {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-4" />
          Library
        </button>
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-destructive/10 mb-4">
            <X className="size-6 text-destructive" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Failed to load song</p>
          <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
          <Button variant="outline" onClick={() => { setLoadError(null); fetchSong(); }}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!song) return null;

  if (song.processingStatus !== "ready") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="size-4" />
          Library
        </button>
        <h1 className="text-xl font-semibold mb-4 text-foreground">{song.title}</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Song is {song.processingStatus}...</span>
        </div>
      </main>
    );
  }

  const currentSection = song.sections.find(
    (s) => currentTime >= s.startSec && currentTime < s.endSec
  );

  const metaParts: string[] = [];
  if (song.artist) metaParts.push(song.artist);
  if (song.album) metaParts.push(song.album);
  if (song.year) metaParts.push(song.year);

  return (
    <main className="flex-1 w-full px-3 sm:px-4 lg:px-8 py-3 sm:py-4 max-w-7xl mx-auto">
      {/* ===== TOP: Header + Player (full width) ===== */}
      <div className="mb-4">
        {/* Header row: back + title + metadata */}
        <div className="flex items-start gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition-all mt-0.5 shrink-0"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-semibold truncate text-foreground cursor-pointer hover:text-foreground/80 transition-colors group inline-flex items-center"
              onClick={openMetadataDialog}
              title="Edit title / artist / album / year"
            >
              <span className="truncate">{song.title}</span>
              <Pencil className="size-3.5 ml-2 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
            </h1>
            {/* Metadata pills row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {metaParts.length > 0 ? (
                <button
                  onClick={openMetadataDialog}
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors text-left"
                  title="Edit title / artist / album / year"
                >
                  {metaParts.join(" · ")}
                </button>
              ) : (
                <button
                  onClick={openMetadataDialog}
                  className="text-[13px] text-muted-foreground/60 hover:text-foreground transition-colors italic"
                  title="Add artist, album, year"
                >
                  Add artist…
                </button>
              )}
              {song.genre && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{song.genre}</span>
              )}
              {song.musicalKey && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  {pitch !== 0 ? transposeKey(song.musicalKey, pitch) : song.musicalKey}
                </span>
              )}
              {song.bpm && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{Math.round(song.bpm)} BPM</span>
              )}
              <button
                onClick={async () => {
                  const next = song.timeSignature === 4 ? 3 : song.timeSignature === 3 ? 6 : 4;
                  await fetch(`/api/songs/${song.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ timeSignature: next }),
                  });
                  fetchSong();
                }}
                className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full hover:bg-accent transition-colors"
                title="Click to change time signature"
              >
                {song.timeSignature === 6 ? "6/8" : `${song.timeSignature}/4`}
              </button>
              {song.durationSec && (
                <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{formatTime(song.durationSec)}</span>
              )}
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full hover:bg-accent transition-colors flex items-center gap-1"
                title="Re-analyze sections and BPM"
              >
                <RefreshCw className={`size-3 ${reanalyzing ? "animate-spin" : ""}`} />
                {reanalyzing ? "Analyzing..." : "Re-analyze"}
              </button>
              {song.normalizedAudioPath && (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full hover:bg-accent transition-colors flex items-center gap-1"
                  title="Share audio file"
                >
                  {sharing ? <Loader2 className="size-3 animate-spin" /> : <Share2 className="size-3" />}
                  {sharing ? "Sharing..." : "Share"}
                </button>
              )}
              <SilentToggle silent={silent} onToggle={() => setSilent((s) => !s)} />
              <button
                onClick={() => setDistractionOpen((d) => !d)}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                  distractionOpen
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
                title={
                  distractionOpen
                    ? "Distraction practice on"
                    : "Add dual-task distractions (advanced — R6)"
                }
              >
                <Brain className="size-3" />
                Distract
              </button>
              {activePlayTime > 0 && (
                <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 ml-auto">
                  <Clock className="size-3" />
                  Session: {formatPracticeTime(activePlayTime)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* R3 Mental Rehearsal cue prompt — rendered only when Silent is on. */}
        {silent && (
          <CueOverlay
            currentTime={currentTime}
            bpm={song.bpm}
            beatsPerBar={song.timeSignature}
          />
        )}

        {/* === LARGE WAVEFORM BAR (Cinema Transport) === */}
        {duration > 0 && song.sections.length > 0 ? (
          <ErrorBoundary>
          <WaveformBar
            sections={displaySections}
            duration={duration}
            currentTime={currentTime}
            selectedSectionIds={selectedSectionIds}
            abLoop={abLoop}
            editMode={editMode}
            dragBorderIdx={dragBorderIdx}
            waveformRef={waveformRef}
            currentSectionName={currentSection?.name}
            onSeek={(v) => seek(v)}
            onBorderPointerDown={handleBorderPointerDown}
          />
          </ErrorBoundary>
        ) : (
          <div className="mb-3">
            <div className="relative">
              {abLoop && duration > 0 && (
                <div
                  className="absolute z-0 pointer-events-none rounded-sm bg-orange-200 dark:bg-orange-800"
                  style={{
                    left: `${(abLoop.a / duration) * 100}%`,
                    width: `${((abLoop.b - abLoop.a) / duration) * 100}%`,
                    top: "6px",
                    height: "4px",
                  }}
                />
              )}
              <Slider min={0} max={duration || 100} step={0.1} value={[currentTime]} onValueChange={seek} className="w-full" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span className="tabular-nums">{formatTime(currentTime)}</span>
              <span className="tabular-nums">{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* R6 Distraction practice — rendered only when toggled on. Fixed-height
            internal cards prevent layout shift when distractors spawn/clear. */}
        {distractionOpen && (
          <DistractionOverlay
            playing={playing}
            currentTime={currentTime}
            onClose={() => setDistractionOpen(false)}
          />
        )}

        {/* === UNIFIED TRANSPORT BAR === */}
        <div className="sticky bottom-2 z-30 bg-card/95 backdrop-blur border border-border rounded-2xl p-3 mb-3 shadow-lg shadow-black/5">
          {/* Top row: tempo + (desktop-only transport) + stems + pitch.
              Tempo and stems use compact dropdowns so the whole row fits on
              iPhone width without horizontal scroll. */}
          <div className="flex md:items-center md:justify-between gap-2 mb-2 md:mb-0 flex-wrap md:flex-nowrap">
            {/* Tempo dropdown — single button + grid popover */}
            <TempoSelect
              value={tempo}
              values={TEMPO_VALUES}
              onChange={setTempo}
              busy={tempoProcessing}
            />

            {/* Center: Transport controls — hidden on phone, shown on md+ */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => setLoopSong(!loopSong)}
                className={`size-11 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                  loopSong ? "text-primary" : "text-muted-foreground/30"
                }`}
                title={loopSong ? "Song will loop" : "Song will stop at end"}
              >
                <Repeat className="size-5" />
              </button>
              <Button variant="outline" size="icon" onClick={jumpToStart} className="size-11 active:scale-90">
                <SkipBack className="size-5" />
              </Button>
              <button
                className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-sm disabled:opacity-50"
                onClick={togglePlay}
                disabled={transportBusy}
              >
                {transportBusy ? <Loader2 className="size-7 animate-spin" /> : playing ? <Pause className="size-7" /> : <Play className="size-7 ml-0.5" />}
              </button>
              <Button
                variant="outline"
                size="icon"
                onClick={setA}
                className={`size-11 text-sm font-bold active:scale-90 ${
                  pendingA !== null || abLoop ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" : ""
                }`}
                title={abLoop ? `A: ${formatTime(abLoop.a)}` : pendingA !== null ? `A: ${formatTime(pendingA)}` : "Set A point"}
              >
                A
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setB(currentTime)}
                disabled={pendingA === null}
                className={`size-11 text-sm font-bold active:scale-90 ${
                  abLoop ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" : ""
                }`}
                title={abLoop ? `B: ${formatTime(abLoop.b)}` : "Set B point"}
              >
                B
              </Button>
              {(pendingA !== null || abLoop) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearABLoop}
                  className="size-11 text-muted-foreground hover:text-destructive active:scale-90"
                  title="Clear A-B loop"
                >
                  <X className="size-5" />
                </Button>
              )}
            </div>

            {/* Stems dropdown — single button + checkbox menu */}
            <StemMixer
              state={stems.state}
              muted={stems.muted}
              onMuteToggle={handleStemMuteToggle}
            />

            {/* Pitch — compact on phone (no label, smaller buttons), full on desktop */}
            <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-0">
              <span className="hidden md:inline text-xs text-muted-foreground whitespace-nowrap mr-1">Pitch</span>
              <button
                onClick={() => setPitch(Math.max(-6, pitch - 1))}
                disabled={pitch <= -6}
                className="size-9 md:size-11 rounded-lg border border-border flex items-center justify-center text-base font-medium active:scale-90 transition-transform disabled:opacity-30"
                title="Pitch down"
              >
                −
              </button>
              <span className="text-sm font-medium tabular-nums w-8 text-center">{pitch > 0 ? `+${pitch}` : pitch}</span>
              <button
                onClick={() => setPitch(Math.min(6, pitch + 1))}
                disabled={pitch >= 6}
                className="size-9 md:size-11 rounded-lg border border-border flex items-center justify-center text-base font-medium active:scale-90 transition-transform disabled:opacity-30"
                title="Pitch up"
              >
                +
              </button>
            </div>
          </div>

          {/* Bottom row on phone: transport controls centered. Hidden on md+ (shown in row above) */}
          <div className="flex md:hidden items-center justify-center gap-3">
            <button
              onClick={() => setLoopSong(!loopSong)}
              className={`size-11 rounded-full flex items-center justify-center active:scale-90 transition-all ${
                loopSong ? "text-primary" : "text-muted-foreground/30"
              }`}
              title={loopSong ? "Song will loop" : "Song will stop at end"}
            >
              <Repeat className="size-5" />
            </button>
            <Button variant="outline" size="icon" onClick={jumpToStart} className="size-11 active:scale-90">
              <SkipBack className="size-5" />
            </Button>
            <button
              className="size-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform shadow-sm disabled:opacity-50"
              onClick={togglePlay}
              disabled={pitchProcessing}
            >
              {pitchProcessing ? <Loader2 className="size-7 animate-spin" /> : playing ? <Pause className="size-7" /> : <Play className="size-7 ml-0.5" />}
            </button>
            <Button
              variant="outline"
              size="icon"
              onClick={setA}
              className={`size-11 text-sm font-bold active:scale-90 ${
                pendingA !== null || abLoop ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" : ""
              }`}
              title={abLoop ? `A: ${formatTime(abLoop.a)}` : pendingA !== null ? `A: ${formatTime(pendingA)}` : "Set A point"}
            >
              A
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setB(currentTime)}
              disabled={pendingA === null}
              className={`size-11 text-sm font-bold active:scale-90 ${
                abLoop ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 hover:text-white" : ""
              }`}
              title={abLoop ? `B: ${formatTime(abLoop.b)}` : "Set B point"}
            >
              B
            </Button>
            {(pendingA !== null || abLoop) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearABLoop}
                className="size-11 text-muted-foreground hover:text-destructive active:scale-90"
                title="Clear A-B loop"
              >
                <X className="size-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Loop / A-B indicators */}
        {(loopEnabled && loopRange) || abLoop || (pendingA !== null && !abLoop) ? (
          <div className="space-y-1.5 mb-3">
            {loopEnabled && loopRange && (
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Repeat className="size-3 text-blue-500 shrink-0" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  {loopRange.names.join(" + ")} ({formatTime(loopRange.startSec)} – {formatTime(loopRange.endSec)})
                </span>
                <button onClick={clearLoop} className="p-1.5 -mr-1 rounded-lg text-blue-400 hover:text-blue-600 active:scale-90 transition-all">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {abLoop && (
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <Repeat className="size-3 text-orange-500 shrink-0" />
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  A-B Loop: {formatTime(abLoop.a)} – {formatTime(abLoop.b)}
                </span>
                <button onClick={clearABLoop} className="p-1.5 -mr-1 rounded-lg text-orange-400 hover:text-orange-600 active:scale-90 transition-all">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {pendingA !== null && !abLoop && (
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <span className="text-xs text-orange-600 dark:text-orange-400">
                  Point A at {formatTime(pendingA)} — navigate to B and press B
                </span>
                <button onClick={clearABLoop} className="p-1.5 -mr-1 rounded-lg text-orange-400 hover:text-orange-600 active:scale-90 transition-all">
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* === HORIZONTAL SECTIONS STRIP === */}
      <ErrorBoundary>
      <SectionStrip
        sections={song.sections}
        selectedSectionIds={selectedSectionIds}
        currentTime={currentTime}
        loopCounts={loopCounts}
        editMode={editMode}
        beatTimestamps={parsedBeats}
        timeSignature={song.timeSignature ?? 4}
        songMeta={{
          title: song.title,
          artist: song.artist,
          musicalKey: song.musicalKey,
          bpm: song.bpm,
          durationSec: song.durationSec,
        }}
        onEditModeToggle={() => setEditMode(!editMode)}
        onSelectSection={(section) => selectSection(section, false)}
        onEditSection={openEditSection}
        onDeleteSection={deleteSection}
        onAddSection={openNewSection}
      />
      </ErrorBoundary>

      {/* === COMPACT BOTTOM: Metronome + Notes === */}
      <ErrorBoundary>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MetronomePanel
          enabled={metronomeEnabled}
          onToggle={() => setMetronomeEnabled(!metronomeEnabled)}
          active={metronomeActive}
          currentBeat={currentBeat}
          volume={metronomeVolume}
          onVolumeChange={setMetronomeVolume}
          baseBpm={baseBpm}
          effectiveBpm={effectiveBpm}
          manualBpm={manualBpm}
          parsedBeatsCount={parsedBeats.length}
          playing={playing}
          standalone={metronomeStandalone}
          onStandaloneToggle={() => setMetronomeStandalone(!metronomeStandalone)}
          onTapTempo={handleTapTempo}
          onTapSync={tapSync}
          onCountInPlay={handleCountInPlay}
          onResetManualBpm={resetManualBpm}
        />
        <NotesPanel
          notesDraft={notesDraft}
          onNotesChange={handleNotesChange}
        />
      </div>
      </ErrorBoundary>

      {/* Metadata editor dialog */}
      <Dialog open={metadataDialogOpen} onOpenChange={setMetadataDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit metadata</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="meta-title">Title</Label>
              <Input
                id="meta-title"
                value={metadataDraft.title}
                onChange={(e) => setMetadataDraft({ ...metadataDraft, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveMetadata(); }}
                autoFocus
                className="h-10"
              />
            </div>
            <div>
              <Label htmlFor="meta-artist">Artist</Label>
              <Input
                id="meta-artist"
                value={metadataDraft.artist}
                onChange={(e) => setMetadataDraft({ ...metadataDraft, artist: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveMetadata(); }}
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="meta-album">Album</Label>
                <Input
                  id="meta-album"
                  value={metadataDraft.album}
                  onChange={(e) => setMetadataDraft({ ...metadataDraft, album: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveMetadata(); }}
                  className="h-10"
                />
              </div>
              <div>
                <Label htmlFor="meta-year">Year</Label>
                <Input
                  id="meta-year"
                  value={metadataDraft.year}
                  onChange={(e) => setMetadataDraft({ ...metadataDraft, year: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveMetadata(); }}
                  placeholder="2024"
                  className="h-10"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setMetadataDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveMetadata} disabled={!metadataDraft.title.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Section editor dialog */}
      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? "Edit Section" : "New Section"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="section-name">Name</Label>
              <Input
                id="section-name"
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="e.g., Verse 1, Chorus"
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="section-start">Start (m:ss)</Label>
                <div className="flex gap-1">
                  <Input
                    id="section-start"
                    value={sectionStart}
                    onChange={(e) => setSectionStart(e.target.value)}
                    placeholder="0:00"
                    className="h-10"
                  />
                  <Button variant="outline" size="sm" onClick={setStartToCurrent} title="Use current time" className="h-10">
                    Now
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="section-end">End (m:ss)</Label>
                <div className="flex gap-1">
                  <Input
                    id="section-end"
                    value={sectionEnd}
                    onChange={(e) => setSectionEnd(e.target.value)}
                    placeholder="0:30"
                    className="h-10"
                  />
                  <Button variant="outline" size="sm" onClick={setEndToCurrent} title="Use current time" className="h-10">
                    Now
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveSection}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
