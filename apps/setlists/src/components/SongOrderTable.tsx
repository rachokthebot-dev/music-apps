"use client";

import { useRef, useState } from "react";

/**
 * The setlist, reorderable by dragging.
 *
 * Uses pointer events rather than HTML5 drag-and-drop, which never fires on
 * iOS Safari — and the iPad is where a setlist actually gets rearranged.
 */

export interface SongRow {
  id: string;
  title: string;
  artist: string;
  shreddySongId: string | null;
  lickbankSourceId: string | null;
  presetChoice: string;
  presetName: string | null;
  presetPath: string | null;
  /**
   * What SoundPath finds in this preset, or null when it hasn't seen the gig.
   *
   * Not counted here any more. This app and SoundPath read snapshots by
   * different rules — a preset whose author named one slot and left the rest
   * as copies is one snapshot to a simple parse and two to SoundPath, which
   * falls back to distinct tones. The count is a promise about how much there
   * is to record, so it comes from whatever does the recording.
   */
  snapshots: { measured: number; total: number } | null;
}

export function SongOrderTable({
  setlistId,
  songs: initial,
  shreddyBase,
  lickbankBase,
}: {
  setlistId: string;
  songs: SongRow[];
  shreddyBase: string;
  lickbankBase: string;
}) {
  const [songs, setSongs] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const rowsRef = useRef<HTMLTableSectionElement>(null);
  const dirty = useRef(false);

  const indexFromPoint = (clientY: number): number => {
    const rows = rowsRef.current?.querySelectorAll("tr");
    if (!rows) return -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return rows.length - 1;
  };

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const from = songs.findIndex((s) => s.id === dragId);
    const to = indexFromPoint(e.clientY);
    if (to === -1 || to === from) return;
    setSongs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    dirty.current = true;
  };

  const onPointerUp = async () => {
    if (!dragId) return;
    setDragId(null);
    if (!dirty.current) return;
    dirty.current = false;
    await fetch(`/setlists/api/setlists/${setlistId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songIds: songs.map((s) => s.id) }),
    }).catch(() => {});
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted">
            <th className="text-left px-4 py-2">#</th>
            <th className="text-left">Song</th>
            <th className="text-left">Shreddy</th>
            <th className="text-left">LickBank</th>
            <th className="text-left">Helix preset</th>
          </tr>
        </thead>
        <tbody ref={rowsRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          {songs.map((s, i) => (
            <tr
              key={s.id}
              className={`border-t border-border ${
                dragId === s.id ? "bg-violet-500/10" : ""
              }`}
            >
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-1.5">
                  <span
                    onPointerDown={(e) => onPointerDown(e, s.id)}
                    title="Drag to reorder — this is the .hls slot order"
                    className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground select-none px-0.5"
                    style={{ touchAction: "none" }}
                  >
                    ⠿
                  </span>
                  <span className="text-muted-foreground">{i + 1}</span>
                </span>
              </td>
              <td>
                <div className="font-semibold">{s.title}</div>
                <div className="text-[11px] text-muted-foreground">{s.artist}</div>
              </td>
              <td>
                {s.shreddySongId ? (
                  <a
                    className="text-[10.5px] font-bold px-2 py-1 rounded-md bg-blue-500/10 text-blue-700"
                    href={`${shreddyBase}/songs/${s.shreddySongId}`}
                  >
                    practice ↗
                  </a>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
              <td>
                {s.lickbankSourceId ? (
                  <a
                    className="text-[10.5px] font-bold px-2 py-1 rounded-md bg-orange-500/10 text-orange-700"
                    href={`${lickbankBase}/sources/${s.lickbankSourceId}`}
                  >
                    practice ↗
                  </a>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
              <td>
                {s.presetChoice === "none" ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  <>
                    {/* The .hlx download lived here. It handed over the file
                        exactly as it came from Line 6, with none of the
                        levelling that makes it usable — everything for the
                        pedal comes from SoundPath now. */}
                    <div className="font-medium">{s.presetName ?? "preset"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.snapshots === null ? (
                        <span className="text-muted-foreground/60">
                          {s.presetPath ? "not in SoundPath yet" : "not downloaded"}
                        </span>
                      ) : s.snapshots.total === 0 ? (
                        "no snapshots"
                      ) : (
                        <>
                          {s.snapshots.total} snapshot{s.snapshots.total > 1 ? "s" : ""} ·{" "}
                          <span
                            className={
                              s.snapshots.measured === s.snapshots.total
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }
                          >
                            {s.snapshots.measured}/{s.snapshots.total} measured
                          </span>
                        </>
                      )}
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
