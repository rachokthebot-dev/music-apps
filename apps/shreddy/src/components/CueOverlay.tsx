"use client";

// R3 cue prompt strip. Shows a rotating mental-rehearsal cue while Silent is
// active. Rotates every ~8 bars of audio time so it matches the song's musical
// pace, not wall-clock seconds. Uses currentTime + bpm + beatsPerBar passed in
// from the practice page (no internal timers — render-only).
//
// Promoted from apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx.

const CUE_PROMPTS = [
  "Hear the chord, not your fingers.",
  "Feel the downbeat.",
  "See the shape on the fretboard.",
  "Quiet the hands.",
  "Notice the breath between phrases.",
  "Trust the next note.",
];

const BARS_PER_CUE = 8;

interface CueOverlayProps {
  currentTime: number;
  bpm: number | null;
  beatsPerBar: number;
}

export function CueOverlay({ currentTime, bpm, beatsPerBar }: CueOverlayProps) {
  // Without a BPM we can't bar-anchor — fall back to a static prompt.
  if (!bpm || bpm <= 0) {
    return (
      <div className="mb-3 text-center min-h-[2.5rem] flex items-center justify-center">
        <p className="text-sm italic text-foreground/70">
          Put the instrument down. Close your eyes.
        </p>
      </div>
    );
  }

  const secondsPerBar = (60 / bpm) * beatsPerBar;
  const cueIndex =
    Math.floor(currentTime / (secondsPerBar * BARS_PER_CUE)) % CUE_PROMPTS.length;

  return (
    <div className="mb-3 text-center min-h-[2.5rem] flex items-center justify-center">
      <p className="text-sm italic text-foreground/70 transition-opacity duration-300">
        {CUE_PROMPTS[cueIndex]}
      </p>
    </div>
  );
}
