"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
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
import { ArrowRightIcon, CornersInIcon, CornersOutIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { PracticeControls, ViewSwitch, CROP_PRESETS, type CropValue } from "@/components/PracticeControls";

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


interface Source {
  id: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  waveformData: string | null;
}

const WAVE_BARS = 160;

/** This lick's slice of the song's waveform peaks, resampled to WAVE_BARS. */
function lickPeaks(lick: { startSec: number; endSec: number; source: Source }): number[] {
  const { waveformData, durationSec } = lick.source;
  if (!waveformData || !durationSec) return [];
  let peaks: number[];
  try {
    peaks = JSON.parse(waveformData);
  } catch {
    return [];
  }
  const from = (lick.startSec / durationSec) * peaks.length;
  const to = (lick.endSec / durationSec) * peaks.length;
  if (to - from < 1) return [];
  const step = (to - from) / WAVE_BARS;
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const a = Math.floor(from + i * step);
    const b = Math.max(a + 1, Math.floor(from + (i + 1) * step));
    return Math.max(...peaks.slice(a, b));
  });
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

/** One entry in the practice sequence — its own clip, played back to back. */
interface QueueItem {
  id: string;
  name: string;
  videoClipPath: string | null;
  durationSec: number;
  startSec: number;
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

  // Full screen: the video fills the display with the transport floating on
  // top. The page asks the browser for real full screen to hide its chrome,
  // but the layout itself is CSS, so it also works where the Fullscreen API
  // doesn't (iPhone) and the loop, count-in and controls keep running —
  // unlike the video element's native player.
  const [fullscreen, setFullscreen] = useState(false);

  const enterFullscreen = () => {
    setFullscreen(true);
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  };

  const exitFullscreen = () => {
    setFullscreen(false);
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
  };

