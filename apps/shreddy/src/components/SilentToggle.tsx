"use client";

// R3 Mental Rehearsal — "Silent" toggle for the practice header.
// Promoted from apps/shreddy/src/app/sandbox/mental-rehearsal/page.tsx.
// When ON: audio is muted but currentTime keeps advancing, the metronome runs,
// and a rotating cue prompt is shown via <CueOverlay>. The rotating cue lives
// in CueOverlay so this component is just the pill button (no state coupling).

import { EyeSlashIcon } from "@phosphor-icons/react";

interface SilentToggleProps {
  silent: boolean;
  onToggle: () => void;
}

export function SilentToggle({ silent, onToggle }: SilentToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`h-11 px-4 rounded-full border text-sm font-semibold transition-all active:scale-95 flex items-center gap-2 ${
        silent
          ? "bg-foreground text-background border-foreground"
          : "bg-card border-border text-foreground hover:bg-muted"
      }`}
      title={
        silent
          ? "Silent practice on — audio muted, metronome only"
          : "Mute audio and rehearse mentally (R3)"
      }
    >
      <EyeSlashIcon className="size-4" />
      <span className="hidden md:inline">Silent</span>
    </button>
  );
}
