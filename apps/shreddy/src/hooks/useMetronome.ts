import { useRef, useCallback, useEffect, useState } from "react";

interface MetronomeOptions {
  bpm: number;               // effective BPM (song.bpm * tempo)
  enabled: boolean;
  volume: number;             // 0-1
  playing: boolean;           // whether the song is playing
  audioRef: React.RefObject<HTMLAudioElement | null>; // ref to audio element for precise time reads
  beatTimestamps?: number[];  // librosa-detected beat times (at 1x tempo)
  tempo: number;              // tempo multiplier
  standalone: boolean;        // standalone mode (no song playing)
}

const SCHEDULE_AHEAD = 0.15;  // seconds to look ahead
const TICK_INTERVAL = 20;      // ms between scheduler runs

export function useMetronome({
  bpm,
  enabled,
  volume,
  playing,
  audioRef,
  beatTimestamps,
  tempo,
  standalone,
}: MetronomeOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTickTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const lastScheduledBeatRef = useRef(-1);
  const [isActive, setIsActive] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);

  // Tap tempo state (declared early so refs can use manualBpm)
  const tapTempoTimesRef = useRef<number[]>([]);
  const [manualBpm, setManualBpm] = useState<number | null>(null);

  // Store latest values in refs to avoid scheduler recreation
  const bpmRef = useRef(bpm);
  const volumeRef = useRef(volume);
  const tempoRef = useRef(tempo);
  const beatTimestampsRef = useRef(beatTimestamps);

  // If user tapped a manual BPM, override the passed-in bpm
  bpmRef.current = manualBpm !== null ? manualBpm * tempo : bpm;
  volumeRef.current = volume;
  tempoRef.current = tempo;
  beatTimestampsRef.current = beatTimestamps;

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

  // Update volume in real-time
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = volume;
    }
  }, [volume]);

  const stopScheduler = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    lastScheduledBeatRef.current = -1;
    beatCountRef.current = 0;
  }, []);

  // Start the scheduler — uses refs internally so it doesn't need to recreate
  const startScheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Initialize next tick to now
    nextTickTimeRef.current = ctx.currentTime;
    beatCountRef.current = 0;
    lastScheduledBeatRef.current = -1;

    const scheduler = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const currentBpm = bpmRef.current;
      if (currentBpm <= 0) return;

      const beats = beatTimestampsRef.current;
      const hasSyncedBeats = beats && beats.length > 0 && !standalone;

      if (hasSyncedBeats) {
        // Beat-synced mode: read audio time directly for precision
        const audio = audioRef.current;
        if (!audio) return;
        const songTime = audio.currentTime;
        const currentTempo = tempoRef.current;

        // Find next unscheduled beat using binary search from current position
        let startIdx = lastScheduledBeatRef.current + 1;
        // If we seeked backwards, reset
        if (startIdx > 0 && startIdx < beats.length) {
          const prevBeatTime = beats[startIdx - 1] / currentTempo;
          if (songTime < prevBeatTime - 1) {
            // Seeked backwards — find new position
            startIdx = 0;
            lastScheduledBeatRef.current = -1;
          }
        }

        for (let i = startIdx; i < beats.length; i++) {
          const beatTime = beats[i] / currentTempo;
          const delta = beatTime - songTime;

          // Too far ahead — stop scanning
          if (delta >= SCHEDULE_AHEAD) break;

          // Skip beats that are already past
          if (delta < -0.05) {
            lastScheduledBeatRef.current = i;
            continue;
          }

          // Schedule this beat
          const isDownbeat = i % 4 === 0;
          const scheduleAt = ctx.currentTime + Math.max(0, delta);
          scheduleClick(scheduleAt, isDownbeat);
          setCurrentBeat(i % 4);
          lastScheduledBeatRef.current = i;
        }
      } else {
        // Free-running mode
        const secPerBeat = 60 / currentBpm;

        while (nextTickTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
          const isDownbeat = beatCountRef.current % 4 === 0;
          scheduleClick(nextTickTimeRef.current, isDownbeat);
          setCurrentBeat(beatCountRef.current % 4);
          nextTickTimeRef.current += secPerBeat;
          beatCountRef.current++;
        }
      }
    };

    // Run immediately then on interval
    scheduler();
    timerRef.current = setInterval(scheduler, TICK_INTERVAL);
  }, [scheduleClick, audioRef, standalone]);

  // Tap to sync — reset beat grid to current moment
  const tapSync = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    nextTickTimeRef.current = ctx.currentTime;
    beatCountRef.current = 0;
    lastScheduledBeatRef.current = -1;
  }, []);

  // Count-in: play 4 beats then resolve
  const doCountIn = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const ctx = initAudio();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const currentBpm = bpmRef.current;
      if (currentBpm <= 0) {
        resolve();
        return;
      }

      const secPerBeat = 60 / currentBpm;
      let time = ctx.currentTime + 0.1;

      for (let i = 0; i < 4; i++) {
        scheduleClick(time, i === 0);
        time += secPerBeat;
      }

      setTimeout(() => {
        resolve();
      }, (secPerBeat * 4 + 0.1) * 1000);
    });
  }, [initAudio, scheduleClick]);

  // Tap tempo handler
  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = [...tapTempoTimesRef.current, now].filter(t => now - t < 5000);
    tapTempoTimesRef.current = taps;

    if (taps.length >= 3) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const tappedBpm = Math.round(60000 / avg);
      if (tappedBpm >= 30 && tappedBpm <= 300) {
        setManualBpm(tappedBpm);
      }
    }
  }, []);

  const resetManualBpm = useCallback(() => {
    setManualBpm(null);
    tapTempoTimesRef.current = [];
  }, []);

  // Main effect: start/stop based on state
  useEffect(() => {
    const effectiveBpm = manualBpm !== null ? manualBpm * tempo : bpm;
    const shouldRun = enabled && (playing || standalone) && effectiveBpm > 0;

    if (shouldRun) {
      const ctx = initAudio();
      const start = () => {
        stopScheduler();
        startScheduler();
        setIsActive(true);
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(start);
      } else {
        start();
      }
    } else {
      stopScheduler();
      setIsActive(false);
      setCurrentBeat(-1);
    }

    return () => stopScheduler();
  }, [enabled, playing, standalone, bpm, manualBpm, tempo, initAudio, startScheduler, stopScheduler]);

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
    isActive,
    currentBeat,
    tapSync,
    doCountIn,
    handleTapTempo,
    manualBpm,
    resetManualBpm,
  };
}
