"use client";

// R5 Vocal Integration — compact stems dropdown.
//
// Replaces the 4-pill row with a single transport-bar button + checkbox
// popover. Button label shows live status ("Stems" when all on,
// "Vocals muted" / "2 muted" otherwise) so the user knows what's audible
// without opening the menu.
//
// Stems are eagerly pre-decoded by useStemsEngine, so toggling a checkbox
// applies the mute via the engine's 20ms gain ramp — no perceptible delay.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sliders, Mic, Drum, Volume2, Music, Loader2 } from "lucide-react";
import { STEM_NAMES, type StemName } from "@/lib/stems-engine";

interface StemMixerProps {
  state: "pending" | "processing" | "ready" | "error" | "unknown";
  muted: Record<StemName, boolean>;
  onMuteToggle: (stem: StemName) => void;
}

const PILL_META: Record<StemName, { label: string; Icon: typeof Mic }> = {
  vocals: { label: "Vocals", Icon: Mic },
  drums: { label: "Drums", Icon: Drum },
  bass: { label: "Bass", Icon: Volume2 },
  other: { label: "Other", Icon: Music },
};

function statusLabel(state: StemMixerProps["state"], muted: Record<StemName, boolean>): string {
  if (state === "error") return "Stems unavailable";
  if (state !== "ready") return "Stems…";
  const mutedList = STEM_NAMES.filter((s) => muted[s]);
  if (mutedList.length === 0) return "Stems";
  if (mutedList.length === 1) return `${PILL_META[mutedList[0]].label} muted`;
  return `${mutedList.length} muted`;
}

export function StemMixer({ state, muted, onMuteToggle }: StemMixerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isReady = state === "ready";
  const isError = state === "error";
  const label = statusLabel(state, muted);
  const anyMuted = STEM_NAMES.some((s) => muted[s]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isError}
        className={`h-10 sm:h-11 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors active:scale-95 ${
          anyMuted && isReady
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground hover:bg-accent"
        } disabled:opacity-50`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={isError ? "Stem separation failed" : "Stems"}
      >
        {!isReady && !isError ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sliders className="size-3.5" />
        )}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 z-50 bg-card border border-border rounded-xl shadow-lg p-2 min-w-[14rem]"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
            Stem mix
          </div>
          {STEM_NAMES.map((stem) => {
            const { label, Icon } = PILL_META[stem];
            const audible = !muted[stem];
            return (
              <button
                key={stem}
                role="menuitemcheckbox"
                aria-checked={audible}
                onClick={() => onMuteToggle(stem)}
                disabled={!isReady}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-40"
              >
                {/* Checkbox visual */}
                <span
                  className={`size-5 rounded border flex items-center justify-center shrink-0 ${
                    audible
                      ? "bg-primary border-primary"
                      : "bg-background border-border"
                  }`}
                  aria-hidden
                >
                  {audible && (
                    <svg viewBox="0 0 20 20" className="size-3.5 text-primary-foreground" fill="currentColor">
                      <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2L14.6 4l1.4 1.4z" />
                    </svg>
                  )}
                </span>
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className={`text-sm font-medium flex-1 text-left ${audible ? "" : "line-through text-muted-foreground"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
