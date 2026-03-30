"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Source {
  id: string;
  title: string;
  artist: string | null;
  videoPath: string | null;
  audioPath: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  waveformData: string | null;
  processingStatus: string;
  licks: SourceLick[];
}

interface SourceLick {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  folderId: string | null;
}

interface Folder {
  id: string;
  name: string;
  _count: { licks: number };
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

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setSourceId(id));
  }, [params]);

  const fetchSource = useCallback(async () => {
    if (!sourceId) return;
    try {
      const res = await fetch(`/api/sources/${sourceId}`);
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
    fetch("/api/folders")
      .then((r) => r.json())
      .then(setFolders)
      .catch(() => {});
  }, []);

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
        await fetch(`/api/licks/${lickId}`, {
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
      video.play();
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
      const res = await fetch("/api/licks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          name: lickName.trim(),
          startSec: clipStart,
          endSec: clipEnd,
          folderId: selectedFolderId,
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
      const res = await fetch("/api/folders", {
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
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to Library
        </Button>
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
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Library
        </Button>
        <h1 className="text-sm font-medium truncate flex-1">{source.title}</h1>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Video + Waveform + Play (sticky on desktop) */}
        <div className="md:flex-1 md:min-w-0 p-3 md:p-4 space-y-3 shrink-0 md:overflow-hidden flex flex-col">
          {/* Video Player */}
          {source.videoPath && (
            <div className="rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={`/api/media/${source.videoPath}`}
                className="w-full max-h-[40vh] md:max-h-[50vh] object-contain"
                onLoadedMetadata={handleVideoLoaded}
                playsInline
                controls={false}
                onClick={handlePlayPause}
              />
            </div>
          )}

          {/* Timeline */}
          <div
            ref={timelineRef}
            className="relative w-full h-14 md:h-16 bg-muted rounded-xl cursor-pointer select-none touch-none overflow-hidden"
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
              return (
                <div key={lick.id}>
                  <div
                    className="absolute top-0 bottom-0 bg-emerald-500/20 pointer-events-none"
                    style={{ left: `${lickStartPct}%`, width: `${lickWidthPct}%` }}
                  />
                  <div
                    className="absolute top-0.5 text-[9px] font-medium text-emerald-400 pointer-events-none truncate px-1"
                    style={{ left: `${lickStartPct}%`, maxWidth: `${lickWidthPct}%` }}
                  >
                    {lick.name}
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-5 cursor-ew-resize z-30 flex items-center justify-center group"
                    style={{ left: `calc(${lickStartPct}% - 10px)` }}
                    onPointerDown={(e) => handleLickBoundaryPointerDown(lick.id, "start", e)}
                  >
                    <div className="w-1 h-8 bg-emerald-500 rounded-full group-hover:bg-emerald-400 group-active:bg-emerald-300 shadow" />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-5 cursor-ew-resize z-30 flex items-center justify-center group"
                    style={{ left: `calc(${lickEndPct}% - 10px)` }}
                    onPointerDown={(e) => handleLickBoundaryPointerDown(lick.id, "end", e)}
                  >
                    <div className="w-1 h-8 bg-emerald-500 rounded-full group-hover:bg-emerald-400 group-active:bg-emerald-300 shadow" />
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

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-20"
              style={{ left: `${playheadPct}%` }}
            />

            {/* Clip start handle */}
            <div
              className="absolute top-0 bottom-0 w-6 cursor-ew-resize z-30 flex items-center justify-center group"
              style={{ left: `calc(${startPct}% - 12px)` }}
              onPointerDown={(e) => handleHandlePointerDown("start", e)}
            >
              <div className="w-1.5 h-10 bg-amber-500 rounded-full group-hover:bg-amber-400 group-active:bg-amber-300 shadow" />
            </div>
            <div
              className="absolute top-0 bottom-0 w-6 cursor-ew-resize z-30 flex items-center justify-center group"
              style={{ left: `calc(${endPct}% - 12px)` }}
              onPointerDown={(e) => handleHandlePointerDown("end", e)}
            >
              <div className="w-1.5 h-10 bg-amber-500 rounded-full group-hover:bg-amber-400 group-active:bg-amber-300 shadow" />
            </div>

            {/* Time display */}
            <div className="absolute bottom-1 left-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(currentTime)}
            </div>
            <div className="absolute bottom-1 right-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(duration)}
            </div>
          </div>

          {/* Play + Preview controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all shadow-lg"
              onClick={handlePlayPause}
            >
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="8,4 20,12 8,20" />
                </svg>
              )}
            </button>
            <Button
              variant={loopPreview ? "default" : "outline"}
              size="sm"
              onClick={() => setLoopPreview(!loopPreview)}
              title="Loop preview"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              Loop
            </Button>
            <Button variant="outline" size="sm" onClick={handlePreview}>
              Preview
            </Button>
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

        {/* Right: Controls + Sections */}
        <aside className="md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-border overflow-y-auto p-3 md:p-4 space-y-4 shrink-0">
          {/* Clip Boundaries */}
          <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Clip Range</span>
              <span className="text-xs text-muted-foreground">
                {formatTime(clipEnd - clipStart)}
              </span>
            </div>

            {/* Start controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-9">Start</span>
              <button
                className="px-1.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
                onClick={() => nudge("start", -0.1)}
              >
                -0.1
              </button>
              <span className="text-sm font-mono min-w-[3rem] text-center">
                {formatTime(clipStart)}
              </span>
              <button
                className="px-1.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
                onClick={() => nudge("start", 0.1)}
              >
                +0.1
              </button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleSetStart}>
                Set
              </Button>
            </div>

            {/* End controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-9">End</span>
              <button
                className="px-1.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
                onClick={() => nudge("end", -0.1)}
              >
                -0.1
              </button>
              <span className="text-sm font-mono min-w-[3rem] text-center">
                {formatTime(clipEnd)}
              </span>
              <button
                className="px-1.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 active:scale-95 transition-all"
                onClick={() => nudge("end", 0.1)}
              >
                +0.1
              </button>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleSetEnd}>
                Set
              </Button>
            </div>

            <Button className="w-full" onClick={() => setSaveOpen(true)}>
              Save Lick
            </Button>
          </div>

          {/* Existing licks from this source */}
          {source.licks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">
                Clipped Licks ({source.licks.length})
              </h3>
              <p className="text-[11px] text-muted-foreground mb-2">Drag handles on waveform to adjust</p>
              <div className="space-y-1.5">
                {source.licks.map((lick) => (
                  <button
                    key={lick.id}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-ring transition-colors text-left"
                    onClick={() => router.push(`/licks/${lick.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lick.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(lick.startSec)} - {formatTime(lick.endSec)} ({formatTime(lick.durationSec)})
                      </p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {source.licks.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No licks clipped yet. Select a region and save.
            </div>
          )}
        </aside>
      </div>

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
