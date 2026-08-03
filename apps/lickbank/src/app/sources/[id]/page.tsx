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
  const [loopPreview, setLoopPreview] = useState(false);
  const previewingRef = useRef(false);

  // Save dialog
  const [saveOpen, setSaveOpen] = useState(false);
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

  // Lick selection / inline edit
  const [selectedLickId, setSelectedLickId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingLick, setDeletingLick] = useState(false);
  const lickSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLickRef = useRef<{ id: string; startSec: number; endSec: number } | null>(null);

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
        ? "rgba(245, 158, 11, 0.4)"  // amber-500/40
        : "rgba(156, 163, 175, 0.25)"; // gray-400/25

      const barH = Math.max(1, peaks[i] * h * 0.9);
      ctx.fillRect(x, (h - barH) / 2, Math.max(1, barWidth - 0.5), barH);
    }
  }, [source?.waveformData, clipStart, clipEnd, duration]);

  // Sync playhead with video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      setCurrentTime(video.currentTime);
      setIsPlaying(!video.paused);

      // Loop preview: when previewing with loop, restart at clipStart
      if (previewingRef.current && loopPreview && video.currentTime >= clipEnd) {
        video.currentTime = clipStart;
      }
      // Non-loop preview: pause at clipEnd
      if (previewingRef.current && !loopPreview && video.currentTime >= clipEnd) {
        video.pause();
        previewingRef.current = false;
      }

      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafRef.current);
  }, [source, loopPreview, clipStart, clipEnd]);

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
    if (video.paused) {
      video.play().catch(() => {
        // iPad Safari may reject play() if video codec is unsupported
        setError("Video playback failed — the video format may not be supported on this device. Try re-importing the video.");
      });
    } else {
      video.pause();
      previewingRef.current = false;
    }
  };

  const handlePreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = clipStart;
    previewingRef.current = true;
    video.play();
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
    previewingRef.current = false;
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + delta);
  };

  const handlePlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();
    previewingRef.current = false;

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
        setSaveOpen(false);
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

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <BackToHome label="Library" />
        <h1 className="text-sm font-medium truncate flex-1">{source.title}</h1>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Video + Waveform + Play (sticky on desktop) */}
        <div className="md:flex-1 md:min-w-0 p-3 md:p-4 space-y-3 shrink-0 md:overflow-hidden flex flex-col">
          {/* Video Player */}
          {source.videoPath && (
            <div className="relative rounded-xl overflow-hidden bg-black cursor-pointer group/video" onClick={handlePlayPause}>
              <video
                ref={videoRef}
                src={`/lickbank/api/media/${source.videoPath}`}
                className="w-full max-h-[40vh] md:max-h-[50vh] object-contain"
                onLoadedMetadata={handleVideoLoaded}
                playsInline
                controls={false}
              />
              {/* Play/Pause overlay */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
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
              range; the amber handles stay the way to fine-tune it. */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Structure
              </span>
              <span className="text-[10px] text-muted-foreground/70 flex-1 truncate">
                {analyzing
                  ? analyzeMode === "model"
                    ? "running the local model — this takes minutes"
                    : "fetching chapters..."
                  : source.sections.length === 0
                    ? "not analyzed yet"
                    : source.sections[0].detectedBy === "chapters"
                      ? "from YouTube chapters"
                      : "detected locally — labels approximate"}
              </span>
              <button
                type="button"
                onClick={() => setAnalyzeOpen(true)}
                disabled={analyzing}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-card border border-border hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-95 transition-all disabled:opacity-60 disabled:active:scale-100 shrink-0"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-violet-500 ${analyzing ? "animate-spin" : ""}`}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                {analyzing
                  ? "Analyzing..."
                  : source.sections.length > 0
                    ? "Re-analyze"
                    : "Analyze structure"}
              </button>
            </div>
            {source.sections.length > 0 && (
              <div className="relative w-full h-6 md:h-7 bg-muted rounded-lg overflow-hidden select-none">
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
                      className={`absolute top-0 bottom-0 border-r border-background/50 transition-all hover:brightness-125 ${
                        SECTION_COLORS[i % SECTION_COLORS.length]
                      } ${section.detectedBy === "songformer" ? "opacity-60" : ""} ${
                        isActive ? "ring-2 ring-inset ring-foreground brightness-125" : ""
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${section.name} — ${formatTime(section.startSec)} to ${formatTime(section.endSec)}`}
                      onClick={() => {
                        setClipStart(section.startSec);
                        setClipEnd(Math.min(section.endSec, duration));
                      }}
                    >
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white whitespace-nowrap pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
                        {section.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div
            ref={timelineRef}
            className="relative w-full h-32 md:h-40 bg-muted rounded-xl cursor-pointer select-none touch-none overflow-hidden"
            onClick={handleTimelineClick}
          >
            {/* Waveform canvas */}
            {source.waveformData && (
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            )}

            {/* Existing lick markers with draggable handles */}
            {source.licks.map((lick) => {
              const lickStartPct = duration > 0 ? (lick.startSec / duration) * 100 : 0;
              const lickEndPct = duration > 0 ? (lick.endSec / duration) * 100 : 0;
              const lickWidthPct = lickEndPct - lickStartPct;
              const isSelected = selectedLickId === lick.id;
              const regionBg = isSelected ? "bg-emerald-500/40" : "bg-emerald-500/20";
              const handleColor = isSelected
                ? "bg-emerald-300 group-hover:bg-emerald-200 group-active:bg-emerald-100"
                : "bg-emerald-500 group-hover:bg-emerald-400 group-active:bg-emerald-300";
              const handleWidth = isSelected ? "w-2 h-24 md:h-28" : "w-1.5 h-20 md:h-24";
              const handleHitbox = isSelected ? "w-10" : "w-8";
              const handleHitboxOffset = isSelected ? -20 : -16;
              return (
                <div key={lick.id}>
                  <div
                    className={`absolute top-0 bottom-0 ${regionBg} pointer-events-none`}
                    style={{ left: `${lickStartPct}%`, width: `${lickWidthPct}%` }}
                  />
                  <div
                    className={`absolute top-0.5 text-[9px] font-medium pointer-events-none truncate px-1 ${
                      isSelected ? "text-emerald-200" : "text-emerald-400"
                    }`}
                    style={{ left: `${lickStartPct}%`, maxWidth: `${lickWidthPct}%` }}
                  >
                    {lick.name}
                  </div>
                  <div
                    className={`absolute top-0 bottom-0 ${handleHitbox} cursor-ew-resize z-30 flex items-center justify-center group touch-none`}
                    style={{ left: `calc(${lickStartPct}% + ${handleHitboxOffset}px)` }}
                    onPointerDown={(e) => handleLickBoundaryPointerDown(lick.id, "start", e)}
                  >
                    <div className={`${handleWidth} rounded-full shadow ${handleColor}`} />
                  </div>
                  <div
                    className={`absolute top-0 bottom-0 ${handleHitbox} cursor-ew-resize z-30 flex items-center justify-center group touch-none`}
                    style={{ left: `calc(${lickEndPct}% + ${handleHitboxOffset}px)` }}
                    onPointerDown={(e) => handleLickBoundaryPointerDown(lick.id, "end", e)}
                  >
                    <div className={`${handleWidth} rounded-full shadow ${handleColor}`} />
                  </div>
                </div>
              );
            })}

            {/* Selected region - only when no waveform */}
            {!source.waveformData && (
              <div
                className="absolute top-0 bottom-0 bg-amber-500/30 rounded-lg"
                style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
              />
            )}

            {/* Playhead — draggable scrubber with wide touch hitbox */}
            <div
              className="absolute top-0 bottom-0 w-10 z-40 flex items-center justify-center cursor-ew-resize touch-none"
              style={{ left: `calc(${playheadPct}% - 20px)` }}
              onPointerDown={handlePlayheadPointerDown}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white border-2 border-sky-500 shadow-lg" />
              <div className="w-1.5 h-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
            </div>

            {/* Clip start handle */}
            <div
              className="absolute top-0 bottom-0 w-10 cursor-ew-resize z-30 flex items-center justify-center group touch-none"
              style={{ left: `calc(${startPct}% - 20px)` }}
              onPointerDown={(e) => handleHandlePointerDown("start", e)}
            >
              <div className="w-2 h-24 md:h-28 bg-amber-500 rounded-full group-hover:bg-amber-400 group-active:bg-amber-300 shadow" />
            </div>
            <div
              className="absolute top-0 bottom-0 w-10 cursor-ew-resize z-30 flex items-center justify-center group touch-none"
              style={{ left: `calc(${endPct}% - 20px)` }}
              onPointerDown={(e) => handleHandlePointerDown("end", e)}
            >
              <div className="w-2 h-24 md:h-28 bg-amber-500 rounded-full group-hover:bg-amber-400 group-active:bg-amber-300 shadow" />
            </div>

            {/* Time display */}
            <div className="absolute bottom-1 left-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(currentTime)}
            </div>
            <div className="absolute bottom-1 right-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(duration)}
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => seekTo(0)}
              className="h-14 w-14 rounded-2xl bg-muted hover:bg-accent active:scale-95 transition-all flex items-center justify-center"
              title="Jump to start"
              aria-label="Jump to start"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 6,20 8,20 8,4" />
                <polygon points="20,4 8,12 20,20" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => seekBy(-5)}
              className="h-14 px-5 rounded-2xl bg-muted hover:bg-accent active:scale-95 transition-all flex items-center gap-1.5 text-base font-semibold"
              title="Back 5 seconds"
              aria-label="Back 5 seconds"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
              5s
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              className="h-16 w-16 rounded-full bg-foreground text-background hover:bg-foreground/90 active:scale-95 transition-all flex items-center justify-center shadow-lg"
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => seekBy(5)}
              className="h-14 px-5 rounded-2xl bg-muted hover:bg-accent active:scale-95 transition-all flex items-center gap-1.5 text-base font-semibold"
              title="Forward 5 seconds"
              aria-label="Forward 5 seconds"
            >
              5s
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
          </div>

          {/* Save feedback */}
          {saveMessage && (
            <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
              saveMessage.type === "success"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-destructive/20 text-destructive"
            }`}>
              {saveMessage.text}
            </div>
          )}

          {/* Re-extraction status */}
          {adjustingBoundary && (
            <div className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 animate-pulse">
              Re-extracting clip with new boundaries...
            </div>
          )}
        </div>

        {/* Right: Controls + Licks */}
        <aside className="md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-border overflow-y-auto md:overflow-hidden md:flex md:flex-col p-3 md:p-4 space-y-3 shrink-0">
          {/* Clip Range Card */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <span className="text-sm font-semibold flex-1">Clip Range</span>
              <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {formatTime(clipEnd - clipStart)}
              </span>
            </div>

            {/* Start row — single line: label, nudges, set-to-playhead */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Start</span>
              <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
                <button
                  className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                  onClick={() => nudge("start", -1)}
                  aria-label="Start back 1 second"
                >
                  −1s
                </button>
                <span className="text-sm font-mono min-w-[2.75rem] text-center font-semibold">
                  {formatTime(clipStart)}
                </span>
                <button
                  className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                  onClick={() => nudge("start", 1)}
                  aria-label="Start forward 1 second"
                >
                  +1s
                </button>
              </div>
              <button
                className="ml-auto text-xs font-medium text-amber-500 hover:text-amber-400 px-2 py-1.5 rounded-md hover:bg-amber-500/10 transition-colors whitespace-nowrap"
                onClick={handleSetStart}
              >
                Set to playhead
              </button>
            </div>

            {/* End row */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">End</span>
              <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
                <button
                  className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                  onClick={() => nudge("end", -1)}
                  aria-label="End back 1 second"
                >
                  −1s
                </button>
                <span className="text-sm font-mono min-w-[2.75rem] text-center font-semibold">
                  {formatTime(clipEnd)}
                </span>
                <button
                  className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                  onClick={() => nudge("end", 1)}
                  aria-label="End forward 1 second"
                >
                  +1s
                </button>
              </div>
              <button
                className="ml-auto text-xs font-medium text-amber-500 hover:text-amber-400 px-2 py-1.5 rounded-md hover:bg-amber-500/10 transition-colors whitespace-nowrap"
                onClick={handleSetEnd}
              >
                Set to playhead
              </button>
            </div>

            <Button className="w-full h-12 text-base bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setSaveOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Lick
            </Button>
          </div>

          {/* Clipped Licks — scrolls on its own so the Clip Range controls
              above stay put no matter how many licks are saved. */}
          <div className="md:flex-1 md:min-h-0 md:flex md:flex-col">
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <h3 className="text-sm font-semibold flex-1">
                Clipped Licks
                {source.licks.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({source.licks.length})
                  </span>
                )}
              </h3>
              {source.licks.length > 0 && (
                <span className="text-[10px] text-muted-foreground">Drag handles to adjust</span>
              )}
            </div>

            {source.licks.length > 0 ? (
              <div className="space-y-1.5 md:flex-1 md:min-h-0 md:overflow-y-auto md:-mr-1 md:pr-1">
                {source.licks.map((lick) => {
                  const isSelected = selectedLickId === lick.id;
                  if (isSelected) {
                    return (
                      <div
                        key={lick.id}
                        className="rounded-xl bg-emerald-500/10 border border-emerald-500/50 p-4 space-y-4"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => seekTo(lick.startSec)}
                            className="w-12 h-12 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 transition-all flex items-center justify-center shrink-0"
                            title="Seek to lick start"
                            aria-label="Seek to lick start"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </button>
                          <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full font-semibold flex-1 text-center">
                            {formatTime(lick.durationSec)}
                          </span>
                          <button
                            type="button"
                            onClick={handleDeselectLick}
                            className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                          >
                            Done
                          </button>
                        </div>

                        {/* Name input */}
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                              if (e.key === "Enter") handleSaveLickName();
                              if (e.key === "Escape") handleDeselectLick();
                            }}
                            placeholder="Lick name"
                            className="flex-1 h-11 text-base"
                          />
                          <Button
                            className="h-11 px-4 text-base"
                            onClick={handleSaveLickName}
                            disabled={savingName || !editingName.trim() || editingName.trim() === lick.name}
                          >
                            {savingName ? "Saving..." : "Save"}
                          </Button>
                        </div>

                        {/* Lick start row */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Start</span>
                          <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
                            <button
                              type="button"
                              className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                              onClick={() => nudgeSelectedLick("start", -1)}
                              aria-label="Lick start back 1 second"
                            >
                              −1s
                            </button>
                            <span className="text-sm font-mono min-w-[2.75rem] text-center font-semibold">
                              {formatTime(lick.startSec)}
                            </span>
                            <button
                              type="button"
                              className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                              onClick={() => nudgeSelectedLick("start", 1)}
                              aria-label="Lick start forward 1 second"
                            >
                              +1s
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ml-auto text-xs font-medium text-emerald-500 hover:text-emerald-400 px-2 py-1.5 rounded-md hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                            onClick={() => setSelectedLickEdgeToPlayhead("start")}
                          >
                            Set to playhead
                          </button>
                        </div>

                        {/* Lick end row */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">End</span>
                          <div className="flex items-center gap-1 bg-muted rounded-lg px-1 py-0.5">
                            <button
                              type="button"
                              className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                              onClick={() => nudgeSelectedLick("end", -1)}
                              aria-label="Lick end back 1 second"
                            >
                              −1s
                            </button>
                            <span className="text-sm font-mono min-w-[2.75rem] text-center font-semibold">
                              {formatTime(lick.endSec)}
                            </span>
                            <button
                              type="button"
                              className="h-8 px-2 text-xs font-semibold rounded-md hover:bg-background active:scale-95 transition-all text-muted-foreground"
                              onClick={() => nudgeSelectedLick("end", 1)}
                              aria-label="Lick end forward 1 second"
                            >
                              +1s
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ml-auto text-xs font-medium text-emerald-500 hover:text-emerald-400 px-2 py-1.5 rounded-md hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                            onClick={() => setSelectedLickEdgeToPlayhead("end")}
                          >
                            Set to playhead
                          </button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Drag the green handles on the waveform too.
                        </p>

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
                            className={`text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                              confirmDeleteId === lick.id
                                ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            }`}
                          >
                            {deletingLick
                              ? "Deleting..."
                              : confirmDeleteId === lick.id
                                ? "Tap again to delete"
                                : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/licks/${lick.id}`)}
                            className="text-sm font-medium text-emerald-500 hover:text-emerald-400 px-3 py-2 rounded-lg hover:bg-emerald-500/10 transition-colors"
                          >
                            Open practice →
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={lick.id}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-card border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all text-left group"
                      onClick={() => handleSelectLick(lick)}
                    >
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold truncate">{lick.name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {formatTime(lick.startSec)} - {formatTime(lick.endSec)}
                          <span className="ml-1.5 text-muted-foreground/60">({formatTime(lick.durationSec)})</span>
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-muted-foreground">No licks yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
                  Drag the amber handles on the waveform to select a region, then save it as a lick.
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
                  "Re-downloads the creator's chapter markers. Exact labels, a few seconds. Does nothing if the video has none.",
              },
              {
                mode: "model" as const,
                title: "Local model",
                detail:
                  "Runs SongFormer on the audio — minutes of CPU. Boundaries are reliable, but labels are approximate and it tends to over-call solos on instrumentals.",
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

      {/* Save Lick Dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Lick</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                placeholder="e.g. Pentatonic run at 2:30"
                value={lickName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLickName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Clip Range
              </label>
              <p className="text-sm text-muted-foreground">
                {formatTime(clipStart)} - {formatTime(clipEnd)} ({formatTime(clipEnd - clipStart)})
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Folder</label>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                <button
                  className={`text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${
                    selectedFolderId === null ? "bg-muted font-medium" : ""
                  }`}
                  onClick={() => setSelectedFolderId(null)}
                >
                  No Folder
                </button>
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    className={`text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${
                      selectedFolderId === folder.id ? "bg-muted font-medium" : ""
                    }`}
                    onClick={() => setSelectedFolderId(folder.id)}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
              {creatingFolder ? (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") handleCreateFolder();
                      if (e.key === "Escape") setCreatingFolder(false);
                    }}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleCreateFolder}>
                    Add
                  </Button>
                </div>
              ) : (
                <button
                  className="text-sm text-muted-foreground hover:text-foreground mt-2"
                  onClick={() => setCreatingFolder(true)}
                >
                  + Create new folder
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !lickName.trim()}>
              {saving ? "Saving..." : "Save Lick"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
