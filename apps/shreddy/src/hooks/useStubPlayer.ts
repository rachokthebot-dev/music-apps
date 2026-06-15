"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StubSong } from "@/app/sandbox/mock-data";

/**
 * Sandbox-only audio player hook.
 *
 * Encapsulates the iPad-Safari traps that every sandbox mockup hits:
 *   - AudioContext is not used here (mockups don't synthesize). The `<audio>`
 *     element is created lazily on the first `play()` call so its initial
 *     `play()` is a direct gesture handler — Safari requires that.
 *   - preservesPitch is re-set after every `audio.src` swap (Safari resets
 *     it on src change). The reset happens AFTER `loadedmetadata` fires, not
 *     before — Safari is order-sensitive here.
 *   - Monotonic requestId on src swaps: rapid `swapSrc()` calls don't let
 *     stale responses win. If you swap to URL A then URL B before A has
 *     finished loading, the final audio is B (not A landing late).
 *   - On unmount: pause + audio.src = "" releases the decoded buffer.
 *     Without this, iPad accumulates buffers across navigations and crashes
 *     after ~5 pages.
 */
export interface UseStubPlayerApi {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playing: boolean;
  currentTime: number;
  duration: number;
  /** Plays the current src. Lazily creates the <audio> element so the first
   *  call is a direct gesture and Safari un-gates audio. */
  play: () => Promise<void>;
  pause: () => void;
  /** Swap to a new audio URL while preserving currentTime. Internally
   *  serialises with a monotonic requestId — concurrent swaps land in
   *  call-order. */
  swapSrc: (url: string) => Promise<void>;
}

export function useStubPlayer(stub: StubSong): UseStubPlayerApi {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(stub.durationSec);

  // Lazy-create the <audio> element on first interaction so play() happens
  // inside the user gesture task.
  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const a = new Audio(stub.audioUrl);
    a.preload = "metadata";
    a.preservesPitch = true;
    a.addEventListener("play", () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("ended", () => setPlaying(false));
    a.addEventListener("timeupdate", () => setCurrentTime(a.currentTime));
    a.addEventListener("loadedmetadata", () => setDuration(a.duration));
    audioRef.current = a;
    return a;
  }, [stub.audioUrl]);

  const play = useCallback(async () => {
    const a = ensureAudio();
    await a.play();
  }, [ensureAudio]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const swapSrc = useCallback(
    async (url: string) => {
      const a = ensureAudio();
      const myId = ++requestIdRef.current;
      const wasPlaying = !a.paused;
      const savedTime = a.currentTime;
      a.pause();
      a.src = url;
      // Wait for metadata before applying currentTime/preservesPitch.
      await new Promise<void>((resolve, reject) => {
        const onMeta = () => {
          a.removeEventListener("loadedmetadata", onMeta);
          a.removeEventListener("error", onErr);
          resolve();
        };
        const onErr = () => {
          a.removeEventListener("loadedmetadata", onMeta);
          a.removeEventListener("error", onErr);
          reject(new Error(`failed to load ${url}`));
        };
        a.addEventListener("loadedmetadata", onMeta);
        a.addEventListener("error", onErr);
      });
      if (myId !== requestIdRef.current) {
        // A newer swap preempted us — drop this result.
        return;
      }
      a.preservesPitch = true;
      a.currentTime = Math.min(savedTime, a.duration);
      if (wasPlaying) await a.play();
    },
    [ensureAudio]
  );

  // Unmount cleanup. Critical on iPad — without `audio.src = ""` the decoded
  // buffer leaks and ~5 page navigations later you see "decode failed".
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (!a) return;
      a.pause();
      a.src = "";
      audioRef.current = null;
    };
  }, []);

  return { audioRef, playing, currentTime, duration, play, pause, swapSrc };
}
