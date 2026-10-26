"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@music-apps/ui";
import { BackToHome } from "@music-apps/shared/back-to-home";
import { ArrowClockwiseIcon, ArrowLineLeftIcon, ArrowLineRightIcon, CircleNotchIcon, ScissorsIcon } from "@phosphor-icons/react";
import { PracticeControls, ViewSwitch, CROP_PRESETS, type CropValue } from "@/components/PracticeControls";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Source {
  id: string;
  title: string;
  artist: string | null;
  youtubeUrl: string;
  videoPath: string | null;
  audioPath: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  waveformData: string | null;
  processingStatus: string;
  licks: SourceLick[];
  sections: SourceSection[];
}

interface SourceLick {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

interface SourceSection {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  autoDetected: boolean;
  detectedBy: string | null;
}

// Cycled by index so adjacent sections stay visually distinct.
const SECTION_COLORS = [
  "bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-cyan-500", "bg-fuchsia-500", "bg-lime-500", "bg-orange-500", "bg-teal-500",
];

/** 91.5 → "1:31.5" — the clip nudges move in half seconds, so show tenths. */
function formatPrecise(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

/**
 * One edge of a clip: its time, half-second nudges, and a big "Mark" that
 * drops it at the playhead — the move you make while the video plays.
 */
function TimeBox({
  edge,
  value,
  onNudge,
  onMark,
  accent,
}: {
  edge: "start" | "end";
  value: number;
  onNudge: (delta: number) => void;
  onMark: () => void;
  accent: "loop" | "emerald";
}) {
  const MarkIcon = edge === "start" ? ArrowLineRightIcon : ArrowLineLeftIcon;
  const nudgeClass =
    "h-10 flex-1 rounded-xl bg-background/60 text-sm font-semibold font-mono text-muted-foreground hover:text-foreground active:scale-95 transition-all";
  return (
    <div className="rounded-2xl bg-muted p-3 flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {edge === "start" ? "Start" : "End"}
      </span>
      <span className="text-2xl font-semibold font-mono leading-none">{formatPrecise(value)}</span>
      <div className="flex gap-2">
        <button className={nudgeClass} onClick={() => onNudge(-0.5)} aria-label={`${edge} back half a second`}>
          −0.5
        </button>
        <button className={nudgeClass} onClick={() => onNudge(0.5)} aria-label={`${edge} forward half a second`}>
          +0.5
        </button>
      </div>
      <button
        className={`h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold active:scale-95 transition-all ${
          accent === "loop" ? "bg-loop/15 text-loop hover:bg-loop/25" : "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
        }`}
        onClick={onMark}
      >
        <MarkIcon className="size-5" />
        Mark {edge}
      </button>
    </div>
  );
}

interface AutoLickJob {
  status: "running" | "done" | "error";
  created: number;
  total: number;
  message?: string;
}

interface Folder {
  id: string;
  name: string;
  _count: { lickFolders: number; sourceFolders: number };
}

export default function ClipperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const [sourceId, setSourceId] = useState<string>("");
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Practice controls — same set as the lick player, so a chapter can be
  // worked on here without cutting it into a lick first. Loop covers the clip
  // range (which the structure strip sets), unless A-B narrows it further.
  const [speed, setSpeed] = useState(1.0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [abA, setAbA] = useState<number | null>(null);
  const [abB, setAbB] = useState<number | null>(null);
  const [crop, setCrop] = useState<CropValue>("full");
  const [pitch, setPitch] = useState(0);
  const [pitchProcessing, setPitchProcessing] = useState(false);
  const pitchAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevPitchRef = useRef(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  // 0 = off; otherwise Play counts in this many seconds first.
  const [countdownDuration, setCountdownDuration] = useState(0);
  const [countdownOnLoop, setCountdownOnLoop] = useState(false);
  const countdownOnLoopRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCountingDownRef = useRef(false);
  const countdownSeekTarget = useRef<number | null>(null);
  const wasMutedBeforeCountdown = useRef(false);

  // New lick — named inline before saving, no dialog
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lickName, setLickName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [saving, setSaving] = useState(false);

  // New folder inline
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Lick boundary adjustment
  const [adjustingLick, setAdjustingLick] = useState<{ id: string; edge: "start" | "end" } | null>(null);
  const [adjustingBoundary, setAdjustingBoundary] = useState(false);

  // Structure analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"chapters" | "model">("chapters");

  // Chapter licks are cut in the background after analysis — non-null while
  // that run is in flight.
  const [autoLickJob, setAutoLickJob] = useState<AutoLickJob | null>(null);

  // Lick selection / inline edit
  const [selectedLickId, setSelectedLickId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingLick, setDeletingLick] = useState(false);
  const lickSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLickRef = useRef<{ id: string; startSec: number; endSec: number } | null>(null);
  // Stable, so it fires once when a lick's editor opens rather than on every
  // playhead frame: brings the editor into view in the scrolling list.
  const revealEditor = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setSourceId(id));
  }, [params]);

