"use client";

// R3 Mental Rehearsal — "Silent" toggle for the practice header.
// Promoted from apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx.
// When ON: audio is muted but currentTime keeps advancing, the metronome runs,
// and a rotating cue prompt is shown via <CueOverlay>. The rotating cue lives
// in CueOverlay so this component is just the pill button (no state coupling).

import { EyeOff } from "lucide-react";

interface SilentToggleProps {
  silent: boolean;
  onToggle: () => void;
}

export function SilentToggle({ silent, onToggle }: SilentToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`text-[11px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
        silent
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:bg-accent"
      }`}
      title={
        silent
          ? "Silent practice on — audio muted, metronome only"
          : "Mute audio and rehearse mentally (R3)"
      }
    >
      <EyeOff className="size-3" />
      Silent
    </button>
  );
}
