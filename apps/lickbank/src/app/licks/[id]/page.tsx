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

const SECTION_COLORS = [
  { bg: "bg-violet-500/40", active: "bg-violet-500/60", text: "text-violet-300", border: "border-violet-500/50" },
  { bg: "bg-sky-500/40", active: "bg-sky-500/60", text: "text-sky-300", border: "border-sky-500/50" },
  { bg: "bg-emerald-500/40", active: "bg-emerald-500/60", text: "text-emerald-300", border: "border-emerald-500/50" },
  { bg: "bg-amber-500/40", active: "bg-amber-500/60", text: "text-amber-300", border: "border-amber-500/50" },
  { bg: "bg-rose-500/40", active: "bg-rose-500/60", text: "text-rose-300", border: "border-rose-500/50" },
  { bg: "bg-indigo-500/40", active: "bg-indigo-500/60", text: "text-indigo-300", border: "border-indigo-500/50" },
  { bg: "bg-teal-500/40", active: "bg-teal-500/60", text: "text-teal-300", border: "border-teal-500/50" },
  { bg: "bg-orange-500/40", active: "bg-orange-500/60", text: "text-orange-300", border: "border-orange-500/50" },
  { bg: "bg-pink-500/40", active: "bg-pink-500/60", text: "text-pink-300", border: "border-pink-500/50" },
  { bg: "bg-cyan-500/40", active: "bg-cyan-500/60", text: "text-cyan-300", border: "border-cyan-500/50" },
];

const SPEED_OPTIONS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2];

const CROP_PRESETS = [
  { label: "Full", value: "full", style: {} },
  { label: "Top", value: "top", style: { objectFit: "cover" as const, objectPosition: "top" } },
  { label: "Center", value: "center", style: { objectFit: "cover" as const, objectPosition: "center" } },
  { label: "Bottom", value: "bottom", style: { objectFit: "cover" as const, objectPosition: "bottom" } },
] as const;

type CropValue = typeof CROP_PRESETS[number]["value"];

interface Source {
  id: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
}

interface Section {
  id: string;
  lickId: string;
  name: string;
  startSec: number;
  endSec: number;
  orderIndex: number;
}

interface Lick {
  id: string;
  name: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  videoClipPath: string | null;
  audioClipPath: string | null;
  lastPositionSec: number;
  lastTempo: number;
  lastPitch: number;
  notes: string | null;
  source: Source;
  sections: Section[];
}

interface SectionLog {
  sectionId: string;
  loopCount: number;
  durationSec: number;
}