  const fetchSource = useCallback(async () => {
    if (!sourceId) return;
    try {
      const res = await fetch(`/lickbank/api/sources/${sourceId}`);
      if (!res.ok) {
        setError("Source not found");
        return;
      }
      const data: Source = await res.json();
      setSource(data);
      if (data.durationSec) {
        setDuration((prev) => prev || data.durationSec!);
        setClipEnd((prev) => prev || data.durationSec!);
      }
    } catch {
      setError("Failed to load source");
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    fetchSource();
  }, [fetchSource]);

  useEffect(() => {
    fetch("/lickbank/api/folders")
      .then((r) => r.json())
      .then(setFolders)
      .catch(() => {});
  }, []);

  // The model runs in the background, so the server tracks the job and we poll
  // it for a real outcome — a crash reports as a crash instead of looking
  // identical to "found nothing".
  useEffect(() => {
    if (!analyzing || !sourceId) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/lickbank/api/sources/${sourceId}/analyze`);
        if (!res.ok) return;
        const job = await res.json();
        if (job.status === "running") return;

        setAnalyzing(false);
        if (job.status === "done" && job.count > 0) {
          await fetchSource();
          setSaveMessage({ type: "success", text: `Found ${job.count} sections` });
          setTimeout(() => setSaveMessage(null), 3000);
          // The server cuts a lick per section the moment they're written —
          // watch that run so the clips appear as they land, not on reload.
          setAutoLickJob({ status: "running", created: 0, total: 0 });
        } else if (job.status === "idle") {
          // The server lost the job (restart / hot reload) but the run still
          // writes its sections — so ask the database, not the job map.
          const res2 = await fetch(`/lickbank/api/sources/${sourceId}`);
          const data: Source = await res2.json();
          setSource(data);
          setSaveMessage(
            data.sections.length > 0
              ? { type: "success", text: `Found ${data.sections.length} sections` }
              : { type: "error", text: "The server restarted — analysis result was lost" }
          );
          setTimeout(() => setSaveMessage(null), 5000);
          if (data.sections.length > 0) {
            setAutoLickJob({ status: "running", created: 0, total: 0 });
          }
        } else {
          setSaveMessage({
            type: "error",
            text: job.message || "No structure detected",
          });
          setTimeout(() => setSaveMessage(null), 8000);
        }
      } catch {
        // Transient — keep polling.
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [analyzing, sourceId, fetchSource]);

  // A model run outlives the page, so pick the spinner back up after a reload
  // instead of showing an idle button while the machine is busy.
  useEffect(() => {
    if (!sourceId) return;
    fetch(`/lickbank/api/sources/${sourceId}/analyze`)
      .then((r) => r.json())
      .then((job) => {
        if (job?.status === "running") {
          setAnalyzeMode(job.mode === "model" ? "model" : "chapters");
          setAnalyzing(true);
        }
      })
      .catch(() => {});
  }, [sourceId]);

  // Section licks land one ffmpeg pass at a time, so refetch on every tick —
  // they show up on the timeline as they're cut instead of all at the end.
  useEffect(() => {
    if (autoLickJob?.status !== "running" || !sourceId) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/lickbank/api/sources/${sourceId}/auto-licks`);
        if (!res.ok) return;
        const job: AutoLickJob & { status: string } = await res.json();

        if (job.status === "running") {
          setAutoLickJob(job);
          await fetchSource();
          return;
        }

        setAutoLickJob(null);
        await fetchSource();
        if (job.status === "error") {
          setSaveMessage({ type: "error", text: job.message || "Failed to cut section licks" });
          setTimeout(() => setSaveMessage(null), 5000);
        } else if (job.status === "done" && job.created > 0) {
          setSaveMessage({
            type: "success",
            text: `Created ${job.created} lick${job.created === 1 ? "" : "s"} from the structure`,
          });
          setTimeout(() => setSaveMessage(null), 4000);
        }
      } catch {
        // Transient — keep polling.
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [autoLickJob?.status, sourceId, fetchSource]);

  // An import kicks off section licks before the page is ever opened, so pick
  // up a run that's already going.
  useEffect(() => {
    if (!sourceId) return;
    fetch(`/lickbank/api/sources/${sourceId}/auto-licks`)
      .then((r) => r.json())
      .then((job) => {
        if (job?.status === "running") setAutoLickJob(job);
      })
      .catch(() => {});
  }, [sourceId]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source?.waveformData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let peaks: number[];
    try {
      peaks = JSON.parse(source.waveformData);
    } catch {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barWidth = w / peaks.length;
    const startPctLocal = duration > 0 ? clipStart / duration : 0;
    const endPctLocal = duration > 0 ? clipEnd / duration : 1;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const pct = i / peaks.length;
      const inRegion = pct >= startPctLocal && pct <= endPctLocal;

      ctx.fillStyle = inRegion
        ? "rgba(245, 165, 36, 0.75)"  // --loop
        : "rgba(156, 163, 175, 0.35)"; // gray-400/35

      const barH = Math.max(1, peaks[i] * h * 0.9);
      ctx.fillRect(x, (h - barH) / 2, Math.max(1, barWidth - 0.5), barH);
    }
  }, [source?.waveformData, clipStart, clipEnd, duration]);

