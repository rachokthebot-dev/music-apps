import { useRef, useCallback, useEffect, useState } from "react";

export interface MetronomeState {
  isPlaying: boolean;
  currentBeat: number;
  bpm: number;
  /** Remaining timer seconds, null if no timer set */
  timerRemaining: number | null;
  /** Whether the metronome is currently fading out */
  isFadingOut: boolean;
}

interface UseMetronomeOptions {
  bpm: number;
  volume: number;
  beatsPerMeasure: number;
  /** Timer duration in seconds, 0 = no timer */
  timerDuration: number;
}

const SCHEDULE_AHEAD = 0.15; // seconds to look ahead
const TICK_INTERVAL = 20; // ms between scheduler runs
const FADE_OUT_DURATION = 2; // seconds for fade-out

export function useMetronome({ bpm, volume, beatsPerMeasure, timerDuration }: UseMetronomeOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTickTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const visualTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Store latest values in refs
  const bpmRef = useRef(bpm);
  const volumeRef = useRef(volume);
  const beatsPerMeasureRef = useRef(beatsPerMeasure);
  const timerDurationRef = useRef(timerDuration);

  bpmRef.current = bpm;
  volumeRef.current = volume;
  beatsPerMeasureRef.current = beatsPerMeasure;
  timerDurationRef.current = timerDuration;

  // Tap tempo state
  const tapTimesRef = useRef<number[]>([]);
  const [tappedBpm, setTappedBpm] = useState<number | null>(null);

  // Initialize AudioContext
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = volumeRef.current;
    audioCtxRef.current = ctx;
    gainRef.current = gain;
    return ctx;
  }, []);

  // Schedule a click sound
  const scheduleClick = useCallback((time: number, isDownbeat: boolean) => {
    const ctx = audioCtxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;

    const osc = ctx.createOscillator();
    const clickGain = ctx.createGain();

    osc.frequency.value = isDownbeat ? 1000 : 800;
    osc.type = "sine";

    clickGain.gain.setValueAtTime(0, time);
    clickGain.gain.linearRampToValueAtTime(1, time + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(clickGain);
    clickGain.connect(gain);

    osc.start(time);
    osc.stop(time + 0.06);
  }, []);

  // Chime played when the practice timer reaches zero.
  // Routes directly to ctx.destination so the click-fade gain doesn't mute it.
  const playEndChime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes: { freq: number; start: number; dur: number }[] = [
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 1175, start: 0.2, dur: 0.18 },
      { freq: 1568, start: 0.4, dur: 0.55 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      g.gain.setValueAtTime(0, now + n.start);
      g.gain.linearRampToValueAtTime(0.4, now + n.start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    }
  }, []);

  // Update volume in real-time
  useEffect(() => {
    if (gainRef.current && !isFadingOut) {
      gainRef.current.gain.value = volume;
    }
  }, [volume, isFadingOut]);

  const stopScheduler = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    visualTimeoutsRef.current.forEach(clearTimeout);
    visualTimeoutsRef.current.clear();
    beatCountRef.current = 0;
  }, []);

  // Fade out then stop
  const fadeOutAndStop = useCallback(() => {
    const gain = gainRef.current;
    const ctx = audioCtxRef.current;
    if (!gain || !ctx) {
      stopScheduler();
      setIsPlaying(false);
      setCurrentBeat(-1);
      setTimerRemaining(null);
      setIsFadingOut(false);
      return;
    }

    setIsFadingOut(true);

    // Ramp gain to 0 over FADE_OUT_DURATION
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT_DURATION);

    setTimeout(() => {
      stopScheduler();
      setIsPlaying(false);
      setCurrentBeat(-1);
      setTimerRemaining(null);
      setIsFadingOut(false);
      // Reset gain for next play
      if (gainRef.current) {
        gainRef.current.gain.cancelScheduledValues(0);
        gainRef.current.gain.value = volumeRef.current;
      }
    }, FADE_OUT_DURATION * 1000);
  }, [stopScheduler]);

  // Start the scheduler
  const startScheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    nextTickTimeRef.current = ctx.currentTime;
    beatCountRef.current = 0;

    const scheduler = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const currentBpm = bpmRef.current;
      if (currentBpm <= 0) return;

      const secPerBeat = 60 / currentBpm;
      const beats = beatsPerMeasureRef.current;

      while (nextTickTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
        const isDownbeat = beatCountRef.current % beats === 0;
        const beatIndex = beatCountRef.current % beats;
        const clickTime = nextTickTimeRef.current;
        scheduleClick(clickTime, isDownbeat);

        const delayMs = Math.max(0, (clickTime - ctx.currentTime) * 1000);
        const handle = setTimeout(() => {
          setCurrentBeat(beatIndex);
          visualTimeoutsRef.current.delete(handle);
        }, delayMs);
        visualTimeoutsRef.current.add(handle);

        nextTickTimeRef.current += secPerBeat;
        beatCountRef.current++;
      }
    };

    scheduler();
    timerRef.current = setInterval(scheduler, TICK_INTERVAL);
  }, [scheduleClick]);

  // Start playing
  const start = useCallback(() => {
    const ctx = initAudio();

    const doStart = () => {
      stopScheduler();
      setIsFadingOut(false);

      // Reset gain in case it was faded
      if (gainRef.current) {
        gainRef.current.gain.cancelScheduledValues(0);
        gainRef.current.gain.value = volumeRef.current;
      }

      startScheduler();
      setIsPlaying(true);

      // Start countdown timer if duration is set
      const duration = timerDurationRef.current;
      if (duration > 0) {
        setTimerRemaining(duration);
        const startTime = Date.now();
        countdownRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = duration - elapsed;
          if (remaining <= 0) {
            setTimerRemaining(0);
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
              countdownRef.current = null;
            }
            playEndChime();
            fadeOutAndStop();
          } else {
            setTimerRemaining(remaining);
          }
        }, 250);
      } else {
        setTimerRemaining(null);
      }
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(doStart);
    } else {
      doStart();
    }
  }, [initAudio, startScheduler, stopScheduler, fadeOutAndStop, playEndChime]);

  // Stop playing
  const stop = useCallback(() => {
    stopScheduler();
    setIsPlaying(false);
    setCurrentBeat(-1);
    setTimerRemaining(null);
    setIsFadingOut(false);
    if (gainRef.current) {
      gainRef.current.gain.cancelScheduledValues(0);
      gainRef.current.gain.value = volumeRef.current;
    }
  }, [stopScheduler]);

  // Toggle play/stop
  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      start();
    }
  }, [isPlaying, start, stop]);

  // Tap tempo handler — 3-tap averaging within 5s window
  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = [...tapTimesRef.current, now].filter(t => now - t < 5000);
    tapTimesRef.current = taps;

    if (taps.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detected = Math.round(60000 / avg);
      if (detected >= 30 && detected <= 320) {
        setTappedBpm(detected);
      }
    }
  }, []);

  const clearTappedBpm = useCallback(() => {
    setTappedBpm(null);
    tapTimesRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScheduler();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopScheduler]);

  return {
    isPlaying,
    currentBeat,
    timerRemaining,
    isFadingOut,
    tappedBpm,
    start,
    stop,
    toggle,
    handleTapTempo,
    clearTappedBpm,
  };
}