export default function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const activePlayTimeRef = useRef(0);
  const sectionLogsRef = useRef<Map<string, SectionLog>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopStartTimeRef = useRef<number | null>(null);

  const [lickId, setLickId] = useState<string>("");
  const [lick, setLick] = useState<Lick | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  // Pitch
  const [pitch, setPitch] = useState(0);
  const [pitchProcessing, setPitchProcessing] = useState(false);
  const pitchAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevPitchRef = useRef(0);

  // Crop
  const [crop, setCrop] = useState<CropValue>("full");

  // A-B loop
  const [abA, setAbA] = useState<number | null>(null);
  const [abB, setAbB] = useState<number | null>(null);

  // Countdown timer
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownDuration, setCountdownDuration] = useState(4);
  const [countdownOnLoop, setCountdownOnLoop] = useState(false);
  const countdownOnLoopRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCountingDownRef = useRef(false);
  const wasMutedBeforeCountdown = useRef(false);

  // Add section dialog
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [sectionStart, setSectionStart] = useState(0);
  const [sectionEnd, setSectionEnd] = useState(0);

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setLickId(id));
  }, [params]);

  const fetchLick = useCallback(async () => {
    if (!lickId) return;
    try {
      const res = await fetch(`/lickbank/api/licks/${lickId}`);
      if (!res.ok) {
        setError("Lick not found");
        return;
      }
      const data: Lick = await res.json();
      setLick(data);
      setSpeed(data.lastTempo);
      setPitch(data.lastPitch ?? 0);
    } catch {
      setError("Failed to load lick");
    } finally {
      setLoading(false);
    }
  }, [lickId]);

  useEffect(() => {
    fetchLick();
  }, [fetchLick]);

  // Create practice session on mount, end on unmount
  useEffect(() => {
    if (!lickId) return;

    const createSession = async () => {
      try {
        const res = await fetch("/lickbank/api/practice-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lickId }),
        });
        if (res.ok) {
          const session = await res.json();
          sessionIdRef.current = session.id;
          activePlayTimeRef.current = 0;
        }
      } catch {
        // silently fail
      }
    };
    createSession();

    // Flush section logs every 30s
    flushTimerRef.current = setInterval(() => {
      flushSectionLogs();
    }, 30000);

    return () => {
      // End session
      if (sessionIdRef.current) {
        const durationSec = activePlayTimeRef.current;
        flushSectionLogs();
        fetch(`/lickbank/api/practice-sessions/${sessionIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endedAt: new Date().toISOString(),
            durationSec,
          }),
        }).catch(() => {});
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lickId]);

  const flushSectionLogs = () => {
    if (!sessionIdRef.current) return;
    const logs = sectionLogsRef.current;
    logs.forEach((log) => {
      fetch(`/lickbank/api/practice-sessions/${sessionIdRef.current}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      }).catch(() => {});
    });
  };

  // Update playback rate when speed changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    if (pitchAudioRef.current) {
      pitchAudioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Save last tempo when speed changes
  useEffect(() => {
    if (!lickId || speed === lick?.lastTempo) return;
    const timer = setTimeout(() => {
      fetch(`/lickbank/api/licks/${lickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastTempo: speed }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [speed, lickId, lick?.lastTempo]);

  // Pitch processing: mute video, play pitched audio
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !lickId) return;

    if (pitch !== prevPitchRef.current) {
      video.pause();
      prevPitchRef.current = pitch;
    }

    if (pitch === 0) {
      // Restore: unmute video, destroy pitched audio
      video.muted = false;
      if (pitchAudioRef.current) {
        pitchAudioRef.current.pause();
        pitchAudioRef.current = null;
      }
      setPitchProcessing(false);
      return;
    }

    // Request server-side pitch shift
    const controller = new AbortController();
    setPitchProcessing(true);

    fetch(`/lickbank/api/licks/${lickId}/pitch`, {
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

        // Mute video, create/update pitched audio
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
        if (err?.name !== "AbortError") setPitchProcessing(false);
      });

    return () => { controller.abort(); };
  }, [pitch, lickId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync pitched audio with video playback
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

  // Save last pitch when it changes
  useEffect(() => {
    if (!lickId || pitch === (lick?.lastPitch ?? 0)) return;
    const timer = setTimeout(() => {
      fetch(`/lickbank/api/licks/${lickId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastPitch: pitch }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [pitch, lickId, lick?.lastPitch]);

  // Cleanup pitched audio on unmount
  useEffect(() => {
    return () => {
      if (pitchAudioRef.current) {
        pitchAudioRef.current.pause();
        pitchAudioRef.current = null;
      }
    };
  }, []);

  // Freeze position during countdown — avoids Safari play() gesture restrictions
  const countdownSeekTarget = useRef<number | null>(null);

  const startCountdownAt = useCallback((seekTo?: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = seekTo ?? video.currentTime;
    video.currentTime = target;

    // Mute during countdown
    wasMutedBeforeCountdown.current = video.muted;
    video.muted = true;
    if (pitchAudioRef.current) {
      pitchAudioRef.current.muted = true;
    }

    // Ensure video is playing (needed if video ended or was paused)
    if (video.paused) {
      video.play().catch(() => {});
    }

    // Don't pause — keep video "playing" but freeze via RAF seeking
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
          // Unmute
          const v = videoRef.current;
          if (v) v.muted = wasMutedBeforeCountdown.current;
          if (pitchAudioRef.current) {
            pitchAudioRef.current.muted = false;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [countdownDuration]);

  // Sync playhead + section looping
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      const ct = video.currentTime;
      setCurrentTime(ct);
      setIsPlaying(!video.paused);

      // During countdown, freeze video at the seek target
      if (isCountingDownRef.current) {
        if (countdownSeekTarget.current !== null) {
          video.currentTime = countdownSeekTarget.current;
        }
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      // A-B loop takes priority
      if (abA !== null && abB !== null) {
        if (ct >= abB - 0.05 || ct < abA - 0.1) {
          if (countdownOnLoopRef.current) {
            startCountdownAt(abA);
          } else {
            video.currentTime = abA;
          }
          loopStartTimeRef.current = Date.now();
        }
      } else if (loopEnabled && lick) {
        let loopStart = 0;
        let loopEnd = duration;

        if (selectedSections.size > 0) {
          const activeSections = lick.sections.filter((s) =>
            selectedSections.has(s.id)
          );
          if (activeSections.length > 0) {
            loopStart = Math.min(...activeSections.map((s) => s.startSec));
            loopEnd = Math.max(...activeSections.map((s) => s.endSec));
          }
        }

        if (loopEnd > 0 && (ct >= loopEnd - 0.05 || (selectedSections.size > 0 && ct < loopStart - 0.1))) {
          if (countdownOnLoopRef.current) {
            startCountdownAt(loopStart);
          } else {
            video.currentTime = loopStart;
          }
          loopStartTimeRef.current = Date.now();
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafRef.current);
  }, [loopEnabled, selectedSections, lick, duration, abA, abB, startCountdownAt]);

  // Track active play time (only when video is playing)
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      activePlayTimeRef.current += 1;
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => {
        loopStartTimeRef.current = Date.now();
      }).catch(() => {
        // Browser blocked autoplay — ignore, user will tap again
      });
    } else {
      video.pause();
    }
  };

  const handleRewind = () => {
    const video = videoRef.current;
    if (!video) return;
    if (abA !== null) {
      video.currentTime = abA;
    } else if (loopEnabled && lick && selectedSections.size > 0) {
      const activeSections = lick.sections.filter((s) => selectedSections.has(s.id));
      if (activeSections.length > 0) {
        video.currentTime = Math.min(...activeSections.map((s) => s.startSec));
      } else {
        video.currentTime = 0;
      }
    } else {
      video.currentTime = 0;
    }
  };

  const startCountdown = () => {
    const video = videoRef.current;
    if (!video) return;
    // Ensure video is playing (for Safari gesture chain)
    if (video.paused) {
      video.play().catch(() => {});
    }
    handleRewind();
    setTimeout(() => startCountdownAt(), 0);
  };

  const clearABLoop = () => {
    setAbA(null);
    setAbB(null);
  };

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleTimelineClick = (e: React.MouseEvent) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || duration === 0) return;
    const rect = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  const handleSectionClick = (section: Section, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section.id)) {
        next.delete(section.id);
      } else {
        next.add(section.id);
      }
      return next;
    });

    // Seek to section start
    if (videoRef.current) {
      videoRef.current.currentTime = section.startSec;
    }
  };

  const handleAddSection = async () => {
    if (!sectionName.trim() || !lickId) return;
    try {
      const res = await fetch(`/lickbank/api/licks/${lickId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sectionName.trim(),
          startSec: sectionStart,
          endSec: sectionEnd,
        }),
      });
      if (res.ok) {
        setAddSectionOpen(false);
        setSectionName("");
        fetchLick();
      }
    } catch {
      // silently fail
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/lickbank/api/sections/${sectionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedSections((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
        fetchLick();
      }
    } catch {
      // silently fail
    }
  };

  const openAddSectionDialog = () => {
    // Default to selected region based on current playhead
    const ct = currentTime;
    const dur = duration || lick?.durationSec || 10;
    setSectionStart(Math.max(0, ct - 2));
    setSectionEnd(Math.min(dur, ct + 5));
    setAddSectionOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading lick...</p>
      </div>
    );
  }

  if (error || !lick) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-destructive">{error || "Lick not found"}</p>
        <BackToHome label="Back to Library" />
      </div>
    );
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <BackToHome label="Library" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">{lick.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            <a
              href={`/sources/${lick.sourceId}`}
              className="hover:text-foreground hover:underline transition-colors"
              onClick={(e) => {
                e.preventDefault();
                router.push(`/sources/${lick.sourceId}`);
              }}
            >
              {lick.source.title}
            </a>
            {lick.source.artist && ` - ${lick.source.artist}`}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 min-h-0 px-4 lg:px-6 pt-2 gap-2 relative">
          {/* Video Player */}
          {lick.videoClipPath && (
            <div className="flex-1 min-h-0 max-h-[40vh] md:max-h-[55vh] rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={`/lickbank/api/media/${lick.videoClipPath}`}
                className="w-full h-full object-contain"
                style={crop !== "full" ? CROP_PRESETS.find((p) => p.value === crop)?.style : undefined}
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  if (video) {
                    setDuration(video.duration);
                    video.playbackRate = speed;
                    if (lick.lastPositionSec > 0) {
                      video.currentTime = lick.lastPositionSec;
                    }
                  }
                }}
                preload="auto"
                playsInline
                controls={false}
                onClick={handlePlayPause}
              />
            </div>
          )}

          {/* Timeline */}
          <div
            ref={timelineRef}
            className="relative w-full h-11 shrink-0 bg-muted rounded-lg cursor-pointer select-none overflow-hidden touch-none"
            onClick={handleTimelineClick}
            onTouchMove={(e) => {
              const timeline = timelineRef.current;
              const video = videoRef.current;
              if (!timeline || !video || duration === 0) return;
              const touch = e.touches[0];
              const rect = timeline.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
              video.currentTime = ratio * duration;
            }}
          >
            {/* Section blocks */}
            {lick.sections.map((section, idx) => {
              const color = SECTION_COLORS[idx % SECTION_COLORS.length];
              const isSelected = selectedSections.has(section.id);
              const leftPct = duration > 0 ? (section.startSec / duration) * 100 : 0;
              const widthPct =
                duration > 0
                  ? ((section.endSec - section.startSec) / duration) * 100
                  : 0;

              return (
                <div
                  key={section.id}
                  className={`absolute top-0 bottom-0 cursor-pointer transition-colors flex items-center justify-center ${
                    isSelected ? color.active : color.bg
                  }`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  onClick={(e) => handleSectionClick(section, e)}
                >
                  {widthPct > 8 && (
                    <span className={`text-xs font-medium truncate px-1 ${color.text}`}>
                      {section.name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* A-B loop region */}
            {abA !== null && abB !== null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-amber-500/25 border-x-2 border-amber-500/60 pointer-events-none z-5"
                style={{
                  left: `${(abA / duration) * 100}%`,
                  width: `${((abB - abA) / duration) * 100}%`,
                }}
              />
            )}
            {abA !== null && abB === null && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500 pointer-events-none z-5"
                style={{ left: `${(abA / duration) * 100}%` }}
              />
            )}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
              style={{ left: `${playheadPct}%` }}
            />

            {/* Time display */}
            <div className="absolute bottom-1 left-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(currentTime)}
            </div>
            <div className="absolute bottom-1 right-2 text-xs text-muted-foreground pointer-events-none">
              {formatTime(duration)}
            </div>
          </div>

          {/* Countdown overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <span className="text-7xl font-bold text-white tabular-nums animate-pulse">{countdown}</span>
                <button
                  className="text-sm text-white/60 hover:text-white"
                  onClick={() => {
                    if (countdownRef.current) clearInterval(countdownRef.current);
                    countdownRef.current = null;
                    setCountdown(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="shrink-0 flex flex-col gap-1.5 pb-4">
            {/* Transport row — loop, A, B, rewind, play, countdown */}
            <div className="flex items-center justify-center gap-1.5">
              {/* Loop */}
              <button
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  loopEnabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setLoopEnabled(!loopEnabled)}
                title="Toggle loop"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>

              {/* A */}
              <button
                className={`w-10 h-10 rounded-full text-sm font-bold transition-colors flex items-center justify-center ${
                  abA !== null
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  if (abA === null) {
                    setAbA(currentTime);
                  }
                }}
                title={abA !== null ? `A: ${formatTime(abA)}` : "Set A point"}
              >
                A
              </button>

              {/* B */}
              <button
                className={`w-10 h-10 rounded-full text-sm font-bold transition-colors flex items-center justify-center ${
                  abB !== null
                    ? "bg-amber-500 text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                } ${abA === null ? "opacity-40 pointer-events-none" : ""}`}
                onClick={() => {
                  if (abB === null && abA !== null && currentTime > abA) {
                    setAbB(currentTime);
                  }
                }}
                title={abB !== null ? `B: ${formatTime(abB)}` : "Set B point"}
              >
                B
              </button>

              {/* Clear A-B */}
              {abA !== null && (
                <button
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-destructive transition-colors"
                  onClick={clearABLoop}
                  title="Clear A-B loop"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Rewind */}
              <button
                className="w-10 h-10 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                onClick={handleRewind}
                title={abA !== null ? "Rewind to A point" : "Rewind to start"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 19 2 12 11 5" fill="currentColor" stroke="none" />
                  <polygon points="22 19 13 12 22 5" fill="currentColor" stroke="none" />
                </svg>
              </button>

              {/* Play/Pause */}
              <button
                className="w-13 h-13 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all shadow-lg"
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="8,4 20,12 8,20" />
                  </svg>
                )}
              </button>

              {/* Countdown timer — tap to start, long-press or second tap toggles loop-countdown */}
              <button
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors relative ${
                  countdownOnLoop
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                onClick={startCountdown}
                title={`Start with ${countdownDuration}s countdown`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2 2" />
                  <path d="M9 1h6" />
                  <path d="M12 1v2" />
                </svg>
                <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-muted-foreground text-background rounded-full w-4 h-4 flex items-center justify-center">{countdownDuration}</span>
              </button>

              {/* Countdown duration selector + loop toggle */}
              <div className="flex flex-col items-center gap-0.5">
                {[3, 4, 5].map((d) => (
                  <button
                    key={d}
                    className={`w-5 h-3.5 rounded text-[9px] font-medium transition-colors ${
                      countdownDuration === d
                        ? "bg-primary/80 text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground"
                    }`}
                    onClick={() => setCountdownDuration(d)}
                  >
                    {d}
                  </button>
                ))}
                <button
                  className={`w-5 h-3.5 rounded text-[9px] font-medium transition-colors ${
                    countdownOnLoop
                      ? "bg-amber-500 text-white"
                      : "bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground"
                  }`}
                  onClick={() => { const next = !countdownOnLoop; setCountdownOnLoop(next); countdownOnLoopRef.current = next; }}
                  title={countdownOnLoop ? "Countdown on every loop (on)" : "Countdown on every loop (off)"}
                >
                  {countdownOnLoop ? "ON" : "LP"}
                </button>
              </div>
            </div>

            {/* Speed + Pitch + Crop — single row */}
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {/* Speed buttons */}
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    speed === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}

              <div className="w-px h-5 bg-border mx-1" />

              {/* Pitch */}
              <button
                className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center text-sm font-medium disabled:opacity-40"
                onClick={() => setPitch((p) => Math.max(-12, p - 1))}
                disabled={pitch <= -12 || pitchProcessing}
              >
                -
              </button>
              <button
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors min-w-[2.5rem] text-center ${
                  pitch === 0
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
                onClick={() => setPitch(0)}
                disabled={pitchProcessing}
              >
                {pitchProcessing ? "..." : `${pitch >= 0 ? "+" : ""}${pitch}st`}
              </button>
              <button
                className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 text-foreground flex items-center justify-center text-sm font-medium disabled:opacity-40"
                onClick={() => setPitch((p) => Math.min(12, p + 1))}
                disabled={pitch >= 12 || pitchProcessing}
              >
                +
              </button>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Crop */}
              {CROP_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    crop === preset.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setCrop(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Add Section Dialog -- kept for programmatic use */}
      <Dialog open={addSectionOpen} onOpenChange={setAddSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                placeholder="e.g. Intro, Verse, Solo"
                value={sectionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSectionName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") handleAddSection();
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start (sec)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max={duration}
                  value={sectionStart.toFixed(1)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSectionStart(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End (sec)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max={duration}
                  value={sectionEnd.toFixed(1)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSectionEnd(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatTime(sectionStart)} - {formatTime(sectionEnd)} (
              {formatTime(Math.max(0, sectionEnd - sectionStart))})
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddSectionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSection}
              disabled={!sectionName.trim() || sectionEnd <= sectionStart}
            >
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