  // Counts in while the video runs muted and frozen — pausing instead would hit
  // Safari's "play() needs a gesture" rule when the count reaches zero.
  const startCountdownAt = useCallback((seekTo?: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = seekTo ?? video.currentTime;
    video.currentTime = target;

    wasMutedBeforeCountdown.current = video.muted;
    video.muted = true;
    if (pitchAudioRef.current) pitchAudioRef.current.muted = true;

    if (video.paused) video.play().catch(() => {});

    countdownSeekTarget.current = target;
    isCountingDownRef.current = true;
    setCountdown(countdownDuration);

    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          isCountingDownRef.current = false;
          countdownSeekTarget.current = null;
          const v = videoRef.current;
          if (v) v.muted = wasMutedBeforeCountdown.current;
          if (pitchAudioRef.current) pitchAudioRef.current.muted = false;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [countdownDuration]);

  // Sync playhead + looping. Mirrors the lick player: A-B wins when both points
  // are set, otherwise loop spans the clip range — which is what tapping a
  // chapter on the structure strip sets.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      const ct = video.currentTime;
      setCurrentTime(ct);
      setIsPlaying(!video.paused);

      // During countdown, freeze the video at the seek target
      if (isCountingDownRef.current) {
        if (countdownSeekTarget.current !== null) {
          video.currentTime = countdownSeekTarget.current;
        }
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      if (abA !== null && abB !== null) {
        if (ct >= abB - 0.05 || ct < abA - 0.1) {
          if (countdownOnLoopRef.current) startCountdownAt(abA);
          else video.currentTime = abA;
        }
      } else if (loopEnabled && clipEnd > clipStart) {
        if (ct >= clipEnd - 0.05 || ct < clipStart - 0.1) {
          if (countdownOnLoopRef.current) startCountdownAt(clipStart);
          else video.currentTime = clipStart;
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafRef.current);
  }, [source, loopEnabled, clipStart, clipEnd, abA, abB, startCountdownAt]);

  // Speed applies to the video and, when pitch-shifted, to the audio standing
  // in for it.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (pitchAudioRef.current) pitchAudioRef.current.playbackRate = speed;
  }, [speed]);

  // Pitch shifting: the whole song is rendered once per semitone server-side,
  // then the muted video is played against that audio.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sourceId) return;

    if (pitch !== prevPitchRef.current) {
      video.pause();
      prevPitchRef.current = pitch;
    }

    if (pitch === 0) {
      video.muted = false;
      if (pitchAudioRef.current) {
        pitchAudioRef.current.pause();
        pitchAudioRef.current = null;
      }
      setPitchProcessing(false);
      return;
    }

    const controller = new AbortController();
    setPitchProcessing(true);

    fetch(`/lickbank/api/sources/${sourceId}/pitch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semitones: pitch }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Pitch processing failed");
        return res.json();
      })
      .then(({ filename }) => {
        setPitchProcessing(false);
        const v = videoRef.current;
        if (!v) return;
        v.muted = true;
        let audio = pitchAudioRef.current;
        if (!audio) {
          audio = new Audio();
          pitchAudioRef.current = audio;
        }
        audio.src = `/lickbank/api/media/${filename}`;
        audio.currentTime = v.currentTime;
        audio.playbackRate = speed;
        audio.preservesPitch = true;
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setPitchProcessing(false);
          setSaveMessage({ type: "error", text: "Pitch processing failed" });
          setTimeout(() => setSaveMessage(null), 4000);
        }
      });

    return () => { controller.abort(); };
  }, [pitch, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the pitched audio glued to the video it replaced
  useEffect(() => {
    const video = videoRef.current;
    const audio = pitchAudioRef.current;
    if (!video || !audio || pitch === 0) return;

    audio.playbackRate = speed;

    const onPlay = () => {
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    };
    const onPause = () => audio.pause();
    const onSeeked = () => { audio.currentTime = video.currentTime; };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [pitch, speed]);

  useEffect(() => {
    return () => {
      if (pitchAudioRef.current) {
        pitchAudioRef.current.pause();
        pitchAudioRef.current = null;
      }
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration;
    setDuration(dur);
    if (clipEnd === 0 || clipEnd > dur) {
      setClipEnd(dur);
    }
  };

  const getTimeFromPosition = (clientX: number): number => {
    const timeline = timelineRef.current;
    if (!timeline || duration === 0) return 0;
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const time = getTimeFromPosition(e.clientX);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleHandlePointerDown = (
    which: "start" | "end",
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(which);

    const handleMove = (moveEvent: PointerEvent) => {
      const time = getTimeFromPosition(moveEvent.clientX);
      if (which === "start") {
        setClipStart(Math.min(time, clipEnd - 0.5));
      } else {
        setClipEnd(Math.max(time, clipStart + 0.5));
      }
    };

    const handleUp = () => {
      setDragging(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleLickBoundaryPointerDown = (
    lickId: string,
    edge: "start" | "end",
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setAdjustingLick({ id: lickId, edge });

    const handleMove = (moveEvent: PointerEvent) => {
      const time = getTimeFromPosition(moveEvent.clientX);
      setSource((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          licks: prev.licks.map((l) => {
            if (l.id !== lickId) return l;
            if (edge === "start") {
              const newStart = Math.max(0, Math.min(time, l.endSec - 0.5));
              return { ...l, startSec: newStart, durationSec: l.endSec - newStart };
            } else {
              const newEnd = Math.min(duration, Math.max(time, l.startSec + 0.5));
              return { ...l, endSec: newEnd, durationSec: newEnd - l.startSec };
            }
          }),
        };
      });
    };

    const handleUp = async () => {
      setAdjustingLick(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);

      // Save the new boundaries to the server
      const lick = source?.licks.find((l) => l.id === lickId);
      if (!lick) return;

      setAdjustingBoundary(true);
      try {
        await fetch(`/lickbank/api/licks/${lickId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startSec: lick.startSec,
            endSec: lick.endSec,
          }),
        });
        // Refresh source to get updated data
        fetchSource();
      } catch {
        // Silently fail — will refresh on next load
      } finally {
        setAdjustingBoundary(false);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    // Pause during a count-in calls the take off rather than leaving the
    // video frozen and muted.
    if (isCountingDownRef.current) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = null;
      isCountingDownRef.current = false;
      countdownSeekTarget.current = null;
      setCountdown(null);
      video.pause();
      video.muted = wasMutedBeforeCountdown.current;
      if (pitchAudioRef.current) pitchAudioRef.current.muted = false;
      return;
    }
    if (video.paused) {
      // With a count-in set, Play counts in from where the playhead sits.
      if (countdownDuration > 0) {
        startCountdownAt();
        return;
      }
      video.play().catch(() => {
        // iPad Safari may reject play() if video codec is unsupported
        setError("Video playback failed — the video format may not be supported on this device. Try re-importing the video.");
      });
    } else {
      video.pause();
    }
  };

  // Practice transport. Rewind lands on A when an A-B loop is set, otherwise on
  // the clip range's start — the same "back to the top of what I'm practising"
  // the lick player gives.
  const handleRewind = () => {
    seekTo(abA ?? clipStart);
  };

  const clearABLoop = () => {
    setAbA(null);
    setAbB(null);
  };

  const handleSetStart = () => {
    setClipStart(Math.min(currentTime, clipEnd - 0.5));
  };

  const handleSetEnd = () => {
    setClipEnd(Math.max(currentTime, clipStart + 0.5));
  };

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.max(0, Math.min(duration, time));
  };

  const handlePlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    const handleMove = (moveEvent: PointerEvent) => {
      const time = getTimeFromPosition(moveEvent.clientX);
      video.currentTime = time;
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (wasPlaying) video.play().catch(() => {});
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const handleSelectLick = (lick: SourceLick) => {
    setSelectedLickId(lick.id);
    setEditingName(lick.name);
    setConfirmDeleteId(null);
    seekTo(lick.startSec);
  };

  const handleDeselectLick = () => {
    setSelectedLickId(null);
    setEditingName("");
    setConfirmDeleteId(null);
  };

  const handleDeleteLick = async (id: string) => {
    setDeletingLick(true);
    try {
      const res = await fetch(`/lickbank/api/licks/${id}`, { method: "DELETE" });
      if (res.ok) {
        handleDeselectLick();
        await fetchSource();
        setSaveMessage({ type: "success", text: "Lick deleted" });
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        setSaveMessage({ type: "error", text: "Failed to delete lick" });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error — lick not deleted" });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setDeletingLick(false);
    }
  };

  const runAnalyze = async () => {
    if (!sourceId || analyzing) return;
    setAnalyzeOpen(false);
    setAnalyzing(true);
    try {
      const res = await fetch(`/lickbank/api/sources/${sourceId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: analyzeMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // The model runs in the background; the polling effect takes it from here.
      if (data.pending) return;

      setAnalyzing(false);
      if (data.count > 0) {
        await fetchSource();
        setSaveMessage({ type: "success", text: `Found ${data.count} sections` });
        setTimeout(() => setSaveMessage(null), 3000);
        // The server starts cutting a lick per section as soon as they're
        // written — watch that run rather than leaving the strip looking done.
        setAutoLickJob({ status: "running", created: 0, total: 0 });
      } else {
        setSaveMessage({
          type: "error",
          text: "This video has no chapters — try the local model",
        });
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (err) {
      setAnalyzing(false);
      setSaveMessage({
        type: "error",
        text: err instanceof Error && err.message ? err.message : "Failed to start analysis",
      });
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const handleSaveLickName = async () => {
    const id = selectedLickId;
    const trimmed = editingName.trim();
    if (!id || !trimmed) return;
    setSavingName(true);
    try {
      const res = await fetch(`/lickbank/api/licks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        await fetchSource();
        setSaveMessage({ type: "success", text: "Name updated" });
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        setSaveMessage({ type: "error", text: "Failed to rename lick" });
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error — name not saved" });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSavingName(false);
    }
  };

  const commitLickBoundaries = (startSec: number, endSec: number) => {
    if (!selectedLickId) return;
    pendingLickRef.current = { id: selectedLickId, startSec, endSec };
    if (lickSaveTimerRef.current) clearTimeout(lickSaveTimerRef.current);
    lickSaveTimerRef.current = setTimeout(async () => {
      const pending = pendingLickRef.current;
      if (!pending) return;
      pendingLickRef.current = null;
      setAdjustingBoundary(true);
      try {
        await fetch(`/lickbank/api/licks/${pending.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startSec: pending.startSec, endSec: pending.endSec }),
        });
        await fetchSource();
      } finally {
        setAdjustingBoundary(false);
      }
    }, 600);
  };

  const adjustSelectedLick = (edge: "start" | "end", value: number) => {
    if (!selectedLickId) return;
    const lick = (pendingLickRef.current?.id === selectedLickId
      ? pendingLickRef.current
      : source?.licks.find((l) => l.id === selectedLickId)) as
      | { startSec: number; endSec: number }
      | undefined;
    if (!lick) return;

    let newStart = lick.startSec;
    let newEnd = lick.endSec;
    if (edge === "start") {
      newStart = Math.max(0, Math.min(value, lick.endSec - 0.5));
    } else {
      newEnd = Math.min(duration, Math.max(value, lick.startSec + 0.5));
    }

    setSource((prev) =>
      prev
        ? {
            ...prev,
            licks: prev.licks.map((l) =>
              l.id === selectedLickId
                ? { ...l, startSec: newStart, endSec: newEnd, durationSec: newEnd - newStart }
                : l
            ),
          }
        : prev
    );
    commitLickBoundaries(newStart, newEnd);
  };

  const nudgeSelectedLick = (edge: "start" | "end", delta: number) => {
    if (!selectedLickId) return;
    const lick = pendingLickRef.current?.id === selectedLickId
      ? pendingLickRef.current
      : source?.licks.find((l) => l.id === selectedLickId);
    if (!lick) return;
    adjustSelectedLick(edge, edge === "start" ? lick.startSec + delta : lick.endSec + delta);
  };

  const setSelectedLickEdgeToPlayhead = (edge: "start" | "end") => {
    adjustSelectedLick(edge, currentTime);
  };

  const nudge = (which: "start" | "end", delta: number) => {
    if (which === "start") {
      setClipStart((prev) => Math.max(0, Math.min(prev + delta, clipEnd - 0.5)));
    } else {
      setClipEnd((prev) => Math.max(clipStart + 0.5, Math.min(prev + delta, duration)));
    }
  };

  const handleSave = async () => {
    if (!lickName.trim() || !sourceId) return;
    setSaving(true);
    try {
      const res = await fetch("/lickbank/api/licks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          name: lickName.trim(),
          startSec: clipStart,
          endSec: clipEnd,
          folderIds: selectedFolderId ? [selectedFolderId] : [],
        }),
      });
      if (res.ok) {
        setLickName("");
        setClipStart(0);
        setClipEnd(duration);
        setSaveMessage({ type: "success", text: "Lick saved!" });
        setTimeout(() => setSaveMessage(null), 3000);
        fetchSource();
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveMessage({ type: "error", text: data.error || "Failed to save lick" });
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error — lick not saved" });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/lickbank/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (res.ok) {
        const folder: Folder = await res.json();
        setFolders((prev) => [...prev, folder]);
        setSelectedFolderId(folder.id);
        setNewFolderName("");
        setCreatingFolder(false);
      }
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading source...</p>
      </div>
    );
  }

  if (error || !source) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-destructive">{error || "Source not found"}</p>
        <BackToHome label="Back to Library" />
      </div>
    );
  }

  const startPct = duration > 0 ? (clipStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (clipEnd / duration) * 100 : 100;
  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const songDuration = duration || source.durationSec || 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 lg:px-6 py-3">
        <BackToHome label="Library" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{source.title}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {[
              source.artist,
              songDuration ? formatTime(songDuration) : null,
              `${source.licks.length} ${source.licks.length === 1 ? "lick" : "licks"}`,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ViewSwitch crop={crop} onCrop={setCrop} />
        <button
          type="button"
          onClick={() => setAnalyzeOpen(true)}
          disabled={analyzing || autoLickJob?.status === "running"}
          className="h-11 px-4 rounded-full border border-border bg-card flex items-center gap-2 text-sm font-semibold hover:bg-muted active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100 shrink-0"
          title={source.sections.length > 0 ? "Re-analyze structure" : "Analyze structure"}
        >
          {analyzing ? <CircleNotchIcon className="size-5 animate-spin" /> : <ArrowClockwiseIcon className="size-5" />}
          <span className="hidden md:inline">
            {analyzing ? "Analyzing…" : source.sections.length > 0 ? "Re-analyze" : "Analyze"}
          </span>
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Video + Waveform + transport (fixed height on landscape) */}
        <div className="lg:flex-1 lg:min-w-0 px-3 md:px-4 pb-3 md:pb-4 space-y-3 shrink-0 lg:overflow-hidden flex flex-col">
          {/* Video fills whatever the strip, timeline and controls leave — a
              fixed vh cap letterboxed it and wasted the width. */}
          {source.videoPath && (
            <div className="relative flex-1 min-h-0 max-h-[40vh] lg:max-h-none rounded-3xl overflow-hidden bg-black cursor-pointer" onClick={handlePlayPause}>
              <video
                ref={videoRef}
                src={`/lickbank/api/media/${source.videoPath}`}
                className={`w-full h-full ${crop === "full" ? "object-contain" : ""}`}
                style={crop !== "full" ? CROP_PRESETS.find((p) => p.value === crop)?.style : undefined}
                onLoadedMetadata={handleVideoLoaded}
                playsInline
                controls={false}
              />
              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                  <span className="text-8xl font-bold text-white tabular-nums drop-shadow-lg">
                    {countdown}
                  </span>
                </div>
              )}
              {!isPlaying && countdown === null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="size-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                      <polygon points="8,4 20,12 8,20" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Structure strip — sits between the video and the timeline so the
              solo can be found before clipping. Tapping a block sets the clip
              range and names the new lick after it. */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-1.5 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Structure
              </span>
              <span className="text-xs text-muted-foreground/80 flex-1 truncate">
                {analyzing
                  ? analyzeMode === "model"
                    ? "running the local model — this takes minutes"
                    : "fetching chapters…"
                  : autoLickJob?.status === "running"
                    ? autoLickJob.total > 0
                      ? `cutting licks from sections — ${autoLickJob.created}/${autoLickJob.total}`
                      : "cutting licks from sections…"
                  : source.sections.length === 0
                    ? "not analyzed yet — use Analyze above"
                    : source.sections[0].detectedBy === "chapters"
                      ? "from YouTube chapters"
                      : "detected locally — labels approximate"}
              </span>
            </div>
            {source.sections.length > 0 && (
              <div className="relative w-full h-8 bg-muted rounded-xl overflow-hidden select-none">
                {source.sections.map((section, i) => {
                  const left = duration > 0 ? (section.startSec / duration) * 100 : 0;
                  const width =
                    duration > 0 ? ((section.endSec - section.startSec) / duration) * 100 : 0;
                  // Derived from the clip range rather than tracked separately, so
                  // dragging the handles clears the selection on its own.
                  const isActive =
                    Math.abs(clipStart - section.startSec) < 0.5 &&
                    Math.abs(clipEnd - section.endSec) < 0.5;
                  return (
                    <button
                      key={section.id}
                      className={`absolute top-0 bottom-0 border-r-2 border-muted transition-all hover:brightness-125 ${
                        SECTION_COLORS[i % SECTION_COLORS.length]
                      } ${isActive ? "opacity-100 ring-2 ring-inset ring-foreground" : section.detectedBy === "songformer" ? "opacity-40" : "opacity-60"}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${section.name} — ${formatTime(section.startSec)} to ${formatTime(section.endSec)}`}
                      onClick={() => {
                        setClipStart(section.startSec);
                        setClipEnd(Math.min(section.endSec, duration));
                        setLickName(section.name);
                      }}
                    >
                      {width > 5 && (
                        <span className="absolute left-1.5 right-1 top-1/2 -translate-y-1/2 text-xs font-semibold text-white text-left truncate pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
                          {section.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="shrink-0">
            <div
              ref={timelineRef}
              className="relative w-full h-24 md:h-28 bg-muted rounded-2xl cursor-pointer select-none touch-none overflow-hidden"
              onClick={handleTimelineClick}
            >
              {/* Waveform canvas */}
              {source.waveformData && (
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              )}

              {/* Existing licks sit faintly behind; only the one picked in the
                  list gets handles, so a drag can't grab the wrong lick. */}
              {source.licks.map((lick) => {
                const lickStartPct = duration > 0 ? (lick.startSec / duration) * 100 : 0;
                const lickEndPct = duration > 0 ? (lick.endSec / duration) * 100 : 0;
                const lickWidthPct = lickEndPct - lickStartPct;
                const isSelected = selectedLickId === lick.id;
                return (
                  <div key={lick.id}>
                    <div
                      className={`absolute pointer-events-none ${
                        isSelected
                          ? "inset-y-1 rounded-xl border-2 border-emerald-500 bg-emerald-500/20"
                          : "inset-y-0 bg-foreground/[0.04] border-x border-foreground/10"
                      }`}
                      style={{ left: `${lickStartPct}%`, width: `${lickWidthPct}%` }}
                    />
                    {isSelected && (
                      <>
                        <div
                          className="absolute top-2 text-xs font-semibold pointer-events-none truncate px-2 text-emerald-400"
                          style={{ left: `${lickStartPct}%`, maxWidth: `${lickWidthPct}%` }}
                        >
                          {lick.name}
                        </div>
                        {(["start", "end"] as const).map((edge) => (
                          <div
                            key={edge}
                            className="absolute top-0 bottom-0 w-11 -ml-[22px] cursor-ew-resize z-30 flex items-center justify-center group touch-none"
                            style={{ left: `${edge === "start" ? lickStartPct : lickEndPct}%` }}
                            onPointerDown={(e) => handleLickBoundaryPointerDown(lick.id, edge, e)}
                          >
                            <div className="w-5 h-11 rounded-lg bg-emerald-500 shadow-md flex items-center justify-center gap-0.5 group-active:scale-110 transition-transform">
                              <span className="w-0.5 h-4 rounded-full bg-black/30" />
                              <span className="w-0.5 h-4 rounded-full bg-black/30" />
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}

              {/* The new lick's range */}
              <div
                className="absolute inset-y-1 rounded-xl border-2 border-loop bg-loop/10 pointer-events-none z-20"
                style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              />

              {/* Playhead — draggable scrubber with wide touch hitbox */}
              <div
                className="absolute top-0 bottom-0 w-10 -ml-5 z-40 flex items-center justify-center cursor-ew-resize touch-none"
                style={{ left: `${playheadPct}%` }}
                onPointerDown={handlePlayheadPointerDown}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 size-4 rounded-full bg-foreground shadow" />
                <div className="w-0.5 h-full bg-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
              </div>

              {/* Clip handles */}
              {(["start", "end"] as const).map((edge) => (
                <div
                  key={edge}
                  className="absolute top-0 bottom-0 w-11 -ml-[22px] cursor-ew-resize z-30 flex items-center justify-center group touch-none"
                  style={{ left: `${edge === "start" ? startPct : endPct}%` }}
                  onPointerDown={(e) => handleHandlePointerDown(edge, e)}
                >
                  <div className="w-5 h-11 rounded-lg bg-loop shadow-md flex items-center justify-center gap-0.5 group-active:scale-110 transition-transform">
                    <span className="w-0.5 h-4 rounded-full bg-loop-foreground/40" />
                    <span className="w-0.5 h-4 rounded-full bg-loop-foreground/40" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between px-1 pt-1.5 text-sm font-mono text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Save feedback */}
          {saveMessage && (
            <div className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium ${
              saveMessage.type === "success"
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-destructive/15 text-destructive"
            }`}>
              {saveMessage.text}
            </div>
          )}

          {/* Re-extraction status */}
          {adjustingBoundary && (
            <div className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium bg-loop/15 text-loop animate-pulse">
              Re-extracting clip with new boundaries…
            </div>
          )}

          <div className="shrink-0 flex justify-center">
            <PracticeControls
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              loopEnabled={loopEnabled}
              onToggleLoop={() => setLoopEnabled(!loopEnabled)}
              abA={abA}
              abB={abB}
              onSetA={() => { if (abA === null) setAbA(currentTime); }}
              onSetB={() => { if (abB === null && abA !== null && currentTime > abA) setAbB(currentTime); }}
              onClearAB={clearABLoop}
              onRewind={handleRewind}
              speed={speed}
              onSpeed={setSpeed}
              pitch={pitch}
              onPitch={setPitch}
              pitchProcessing={pitchProcessing}
              countdownDuration={countdownDuration}
              onCountdownDuration={(d) => {
                setCountdownDuration(d);
                // "Every loop" means nothing without a count-in to repeat.
                if (d === 0) { setCountdownOnLoop(false); countdownOnLoopRef.current = false; }
              }}
              countdownOnLoop={countdownOnLoop}
              onToggleCountdownOnLoop={() => { const next = !countdownOnLoop; setCountdownOnLoop(next); countdownOnLoopRef.current = next; }}
            />
          </div>
        </div>

        {/* Right: New lick + clipped licks */}
        <aside className="lg:w-96 overflow-y-auto lg:overflow-hidden lg:flex lg:flex-col px-3 md:px-4 pb-4 space-y-3 shrink-0 flex-1 lg:flex-none">
          {/* New lick */}
          <div className="rounded-3xl bg-card border border-border p-4 space-y-3 shrink-0">
            <div className="flex items-center">
              <h2 className="text-base font-semibold flex-1">New lick</h2>
              <span className="text-sm font-mono font-semibold text-loop">{formatTime(clipEnd - clipStart)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeBox edge="start" value={clipStart} accent="loop" onNudge={(d) => nudge("start", d)} onMark={handleSetStart} />
              <TimeBox edge="end" value={clipEnd} accent="loop" onNudge={(d) => nudge("end", d)} onMark={handleSetEnd} />
            </div>
            <Input
              placeholder="Name this lick"
              value={lickName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLickName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") handleSave();
              }}
              className="h-12 rounded-xl text-base"
            />
            <select
              value={creatingFolder ? "__new" : selectedFolderId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new") {
                  setCreatingFolder(true);
                } else {
                  setCreatingFolder(false);
                  setSelectedFolderId(v || null);
                }
              }}
              className="w-full h-11 rounded-xl bg-muted px-3 text-sm font-medium text-foreground border-0 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Folder"
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
              <option value="__new">New folder…</option>
            </select>
            {creatingFolder && (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") setCreatingFolder(false);
                  }}
                  className="flex-1 h-11 rounded-xl"
                />
                <Button className="h-11 px-4 rounded-xl" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                  Add
                </Button>
              </div>
            )}
            <button
              className="w-full h-12 rounded-full bg-loop text-loop-foreground text-base font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
              onClick={handleSave}
              disabled={saving || !lickName.trim()}
            >
              <ScissorsIcon className="size-5" weight="bold" />
              {saving ? "Saving…" : "Save lick"}
            </button>
          </div>

          {/* Clipped Licks — scrolls on its own so the New lick controls
              above stay put no matter how many licks are saved. */}
          <div className="rounded-3xl bg-card border border-border p-2 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <div className="flex items-center px-3 pt-2 pb-1 shrink-0">
              <h3 className="text-base font-semibold flex-1">Clipped licks</h3>
              <span className="text-sm text-muted-foreground">{source.licks.length}</span>
            </div>

            {source.licks.length > 0 ? (
              <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                {source.licks.map((lick, i) => {
                  const isSelected = selectedLickId === lick.id;
                  if (isSelected) {
                    return (
                      <div
                        key={lick.id}
                        ref={revealEditor}
                        className="my-1 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 p-3 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-emerald-500 flex-1">
                            {formatTime(lick.durationSec)}
                          </span>
                          <button
                            type="button"
                            onClick={handleDeselectLick}
                            className="h-10 px-4 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            Done
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                              if (e.key === "Enter") handleSaveLickName();
                              if (e.key === "Escape") handleDeselectLick();
                            }}
                            placeholder="Lick name"
                            className="flex-1 h-11 rounded-xl text-base"
                          />
                          <Button
                            className="h-11 px-4 rounded-xl text-base"
                            onClick={handleSaveLickName}
                            disabled={savingName || !editingName.trim() || editingName.trim() === lick.name}
                          >
                            {savingName ? "Saving…" : "Save"}
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <TimeBox edge="start" value={lick.startSec} accent="emerald" onNudge={(d) => nudgeSelectedLick("start", d)} onMark={() => setSelectedLickEdgeToPlayhead("start")} />
                          <TimeBox edge="end" value={lick.endSec} accent="emerald" onNudge={(d) => nudgeSelectedLick("end", d)} onMark={() => setSelectedLickEdgeToPlayhead("end")} />
                        </div>

                        <div className="flex items-center justify-between">
                          {/* Two-tap confirm — deleting also removes the clip
                              files, and this list gets tapped on an iPad. */}
                          <button
                            type="button"
                            onClick={() =>
                              confirmDeleteId === lick.id
                                ? handleDeleteLick(lick.id)
                                : setConfirmDeleteId(lick.id)
                            }
                            disabled={deletingLick}
                            className={`h-11 px-4 rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
                              confirmDeleteId === lick.id
                                ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            }`}
                          >
                            {deletingLick
                              ? "Deleting…"
                              : confirmDeleteId === lick.id
                                ? "Tap again to delete"
                                : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/licks/${lick.id}`)}
                            className="h-11 px-4 rounded-full text-sm font-semibold text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                          >
                            Open practice →
                          </button>
                        </div>
                      </div>
                    );
                  }
                  const left = songDuration > 0 ? (lick.startSec / songDuration) * 100 : 0;
                  const width = songDuration > 0 ? Math.max(1.5, (lick.durationSec / songDuration) * 100) : 0;
                  return (
                    <button
                      key={lick.id}
                      className="w-full text-left px-3 py-3 rounded-2xl hover:bg-muted active:scale-[0.99] transition-all"
                      onClick={() => handleSelectLick(lick)}
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="flex-1 min-w-0 truncate text-base font-semibold">{lick.name}</span>
                        <span className="text-sm font-mono text-muted-foreground shrink-0">
                          {formatTime(lick.startSec)} – {formatTime(lick.endSec)}
                        </span>
                      </div>
                      {/* Where this lick sits in the song */}
                      <div className="relative mt-2 h-1.5 rounded-full bg-muted">
                        <div
                          className={`absolute inset-y-0 rounded-full ${SECTION_COLORS[i % SECTION_COLORS.length]}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <ScissorsIcon className="size-8 text-muted-foreground mb-3" />
                <p className="text-base font-semibold">No licks yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-[16rem]">
                  Tap a section on the structure strip, or drag the orange handles, then name it and save.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Analyze Structure Dialog */}
      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analyze structure</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {[
              {
                mode: "chapters" as const,
                title: "YouTube chapters",
                detail:
                  "Re-downloads the creator's chapter markers. Exact labels, a few seconds. Each chapter becomes a lick. Does nothing if the video has none.",
              },
              {
                mode: "model" as const,
                title: "Local model",
                detail:
                  "Runs SongFormer on the audio — minutes of CPU. Each block it finds becomes a lick. Boundaries are reliable, but labels are approximate and it tends to over-call solos on instrumentals, so expect to rename a few.",
              },
            ].map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setAnalyzeMode(opt.mode)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  analyzeMode === opt.mode
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      analyzeMode === opt.mode
                        ? "border-violet-500 bg-violet-500 ring-2 ring-inset ring-background"
                        : "border-muted-foreground/40"
                    }`}
                  />
                  <span className="text-sm font-semibold">{opt.title}</span>
                  {opt.mode === "chapters" && (
                    <span className="text-[10px] text-muted-foreground">Default</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 ml-6">{opt.detail}</p>
              </button>
            ))}
            {source.sections.length > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Replaces the {source.sections.length} sections currently on the strip.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnalyzeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runAnalyze}>Analyze</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
