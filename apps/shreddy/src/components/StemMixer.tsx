"use client";

// R5 Vocal Integration — 4-stem mute mixer.
//
// Rendered only after the server has finished separating the song into
// stems (stemsState === "ready"). Until then the practice page shows a
// small "Rendering stems…" indicator in the same slot so users know it's
// coming. The pills mirror the engine's mute state; toggling a pill ramps
// the corresponding GainNode over 20ms inside StemsEngine.
//
// Layout: 4 pills inline above the unified transport bar. Each pill is
// large enough to thumb on iPhone but compact so the row fits at 390px
// without wrapping.

import { Mic, Drum, Volume2, Music } from "lucide-react";
import type { StemName } from "@/lib/stems-engine";

interface StemMixerProps {
  state: "pending" | "processing" | "ready" | "error" | "unknown";
  muted: Record<StemName, boolean>;
  onMuteToggle: (stem: StemName) => void;
}

const PILLS: { stem: StemName; label: string; Icon: typeof Mic }[] = [
  { stem: "vocals", label: "Vocals", Icon: Mic },
  { stem: "drums", label: "Drums", Icon: Drum },
  { stem: "bass", label: "Bass", Icon: Volume2 },
  { stem: "other", label: "Other", Icon: Music },
];

export function StemMixer({ state, muted, onMuteToggle }: StemMixerProps) {
  if (state === "error") {
    return (
      <div className="mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
        Stem separation failed — vocals/drums/bass mute is unavailable for this
        song.
      </div>
    );
  }

  if (state !== "ready") {
    return (
      <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
        Rendering stems… (vocals / drums / bass / other will appear here)
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center gap-1.5">
      {PILLS.map(({ stem, label, Icon }) => {
        const isMuted = muted[stem];
        return (
          <button
            key={stem}
            onClick={() => onMuteToggle(stem)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-xs font-medium transition-colors active:scale-95 border ${
              isMuted
                ? "bg-background text-muted-foreground/40 border-border line-through"
                : "bg-foreground text-background border-foreground"
            }`}
            title={
              isMuted
                ? `${label} muted — tap to unmute`
                : `${label} on — tap to mute`
            }
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