  // Leaving browser full screen another way (Esc, the system gesture) leaves
  // ours too; Esc also closes it where the API isn't available.
  useEffect(() => {
    if (!fullscreen) return;
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const onChange = () => {
      if (!document.fullscreenElement && !doc.webkitFullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  // A-B loop. In a sequence the points carry the clip they were set on, so the
  // span can cover several licks instead of being trapped in one.
  const [abA, setAbA] = useState<number | null>(null);
  const [abB, setAbB] = useState<number | null>(null);
  const [abAIndex, setAbAIndex] = useState(0);
  const [abBIndex, setAbBIndex] = useState(0);

  // Countdown timer
  const [countdown, setCountdown] = useState<number | null>(null);
  // 0 = off; otherwise Play counts in this many seconds first.
  const [countdownDuration, setCountdownDuration] = useState(0);
  const [countdownOnLoop, setCountdownOnLoop] = useState(false);
  const countdownOnLoopRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCountingDownRef = useRef(false);
  const wasMutedBeforeCountdown = useRef(false);

  // Practice sequence — licks from this song played one after another, each
  // still its own clip. Session-only: it's a drill you rebuild as you improve.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [songLicks, setSongLicks] = useState<QueueItem[]>([]);
  const [addToQueueOpen, setAddToQueueOpen] = useState(false);
  const autoPlayNextRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const countdownAfterLoadRef = useRef(false);

  const chainMode = queue.length > 1;
  const activeClip = queue[activeIndex] ?? queue[0] ?? null;

  // A lick already in the sequence isn't offered again — repeating one is a
  // loop, which the loop button already does.
  const queuedIds = new Set(queue.map((q) => q.id));
  const queueableLicks = songLicks.filter(
    (l) => !queuedIds.has(l.id) && l.videoClipPath
  );

  const addToQueue = (item: QueueItem) => {
    setQueue((prev) => [...prev, item]);
    setAddToQueueOpen(false);
  };

  const removeFromQueue = (index: number) => {
    // Dropping the lick that is playing hands the slot to the next one — keep
    // the drill running rather than stopping it dead.
    if (index === activeIndex && !videoRef.current?.paused) {
      autoPlayNextRef.current = true;
    }
    setQueue((prev) => prev.filter((_, i) => i !== index));
    // Keep playing whatever is on screen: shift the pointer if the removed
    // entry sat before it, and never point past the end.
    setActiveIndex((prev) => {
      const next = index < prev ? prev - 1 : prev;
      return Math.min(next, queue.length - 2);
    });
    // The A-B anchors name a position in the queue, so removing an entry moves
    // them. Dropping the very lick an anchor sits on leaves it meaningless —
    // clear the loop rather than silently pointing it at a different lick.
    if (abAIndex === index || abBIndex === index) {
      clearABLoop();
      return;
    }
    if (abAIndex > index) setAbAIndex((i) => i - 1);
    if (abBIndex > index) setAbBIndex((i) => i - 1);
  };

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
      setQueue([
        {
          id: data.id,
          name: data.name,
          videoClipPath: data.videoClipPath,
          durationSec: data.durationSec,
          startSec: data.startSec,
        },
      ]);
      setActiveIndex(0);
    } catch {
      setError("Failed to load lick");
    } finally {
      setLoading(false);
    }
  }, [lickId]);

  useEffect(() => {
    fetchLick();
  }, [fetchLick]);

  // The pool to build a sequence from: everything clipped out of this song,
  // in the order it happens in the song.
  useEffect(() => {
    const sourceId = lick?.sourceId;
    if (!sourceId) return;
    fetch(`/lickbank/api/sources/${sourceId}`)
      .then((r) => r.json())
      .then((data) => {
        const licks: QueueItem[] = (data.licks ?? [])
          .map((l: QueueItem) => ({
            id: l.id,
            name: l.name,
            videoClipPath: l.videoClipPath,
            durationSec: l.durationSec,
            startSec: l.startSec,
          }))
          .sort((a: QueueItem, b: QueueItem) => a.startSec - b.startSec);
        setSongLicks(licks);
      })
      .catch(() => {});
  }, [lick?.sourceId]);

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
    if (!video || !activeClip) return;

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

    fetch(`/lickbank/api/licks/${activeClip.id}/pitch`, {
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
        // The sequence hands over mid-playback, so the video's "play" event has
        // already fired — nothing else would start this clip's audio.
        if (!v.paused) audio.play().catch(() => {});
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setPitchProcessing(false);
      });

    return () => { controller.abort(); };
  }, [pitch, activeClip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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


  /**
   * Seek to a point in the sequence, changing clip if the point lives in
   * another one. The seek is deferred to the new clip's metadata event, since
   * currentTime means nothing until it has loaded.
   */
  const jumpToSequencePoint = useCallback(
    (index: number, time: number, autoPlay: boolean, countIn = false) => {
      const video = videoRef.current;
      if (!video) return;
      if (index === activeIndex) {
        if (countIn) startCountdownAt(time);
        else video.currentTime = time;
        return;
      }
      pendingSeekRef.current = time;
      autoPlayNextRef.current = autoPlay;
      countdownAfterLoadRef.current = countIn;
      setActiveIndex(index);
    },
    [activeIndex, startCountdownAt]
  );

  /**
   * Move to the next clip in the sequence. Wraps to the top when loop is on,
   * otherwise the run just ends — the point is to rehearse the parts in order,
   * not to be trapped in them.
   */
  const advanceChain = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setActiveIndex((prev) => {
      const next = prev + 1;
      if (next < queue.length) {
        autoPlayNextRef.current = true;
        return next;
      }
      if (loopEnabled) {
        autoPlayNextRef.current = true;
        // The sequence starting over is the loop — count it in like one.
        countdownAfterLoadRef.current = countdownOnLoopRef.current;
        return 0;
      }
      video.pause();
      return prev;
    });
  }, [queue.length, loopEnabled]);

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

      // A sequence owns the end of the clip: hand over to the next lick rather
      // than looping this one. A-B and section loops stay for a single lick.
      if (chainMode) {
        if (abA !== null && abB !== null) {
          const pastB =
            activeIndex > abBIndex || (activeIndex === abBIndex && ct >= abB - 0.05);
          const beforeA =
            activeIndex < abAIndex || (activeIndex === abAIndex && ct < abA - 0.1);
          if (pastB || beforeA) {
            jumpToSequencePoint(abAIndex, abA, !video.paused, countdownOnLoopRef.current);
            loopStartTimeRef.current = Date.now();
            rafRef.current = requestAnimationFrame(update);
            return;
          }
        }
        // Clips inside the span still hand over normally at their end.
        if (duration > 0 && ct >= duration - 0.05) {
          advanceChain();
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
  }, [loopEnabled, selectedSections, lick, duration, abA, abB, startCountdownAt, chainMode, advanceChain, activeIndex, abAIndex, abBIndex, jumpToSequencePoint]);

  // Track active play time (only when video is playing)
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      activePlayTimeRef.current += 1;
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Stops a count-in where it stands: video paused, sound back on.
  const cancelCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    isCountingDownRef.current = false;
    countdownSeekTarget.current = null;
    setCountdown(null);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.muted = wasMutedBeforeCountdown.current;
    }
    if (pitchAudioRef.current) pitchAudioRef.current.muted = false;
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    // Pause during a count-in calls the take off rather than leaving the
    // video frozen and muted.
    if (isCountingDownRef.current) {
      cancelCountdown();
      return;
    }
    if (video.paused) {
      // With a count-in set, Play counts in from where the playhead sits.
      // startCountdownAt starts the video itself, inside this tap's gesture.
      if (countdownDuration > 0) {
        startCountdownAt();
        return;
      }
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
    // In a sequence, "back to the top" means the top of the drill — the first
    // lick — not the top of whichever clip happens to be playing.
    if (chainMode) {
      jumpToSequencePoint(abA !== null ? abAIndex : 0, abA ?? 0, !video.paused);
      return;
    }
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

  const clearABLoop = () => {
    setAbA(null);
    setAbB(null);
    setAbAIndex(0);
    setAbBIndex(0);
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
  // The waveform belongs to this lick; a clip the chain handed over has its own.
  const peaks = activeClip?.id === lick.id ? lickPeaks(lick) : [];

  // What is looping right now, as a span of the clip on screen: an A-B span
  // (or this clip's slice of one), else the selected sections, else the lick.
  let region: { from: number; to: number; ab: boolean } | null = null;
  if (duration > 0) {
    if (abA !== null && abB !== null && activeIndex >= abAIndex && activeIndex <= abBIndex) {
      region = {
        from: activeIndex === abAIndex ? abA : 0,
        to: activeIndex === abBIndex ? abB : duration,
        ab: true,
      };
    } else if (loopEnabled && !chainMode && abA === null) {
      const active = lick.sections.filter((s) => selectedSections.has(s.id));
      region = active.length > 0
        ? { from: Math.min(...active.map((s) => s.startSec)), to: Math.max(...active.map((s) => s.endSec)), ab: false }
        : { from: 0, to: duration, ab: false };
    }
  }
  // The loop fills like a progress bar, so you can see how far through the
  // pass you are without reading times.
  const regionFill = region
    ? Math.max(0, Math.min(100, ((currentTime - region.from) / (region.to - region.from)) * 100))
    : 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 lg:px-6 py-3">
        <BackToHome label="Library" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{lick.name}</h1>
          <p className="text-sm text-muted-foreground truncate">
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
            {lick.source.artist && ` · ${lick.source.artist}`}
          </p>
        </div>
        <ViewSwitch crop={crop} onCrop={setCrop} />
      </header>

      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 min-h-0 px-4 lg:px-6 pt-1 pb-36 gap-3 relative">
          {/* Video Player */}
          {activeClip?.videoClipPath && (
            <div
              className={
                fullscreen
                  ? "fixed inset-0 z-40 bg-black"
                  : "relative flex-1 min-h-0 max-h-[40vh] md:max-h-[55vh] rounded-3xl overflow-hidden bg-black"
              }
            >
              <video
                ref={videoRef}
                src={`/lickbank/api/media/${activeClip.videoClipPath}`}
                className="w-full h-full object-contain"
                style={crop !== "full" ? CROP_PRESETS.find((p) => p.value === crop)?.style : undefined}
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  if (video) {
                    setDuration(video.duration);
                    video.playbackRate = speed;
                    // Resume only the lick this page is for; a clip the
                    // sequence just handed us starts at the top.
                    if (activeClip.id === lick.id && !chainMode && lick.lastPositionSec > 0) {
                      video.currentTime = lick.lastPositionSec;
                    }
                    if (pendingSeekRef.current !== null) {
                      video.currentTime = pendingSeekRef.current;
                      pendingSeekRef.current = null;
                    }
                    if (autoPlayNextRef.current) {
                      autoPlayNextRef.current = false;
                      video.play().catch(() => {});
                    }
                    if (countdownAfterLoadRef.current) {
                      countdownAfterLoadRef.current = false;
                      startCountdownAt(video.currentTime);
                    }
                  }
                }}
                preload="auto"
                playsInline
                controls={false}
                onClick={handlePlayPause}
              />
              {/* Countdown overlay */}
              {countdown !== null && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-3">
                    <span className="text-8xl font-bold text-white tabular-nums animate-pulse">{countdown}</span>
                    <button
                      className="h-11 px-5 rounded-full text-base font-medium text-white/80 bg-white/10 hover:bg-white/20 active:scale-95 transition-all"
                      onClick={cancelCountdown}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {fullscreen && (
                // The timeline is hidden in full screen; this keeps your place.
                <div className="absolute bottom-0 inset-x-0 z-20 h-1 bg-white/20 pointer-events-none">
                  <div className="h-full bg-loop" style={{ width: `${playheadPct}%` }} />
                </div>
              )}
              {fullscreen ? (
                <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 bg-gradient-to-b from-black/60 to-transparent">
                  <ViewSwitch crop={crop} onCrop={setCrop} />
                  <button
                    onClick={exitFullscreen}
                    className="size-12 shrink-0 rounded-full bg-black/50 text-white grid place-items-center backdrop-blur-md active:scale-90 transition-transform"
                    aria-label="Exit full screen"
                  >
                    <CornersInIcon className="size-6" weight="bold" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={enterFullscreen}
                  className="absolute top-3 right-3 z-20 size-11 rounded-full bg-black/50 text-white grid place-items-center backdrop-blur-md active:scale-90 transition-transform"
                  aria-label="Full screen"
                >
                  <CornersOutIcon className="size-5" weight="bold" />
                </button>
              )}
            </div>
          )}

          {/* Timeline */}
          <div>
            <div
              ref={timelineRef}
              className="relative w-full h-16 shrink-0 bg-muted rounded-2xl cursor-pointer select-none overflow-hidden touch-none"
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
              {/* Section blocks — hidden while a sequence is playing, since they
                  describe this lick and not whichever clip is on screen */}
              {(chainMode ? [] : lick.sections).map((section, idx) => {
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
                    className={`absolute top-0 bottom-0 cursor-pointer transition-colors flex items-start justify-center pt-0.5 ${
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

              {/* Waveform — played bars brighten behind the playhead */}
              {peaks.length > 0 && (
                <div className="absolute inset-x-3 inset-y-2 flex items-center gap-px pointer-events-none">
                  {peaks.map((p, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full ${(i / peaks.length) * 100 < playheadPct ? "bg-foreground/70" : "bg-foreground/25"}`}
                      style={{ height: `${Math.max(8, p * 100)}%` }}
                    />
                  ))}
                </div>
              )}

              {/* Loop region */}
              {region && (
                <div
                  className="absolute inset-y-1 rounded-xl border-2 border-loop overflow-hidden pointer-events-none z-5"
                  style={{
                    left: `${(region.from / duration) * 100}%`,
                    width: `${((region.to - region.from) / duration) * 100}%`,
                  }}
                >
                  <div className="h-full bg-loop/25" style={{ width: `${regionFill}%` }} />
                  {region.ab && activeIndex === abAIndex && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 size-5 rounded-md bg-loop text-loop-foreground text-xs font-bold grid place-items-center">A</span>
                  )}
                  {region.ab && activeIndex === abBIndex && (
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 size-5 rounded-md bg-loop text-loop-foreground text-xs font-bold grid place-items-center">B</span>
                  )}
                </div>
              )}
              {abA !== null && abB === null && duration > 0 && activeIndex === abAIndex && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-loop pointer-events-none z-5"
                  style={{ left: `${(abA / duration) * 100}%` }}
                />
              )}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground pointer-events-none z-10"
                style={{ left: `${playheadPct}%` }}
              />
            </div>
            <div className="flex justify-between px-1 pt-1.5 text-sm font-mono text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Practice sequence — the licks queued after this one, in order */}
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground mr-1">Chain</span>
            {queue.map((item, i) => (
              <Fragment key={`${item.id}-${i}`}>
                {i > 0 && <ArrowRightIcon className="size-4 text-muted-foreground shrink-0" />}
                <div
                  className={`flex items-center h-11 rounded-xl border text-sm font-semibold transition-colors ${
                    i === activeIndex
                      ? "border-loop bg-loop/10 text-loop"
                      : "border-transparent bg-muted text-foreground"
                  }`}
                >
                  <button
                    className="h-full pl-4 pr-3 flex items-center gap-2"
                    onClick={() => jumpToSequencePoint(i, 0, isPlaying)}
                    title={`Jump to ${item.name}`}
                  >
                    {item.name}
                    <span className="font-mono text-xs opacity-60">{formatTime(item.durationSec)}</span>
                  </button>
                  {i > 0 && (
                    <button
                      className="size-11 -ml-2 grid place-items-center text-muted-foreground hover:text-destructive"
                      onClick={() => removeFromQueue(i)}
                      title={`Remove ${item.name} from the sequence`}
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              </Fragment>
            ))}
            {queueableLicks.length > 0 && (
              <button
                className="h-11 px-4 rounded-xl flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-dashed border-border active:scale-95 transition-all"
                onClick={() => setAddToQueueOpen(true)}
                title="Add another lick from this song to practise in sequence"
              >
                <PlusIcon className="size-4" />
                Add lick
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Controls — shared with the clipper so practice works the same in both */}
      <div className={`fixed left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] w-max max-w-[calc(100vw-2rem)] ${fullscreen ? "z-50" : "z-30"}`}>
        <PracticeControls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          loopEnabled={loopEnabled}
          onToggleLoop={() => setLoopEnabled(!loopEnabled)}
          abA={abA}
          abB={abB}
          onSetA={() => {
            if (abA !== null) return;
            setAbA(currentTime);
            setAbAIndex(activeIndex);
          }}
          onSetB={() => {
            if (abB !== null || abA === null) return;
            // B must come after A — later in the sequence, or later in the
            // same clip.
            if (activeIndex > abAIndex || (activeIndex === abAIndex && currentTime > abA)) {
              setAbB(currentTime);
              setAbBIndex(activeIndex);
            }
          }}
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

      {/* Add-to-sequence picker — this song's licks, in song order */}
      <Dialog open={addToQueueOpen} onOpenChange={setAddToQueueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to practice sequence</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
            {queueableLicks.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted hover:bg-accent transition-colors text-left"
                onClick={() => addToQueue(item)}
              >
                <span className="text-sm font-medium truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatTime(item.durationSec)}
                </span>
              </button>
            ))}
            {queueableLicks.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Every lick from this song is already in the sequence.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddToQueueOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
