"use client";

// One song in the library: a single thumbnail, a strip showing where each of
// its licks falls in the song, and the licks themselves as large chips. It
// replaces a grid of lick cards that all repeated the same thumbnail, so the
// lick names — what you're actually looking for — lead.

import { useRef, useState } from "react";
import { CircleNotchIcon, WarningCircleIcon } from "@phosphor-icons/react";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// A lick keeps its colour between the strip and its chip, by song order.
export const LICK_COLORS = [
  "bg-violet-500", "bg-sky-500", "bg-teal-500", "bg-amber-500", "bg-rose-500",
  "bg-pink-500", "bg-orange-500", "bg-emerald-500", "bg-indigo-500", "bg-lime-500",
];

const COLLAPSED_CHIPS = 6;

export interface SongCardLick {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

interface SongCardProps {
  song: {
    title: string;
    artist: string | null;
    thumbnailUrl: string | null;
    durationSec: number | null;
    processingStatus?: string;
  };
  /** Every lick from this song, in song order — the strip shows them all. */
  licks: SongCardLick[];
  /** Licks to show as chips; others are faded on the strip. Defaults to all. */
  visibleIds?: Set<string>;
  meta: string;
  onOpenSong: () => void;
  onOpenLick: (lick: SongCardLick) => void;
  onLickMenu: (lick: SongCardLick) => void;
}

export function SongCard({ song, licks, visibleIds, meta, onOpenSong, onOpenLick, onLickMenu }: SongCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorOf = new Map(licks.map((l, i) => [l.id, LICK_COLORS[i % LICK_COLORS.length]]));
  const chips = visibleIds ? licks.filter((l) => visibleIds.has(l.id)) : licks;
  const shown = expanded ? chips : chips.slice(0, COLLAPSED_CHIPS);
  const hidden = chips.length - shown.length;

  const status = song.processingStatus;
  const processing = status === "processing" || status === "pending";
  const failed = status === "error";
  const ready = !processing && !failed;
  // The song's own length when known; otherwise the furthest lick end, so the
  // strip still lays the licks out in order.
  const span = song.durationSec || Math.max(1, ...licks.map((l) => l.endSec));

  return (
    <div className={`flex gap-4 p-4 ${ready ? "" : "opacity-60"}`}>
      <button
        onClick={() => ready && onOpenSong()}
        className="relative w-32 md:w-44 shrink-0 self-start aspect-video rounded-xl overflow-hidden bg-muted active:scale-[0.97] transition-transform duration-300 ease-spring"
        aria-label={`Open ${song.title}`}
      >
        {song.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : null}
        {processing && (
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-white">
            <CircleNotchIcon className="size-6 animate-spin" />
          </span>
        )}
        {failed && (
          <span className="absolute inset-0 grid place-items-center bg-black/50 text-destructive">
            <WarningCircleIcon className="size-7" weight="fill" />
          </span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <button onClick={() => ready && onOpenSong()} className="block max-w-full text-left">
          <span className="text-lg font-semibold tracking-tight mr-2">{song.title}</span>
          <span className="text-sm text-muted-foreground">
            {[song.artist, processing ? "Importing…" : failed ? "Import failed" : meta].filter(Boolean).join(" · ")}
          </span>
        </button>

        {licks.length > 0 && (
          <div className="relative mt-2.5 h-1.5 rounded-full bg-muted" aria-hidden>
            {licks.map((l) => (
              <div
                key={l.id}
                className={`absolute inset-y-0 rounded-full border-x border-card ${colorOf.get(l.id)} ${
                  visibleIds && !visibleIds.has(l.id) ? "opacity-20" : ""
                }`}
                style={{
                  left: `${(l.startSec / span) * 100}%`,
                  width: `${Math.max(1, (l.durationSec / span) * 100)}%`,
                }}
              />
            ))}
          </div>
        )}

        {shown.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {shown.map((l) => (
              <LickChip
                key={l.id}
                lick={l}
                color={colorOf.get(l.id)!}
                onOpen={() => onOpenLick(l)}
                onMenu={() => onLickMenu(l)}
              />
            ))}
            {(hidden > 0 || expanded) && chips.length > COLLAPSED_CHIPS && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="h-11 px-4 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                {expanded ? "Show less" : `+${hidden} more`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tap plays the lick; press and hold (or right-click) opens its actions.
 * Holding is the iPad's own gesture for "more about this thing".
 */
function LickChip({
  lick,
  color,
  onOpen,
  onMenu,
}: {
  lick: SongCardLick;
  color: string;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return (
    <button
      onPointerDown={(e) => {
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          held.current = true;
          timer.current = null;
          onMenu();
        }, 500);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={() => {
        if (!held.current) onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        held.current = true;
        onMenu();
      }}
      className="h-11 pl-3.5 pr-4 rounded-xl bg-muted hover:bg-accent flex items-center gap-2 text-sm font-semibold select-none active:scale-95 transition-all duration-200 ease-spring"
      style={{ WebkitTouchCallout: "none" }}
    >
      <span className={`size-2 rounded-full shrink-0 ${color}`} />
      <span className="truncate max-w-[14rem]">{lick.name}</span>
      <span className="font-mono text-xs text-muted-foreground">{formatTime(lick.durationSec)}</span>
    </button>
  );
}
