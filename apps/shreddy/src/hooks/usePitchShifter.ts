"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePitchShifterOptions {
  songId: string | null;
  audioUrl: string | null;
  pitch: number;
  tempo: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onPause: () => void;
}

export function usePitchShifter({
  songId,
  audioUrl,
  pitch,
  tempo,
  audioRef,
  onPause,
}: UsePitchShifterOptions) {
  const [processing, setProcessing] = useState(false);
  const [pitchedUrl, setPitchedUrl] = useState<string | null>(null);
  const prevPitchRef = useRef(pitch);

  // When pitch changes, pause and process
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Pause when pitch actually changes (not on initial mount)
    if (pitch !== prevPitchRef.current) {
      onPause();
      prevPitchRef.current = pitch;
    }

    if (pitch === 0) {
      // Restore original audio
      if (audioUrl && audio.src !== new URL(audioUrl, window.location.origin).href) {
        const pos = audio.currentTime;
        audio.src = audioUrl;
        audio.currentTime = pos;
      }
      audio.preservesPitch = true;
      audio.playbackRate = tempo;
      setPitchedUrl(null);
      setProcessing(false);
      return;
    }

    if (!songId) return;

    // Request server-side pitch processing
    const controller = new AbortController();
    setProcessing(true);

    fetch(`/api/songs/${songId}/pitch`, {
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
        const newUrl = `/api/media/${filename}`;
        setPitchedUrl(newUrl);
        setProcessing(false);

        // Swap the audio source
        const a = audioRef.current;
        if (a) {
          const pos = a.currentTime;
          a.src = newUrl;
          a.currentTime = pos;
          a.preservesPitch = true;
          a.playbackRate = tempo;
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setProcessing(false);
      });

    return () => { controller.abort(); };
  }, [pitch, songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update tempo on the audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = tempo;
  }, [tempo, audioRef]);

  return { processing, pitchedUrl };
}
