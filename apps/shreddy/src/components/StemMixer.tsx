"use client";

// R5 Vocal Integration — stems tray.
//
// A transport button that opens a bottom tray with one large tile per stem.
// The tray replaces a small checkbox dropdown: on an iPad on a music stand a
// thumb-sized mute and solo per stem is what you can actually hit mid-song.
// The button label still shows live status ("Stems" when all on, "Vocals
// muted" / "2 muted" otherwise) so you know what's audible without opening it.
//
// Stems are eagerly pre-decoded by useStemsEngine, so a mute applies via the
// engine's 20ms gain ramp — no perceptible delay.

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  CircleNotchIcon,
  HandsClappingIcon,
  MicrophoneIcon,
  MusicNotesIcon,
  SlidersHorizontalIcon,
  SpeakerHighIcon,
  XIcon,
} from "@phosphor-icons/react";
import { STEM_NAMES, type StemName } from "@/lib/stems-engine";

interface StemMixerProps {
  state: "pending" | "processing" | "ready" | "error" | "unknown";
  muted: Record<StemName, boolean>;
  onMuteToggle: (stem: StemName) => void | Promise<void>;
}

const PILL_META: Record<StemName, { label: string; Icon: typeof MicrophoneIcon }> = {
  vocals: { label: "Vocals", Icon: MicrophoneIcon },
  drums: { label: "Drums", Icon: HandsClappingIcon },
  bass: { label: "Bass", Icon: SpeakerHighIcon },
  other: { label: "Other", Icon: MusicNotesIcon },
};

function statusLabel(state: StemMixerProps["state"], muted: Record<StemName, boolean>): string {
  if (state === "error") return "Stems unavailable";
  if (state !== "ready") return "Stems…";
  const mutedList = STEM_NAMES.filter((s) => muted[s]);
  if (mutedList.length === 0) return "Stems";
  if (mutedList.length === 1) return `${PILL_META[mutedList[0]].label} muted`;
  return `${mutedList.length} muted`;
}

const noopSubscribe = () => () => {};

export function StemMixer({ state, muted, onMuteToggle }: StemMixerProps) {
  const [open, setOpen] = useState(false);
  // The tray is portalled to <body>: the transport island it opens from has a
  // backdrop blur, which would otherwise become the tray's containing block.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isReady = state === "ready";
  const isError = state === "error";
  const label = statusLabel(state, muted);
  const anyMuted = STEM_NAMES.some((s) => muted[s]);
  const soloed = STEM_NAMES.filter((s) => !muted[s]);

  // Solo = everything else muted. Soloing the stem that is already the only
  // one playing un-solos, bringing the full mix back. Toggles run one after
  // another because the first may have to activate the engine.
  async function solo(stem: StemName) {
    const undo = soloed.length === 1 && soloed[0] === stem;
    for (const s of STEM_NAMES) {
      const want = undo ? false : s !== stem;
      if (muted[s] !== want) await onMuteToggle(s);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isError}
        className={`h-12 px-4 rounded-full text-base font-semibold flex items-center gap-2 transition-all duration-200 ease-spring active:scale-95 ${
          anyMuted && isReady ? "bg-loop/15 text-loop" : "text-foreground hover:bg-foreground/5"
        } disabled:opacity-50`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={isError ? "Stem separation failed" : "Stems"}
      >
        {!isReady && !isError ? <CircleNotchIcon className="size-4 animate-spin" /> : <SlidersHorizontalIcon className="size-4" />}
        <span className="hidden sm:inline">{label}</span>
      </button>

      {mounted && createPortal(<>
      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-500 ease-spring ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Stems"
        className={`fixed bottom-0 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 rounded-t-[2rem] border border-b-0 border-border bg-popover px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-700 ease-spring ${
          open ? "translate-y-0" : "translate-y-[110%]"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-muted-foreground/40" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stems</h2>
          <button
            onClick={() => setOpen(false)}
            className="size-10 grid place-items-center rounded-full text-muted-foreground hover:bg-muted active:scale-95"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {!isReady && (
          <p className="mt-1 text-sm text-muted-foreground">
            {isError ? "Stem separation failed for this song." : "Separating stems. They'll appear here when ready."}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STEM_NAMES.map((stem) => {
            const { label, Icon } = PILL_META[stem];
            const isMuted = muted[stem];
            const isSolo = soloed.length === 1 && soloed[0] === stem;
            return (
              <div
                key={stem}
                className={`rounded-3xl border p-4 flex flex-col items-center gap-3 transition-colors ${
                  isMuted ? "border-border bg-card/50" : "border-border bg-card"
                }`}
              >
                <Icon className={`size-8 ${isMuted ? "text-muted-foreground/50" : "text-foreground"}`} />
                <span className={`text-base font-semibold ${isMuted ? "text-muted-foreground line-through" : ""}`}>
                  {label}
                </span>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => solo(stem)}
                    disabled={!isReady}
                    aria-pressed={isSolo}
                    className={`flex-1 h-11 rounded-xl text-sm font-semibold border transition-all active:scale-95 disabled:opacity-40 ${
                      isSolo ? "bg-loop text-loop-foreground border-loop" : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    Solo
                  </button>
                  <button
                    onClick={() => onMuteToggle(stem)}
                    disabled={!isReady}
                    aria-pressed={isMuted}
                    className={`flex-1 h-11 rounded-xl text-sm font-semibold border transition-all active:scale-95 disabled:opacity-40 ${
                      isMuted ? "bg-destructive text-white border-destructive" : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    Mute
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>, document.body)}
    </>
  );
}
