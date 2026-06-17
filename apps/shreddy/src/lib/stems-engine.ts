// R5 Stems playback engine.
//
// Plays the 4 Demucs stems (vocals, drums, bass, other) through Web Audio
// with per-stem mute via gain nodes. Sample-locked: all 4 BufferSourceNodes
// are scheduled at the same ctx.currentTime + lookahead, so they stay
// rigorously aligned across play/seek/tempo changes.
//
// Architecture (locked by the v1 deepening; see plan):
//   * One shared AudioContext (module-singleton from lib/audio-context).
//   * 4 persistent GainNodes — one per stem — connected to ctx.destination
//     once at construction. We never reconnect them. Mute toggles ramp the
//     gain over 20 ms via linearRampToValueAtTime (no direct .value writes
//     — those click on iPad).
//   * BufferSourceNodes are throwaway: Web Audio one-shots. We recreate
//     them on every play() and seek().
//   * Decoded AudioBuffers are kept in memory while the engine is alive
//     so seek/play don't pay decode cost. ~63MB per stem at 32kHz Float32
//     mono ≈ 252MB for 4 stems on a 4-min song. Caller is expected to
//     dispose() when leaving the practice page.
//
// Lifecycle:
//   const engine = createStemsEngine();
//   await engine.load({ vocals: url, drums: url, bass: url, other: url });
//   engine.play(audioTime);              // start at offset (seconds)
//   engine.setMute("vocals", true);      // 20ms gain ramp
//   engine.seek(audioTime);              // stop + restart, sample-locked
//   engine.pause();
//   engine.dispose();                    // releases buffers + disconnects
//
// The engine doesn't know about tempo / playbackRate. Tempo changes are
// applied by the caller via the BufferSource.playbackRate setter; the
// caller-facing hook (useStemsEngine) is what owns that.

import { getAudioContext } from "./audio-context";

export const STEM_NAMES = ["vocals", "drums", "bass", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];

export type StemUrls = Record<StemName, string>;

interface StemNode {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
}

const RAMP_SECONDS = 0.02; // 20ms ramp avoids gain clicks on iPad.

export interface StemsEngine {
  load(urls: StemUrls, signal?: AbortSignal): Promise<void>;
  play(offsetSeconds: number, playbackRate?: number): void;
  pause(): void;
  seek(offsetSeconds: number, playbackRate?: number): void;
  /** Live setter — playing sources reflect immediately. */
  setPlaybackRate(rate: number): void;
  /** Mute / un-mute a single stem with a 20ms gain ramp. */
  setMute(stem: StemName, muted: boolean): void;
  /** Wall-clock-ish play position in source seconds. */
  getCurrentTime(): number;
  /** True between play() and pause()/end-of-buffer. */
  isPlaying(): boolean;
  /** Duration of the longest loaded stem (sec). 0 before load(). */
  getDuration(): number;
  dispose(): void;
}

export function createStemsEngine(): StemsEngine {
  const ctx = getAudioContext();
  // GainNodes are created once and stay connected.
  const stems: Record<StemName, StemNode> = Object.fromEntries(
    STEM_NAMES.map((name) => {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(ctx.destination);
      return [name, { buffer: null, source: null, gain }];
    })
  ) as Record<StemName, StemNode>;

  let playing = false;
  let playbackRate = 1.0;
  // When playing: startCtxTime is the ctx.currentTime at which sources
  // were scheduled, and startOffset is the source-time offset they began
  // at. Together they give us getCurrentTime().
  let startCtxTime = 0;
  let startOffset = 0;

  async function load(urls: StemUrls, signal?: AbortSignal): Promise<void> {
    await Promise.all(
      STEM_NAMES.map(async (name) => {
        const res = await fetch(urls[name], { signal });
        if (!res.ok) throw new Error(`stem ${name} fetch ${res.status}`);
        const ab = await res.arrayBuffer();
        // Some Safari builds reject decodeAudioData's Promise form; both
        // forms are supported, but the callback form is the lowest common
        // denominator.
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(ab, resolve, reject);
        });
        stems[name].buffer = buffer;
      })
    );
  }

  function stopSources(): void {
    for (const name of STEM_NAMES) {
      const node = stems[name];
      if (node.source) {
        try {
          node.source.stop();
        } catch {
          // Already stopped; safe to ignore.
        }
        node.source.disconnect();
        node.source = null;
      }
    }
  }

  function startSourcesAt(ctxTime: number, offset: number, rate: number): void {
    for (const name of STEM_NAMES) {
      const node = stems[name];
      const buf = node.buffer;
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(node.gain);
      // Single shared (ctxTime, offset) keeps stems sample-locked across
      // start, even if Float32 currentTime drifts microscopically between
      // createBufferSource() calls.
      src.start(ctxTime, offset);
      node.source = src;
    }
  }

  function play(offsetSeconds: number, rate?: number): void {
    if (typeof rate === "number") playbackRate = rate;
    // Resume the context if iPad suspended it on background.
    if (ctx.state === "suspended") void ctx.resume();
    stopSources();
    const t = ctx.currentTime + 0.02;
    startSourcesAt(t, offsetSeconds, playbackRate);
    startCtxTime = t;
    startOffset = offsetSeconds;
    playing = true;
  }

  function pause(): void {
    if (!playing) return;
    stopSources();
    // Freeze the reported position at what it was when we paused so
    // getCurrentTime() returns the right value after pause.
    startOffset = startOffset + (ctx.currentTime - startCtxTime) * playbackRate;
    startCtxTime = ctx.currentTime;
    playing = false;
  }

  function seek(offsetSeconds: number, rate?: number): void {
    const wasPlaying = playing;
    stopSources();
    if (wasPlaying) {
      play(offsetSeconds, rate);
    } else {
      startCtxTime = ctx.currentTime;
      startOffset = offsetSeconds;
      if (typeof rate === "number") playbackRate = rate;
    }
  }

  function setPlaybackRate(rate: number): void {
    if (rate === playbackRate) return;
    // Snapshot the current source-time so the new rate doesn't make
    // getCurrentTime() jump backwards or forwards.
    const cur = getCurrentTime();
    playbackRate = rate;
    startCtxTime = ctx.currentTime;
    startOffset = cur;
    if (playing) {
      for (const name of STEM_NAMES) {
        const src = stems[name].source;
        if (src) src.playbackRate.value = rate;
      }
    }
  }

  function setMute(stem: StemName, muted: boolean): void {
    const node = stems[stem];
    const now = ctx.currentTime;
    const param = node.gain.gain;
    // Cancel any pending ramp before scheduling a new one — otherwise
    // rapid toggles compound and we miss the target value.
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(muted ? 0 : 1, now + RAMP_SECONDS);
  }

  function getCurrentTime(): number {
    if (!playing) return startOffset;
    return startOffset + (ctx.currentTime - startCtxTime) * playbackRate;
  }

  function isPlaying(): boolean {
    return playing;
  }

  function getDuration(): number {
    let max = 0;
    for (const name of STEM_NAMES) {
      const buf = stems[name].buffer;
      if (buf && buf.duration > max) max = buf.duration;
    }
    return max;
  }

  function dispose(): void {
    stopSources();
    for (const name of STEM_NAMES) {
      const node = stems[name];
      node.gain.disconnect();
      node.buffer = null;
    }
  }

  return {
    load,
    play,
    pause,
    seek,
    setPlaybackRate,
    setMute,
    getCurrentTime,
    isPlaying,
    getDuration,
    dispose,
  };
}
