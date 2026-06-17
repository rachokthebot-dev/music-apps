"use client";

// R1 Ultra-slow tempo client hook.
//
// HTMLAudioElement.playbackRate silently clamps at 0.5 on iPad Safari, so any
// tempo below that has to be rendered server-side. This hook handles that
// path: when tempo < 0.5 (and pitch == 0 — see "interaction with pitch"
// below), it asks /api/songs/[id]/tempo for a pitch-preserving stretched
// render and swaps the <audio> src to /api/media/<filename>. Position and
// play state are preserved across the swap.
//
// Interaction with usePitchShifter:
//   * Both hooks may want to mutate audio.src. Pitch wins — if pitch != 0 the
//     pitch hook handles src and sets playbackRate = tempo (which iPad will
//     clamp to 0.5). Combining ultra-slow with transposition isn't supported
//     on iPad in v1; that's documented in the v1 plan and acceptable scope.
//   * When tempo >= 0.5, this hook stays out of the way: tempo is applied as
//     playbackRate by either the pitch hook (pitch != 0) or by a small
//     effect here (pitch == 0).

import { useEffect, useRef, useState } from "react";

interface UseTempoStretchOptions {
  songId: string | null;
  audioUrl: string | null;
  tempo: number;
  pitch: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onPause: () => void;
}

const ULTRA_SLOW_THRESHOLD = 0.5;

export function useTempoStretch({
  songId,
  audioUrl,
  tempo,
  pitch,
  audioRef,
  onPause,
}: UseTempoStretchOptions) {
  const [processing, setProcessing] = useState(false);
  // Monotonic request id so a quickly-clicked sequence of tempo values
  // (0.1 → 0.3 → 0.2) lands on the final selection, not whichever render
  // happens to finish last.
  const requestIdRef = useRef(0);
  const prevTempoRef = useRef(tempo);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const isUltraSlow = tempo < ULTRA_SLOW_THRESHOLD;
    const tempoChanged = tempo !== prevTempoRef.current;
    prevTempoRef.current = tempo;

    // Defer to the pitch hook when transposing. iPad will clamp the resulting
    // playbackRate; that limitation is called out in the v1 plan.
    if (pitch !== 0) {
      return;
    }

    if (!isUltraSlow) {
      // Normal tempo — restore the original audio if we previously swapped to
      // a tempo-stretched render, then apply tempo as playbackRate.
      if (audioUrl) {
        const originalHref = new URL(audioUrl, window.location.origin).href;
        if (audio.src !== originalHref) {
          if (tempoChanged) onPause();
          const pos = audio.currentTime;
          audio.src = audioUrl;
          audio.currentTime = pos;
        }
      }
      audio.preservesPitch = true;
      audio.playbackRate = tempo;
      setProcessing(false);
      return;
    }

    if (!songId) return;

    if (tempoChanged) onPause();

    const myId = ++requestIdRef.current;
    const controller = new AbortController();
    setProcessing(true);

    fetch(`/api/songs/${songId}/tempo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ multiplier: tempo }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Tempo render failed");
        return res.json();
      })
      .then(({ filename }: { filename: string }) => {
        // A newer tempo selection has already kicked off — drop this result.
        if (myId !== requestIdRef.current) return;
        const newUrl = `/api/media/${filename}`;
        const a = audioRef.current;
        if (!a) return;
        const pos = a.currentTime;
        a.src = newUrl;
        a.currentTime = pos;
        // The rendered file is already at the target tempo, so play it at 1×.
        a.playbackRate = 1.0;
        a.preservesPitch = true;
        setProcessing(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setProcessing(false);
      });

    return () => {
      controller.abort();
    };
    // We deliberately depend only on the values that drive a render — adding
    // audioRef/audioUrl/onPause causes spurious re-renders on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo, pitch, songId]);

  return { processing };
}
