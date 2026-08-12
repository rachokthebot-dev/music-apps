"use client";

/**
 * Record one preset's snapshots straight off the Helix, in place in the gig.
 *
 * One take per snapshot rather than one file with every chord in it. The
 * upload path has to find N chords in a single recording and refuses the whole
 * preset when it finds N-1, which on a quiet patch happens often. Here each
 * snapshot is its own take, measured as you go, and a bad one costs one retake.
 *
 * Measuring happens here, in the browser, with the same BS.1770 code the
 * server runs on uploads — the reading is a number by the time it's stored.
 * The audio goes up separately, to the take archive, which nothing in the app
 * reads back: it exists so the measurement window can be tuned against real
 * takes rather than remembered ones. See takeUpload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MEASURE_SEC,
  makeTake,
  readingOf,
  TakeView,
  type Take,
} from "@/components/TakeView";
import { proposeChordRegion } from "@music-apps/gain-estimator/src/loudness/analyze";
import { archiveTake, type ArchivedTake } from "@/lib/takeUpload";
import { MAX_TAKE_SEC, type useHelixCapture } from "@/lib/useHelixCapture";

type Capture = ReturnType<typeof useHelixCapture>;

/** Relative for anything recent, absolute once it's old enough to matter. */
export function when(iso: string | null): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 60 * 12) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export interface SnapshotRow {
  index: number;
  name: string;
  role: string;
  measuredLufs: number | null;
  measuredAt: string | null;
}

export default function RecordPreset({
  cap,
  measureUrl,
  source,
  title,
  subtitle,
  snapshots,
  onClose,
  onStored,
}: {
  /** Owned by the page, so the input survives closing one preset and opening the next. */
  cap: Capture;
  /**
   * Where a reading goes — a gig's slot endpoint or the preset leveller's, id
   * included. Both accept the same PATCH, because both run the same action.
   */
  measureUrl: string;
  /** Which flow this is, so an archived take says where it came from. */
  source: "setlist" | "preset";
  title: string;
  subtitle: string;
  snapshots: SnapshotRow[];
  onClose: () => void;
  onStored: () => void;
}) {
  const [takes, setTakes] = useState<Record<number, Take>>({});
  const [active, setActive] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<number, number>>({});
  const debounce = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  /** The archived copy of each snapshot's current take, for window tuning. */
  const archived = useRef<Record<number, ArchivedTake>>({});

  const save = useCallback(
    async (snapshotIndex: number, take: Take) => {
      setSaving(snapshotIndex);
      try {
        const { lufs, peakDbfs } = readingOf(take);
        const r = await fetch(measureUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // The peak goes with the reading so the server can refuse a clipped
          // take, the same way the .wav upload does. A red note on the
          // waveform is too easy to miss when stopping auto-saves.
          body: JSON.stringify({ snapshotIndex, lufs, peakDbfs }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error ?? "could not store that reading");
        setSaved((s) => ({ ...s, [snapshotIndex]: lufs }));
        onStored();
      } catch (e) {
        cap.setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(null);
      }
    },
    [cap, measureUrl, onStored]
  );

  /** Stopping stores the reading. Re-record replaces it; nothing to confirm. */
  const finish = useCallback(
    (snapshotIndex: number) => {
      const got = cap.stop();
      setActive(null);
      if (!got) return;
      const take = makeTake(got.channels, got.sampleRate);
      setTakes((prev) => ({ ...prev, [snapshotIndex]: take }));
      save(snapshotIndex, take);

      // Keep the audio. The reading is one number out of a take the tab is
      // about to forget, and the window that produced it can only be judged
      // against the recording it was drawn on.
      const row = snapshots.find((s) => s.index === snapshotIndex);
      archived.current[snapshotIndex] = archiveTake(
        {
          source,
          context: {
            presetName: title,
            snapshotIndex,
            snapshotName: row?.name,
            role: row?.role,
          },
          audio: {
            sampleRate: got.sampleRate,
            channels: got.channels.length,
            durationSec: Number(take.durationSec.toFixed(3)),
          },
          input: cap.applied ? { ...cap.applied } : undefined,
          measureSec: DEFAULT_MEASURE_SEC,
          proposed: { startSec: take.startSec, endSec: take.endSec, auto: true },
          region: { startSec: take.startSec, endSec: take.endSec, auto: true },
          reading: readingOf(take),
        },
        got.channels,
        got.sampleRate
      );
    },
    [cap, save, snapshots, source, title]
  );

  /**
   * Dragging a region changes the reading too, so it saves as well — after a
   * pause, since the handle fires on every pointer move and each one would
   * otherwise be its own request.
   */
  const editRegion = useCallback(
    (snapshotIndex: number, startSec: number, endSec: number, auto = false) => {
      setTakes((prev) => {
        const t = prev[snapshotIndex];
        if (!t) return prev;
        const next = { ...t, startSec, endSec, auto };
        clearTimeout(debounce.current[snapshotIndex]);
        debounce.current[snapshotIndex] = setTimeout(() => save(snapshotIndex, next), 700);
        // Where you put the window is the ground truth the proposal is tuned
        // against, so a correction is worth more to the archive than the take.
        archived.current[snapshotIndex]?.update(
          { startSec, endSec, auto },
          readingOf(next)
        );
        return { ...prev, [snapshotIndex]: next };
      });
    },
    [save]
  );

  useEffect(() => {
    const timers = debounce.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const meterDb = cap.meter > 0 ? 20 * Math.log10(cap.meter) : -Infinity;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl my-8">
        <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border px-4 py-3 rounded-t-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold truncate">{title}</h2>
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-[12px] px-3 py-1.5 rounded-md border border-border hover:bg-secondary shrink-0"
            >
              Done
            </button>
          </div>

          {cap.applied ? (
            <div className="flex items-center gap-3 mt-2.5">
              <span
                className="text-[10.5px] text-muted-foreground truncate max-w-32"
                title={cap.applied.label}
              >
                {cap.applied.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    meterDb > -0.5 ? "bg-destructive" : meterDb > -6 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, ((meterDb + 60) / 60) * 100))}%` }}
                />
              </div>
              <span className="text-[10.5px] tabular-nums w-16 text-right">
                {meterDb === -Infinity ? "—" : `${meterDb.toFixed(1)} dB`}
              </span>
              {cap.applied.channelCount < 2 && (
                <span
                  className="text-[10.5px] text-amber-600 dark:text-amber-400 font-semibold"
                  title="A mono downmix loses 3 dB on a dry patch and 6 dB on a wide one, so the error rides on how much stereo each snapshot has and doesn't cancel between them."
                >
                  mono ⚠
                </span>
              )}
            </div>
          ) : (
            <p className="mt-2.5 text-[11.5px] text-amber-600 dark:text-amber-400">
              No input connected — use <b>Connect Helix</b> at the top of the page. It stays
              connected while you work.
            </p>
          )}
        </header>

        {cap.error && (
          <p className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {cap.error}
          </p>
        )}

        <div className="p-4 flex flex-col gap-3">
          <p className="text-[11.5px] text-muted-foreground">
            Wait a beat, play the chord, let it ring out, then stop. Keep the same chord and the
            same attack across every snapshot — the reading is of what you played through the
            patch, not of the patch alone.
          </p>

          {snapshots.map((s) => {
            const take = takes[s.index];
            const isRec = active === s.index;
            const stored = saved[s.index] ?? s.measuredLufs;
            return (
              <div key={s.index} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.role}
                  </span>
                  <button
                    onClick={() => {
                      if (isRec) return finish(s.index);
                      setActive(s.index);
                      cap.start();
                    }}
                    disabled={!cap.applied || (active !== null && !isRec)}
                    className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-md border disabled:opacity-40 ${
                      isRec
                        ? "border-destructive/50 bg-destructive/10 text-destructive"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {isRec
                      ? `Stop · ${cap.elapsed.toFixed(1)}s`
                      : take
                        ? "Re-record"
                        : "Record"}
                  </button>
                  {isRec && cap.elapsed >= MAX_TAKE_SEC && (
                    <span className="text-[11px] text-amber-600">at the {MAX_TAKE_SEC}s limit</span>
                  )}
                  <span className="ml-auto flex items-center gap-3">
                    {saving === s.index && (
                      <span className="text-[11px] text-muted-foreground">saving…</span>
                    )}
                    {stored !== null && stored !== undefined && (
                      <span
                        className="text-[11px] text-muted-foreground tabular-nums"
                        title={when(saved[s.index] !== undefined ? null : s.measuredAt)}
                      >
                        {saved[s.index] !== undefined ? "saved" : "stored"} {stored.toFixed(2)}
                      </span>
                    )}
                    {take && (
                      <span className="text-[13px] font-semibold tabular-nums">
                        {readingOf(take).lufs.toFixed(2)} LUFS
                      </span>
                    )}
                  </span>
                </div>

                {!take && s.measuredAt && (
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    last recorded {when(s.measuredAt)}
                  </p>
                )}

                {take && (
                  <TakeView
                    take={take}
                    onRegion={(a, b) => editRegion(s.index, a, b, false)}
                    onReAuto={() => {
                      const t = takes[s.index];
                      const r = proposeChordRegion(t.channels, t.sampleRate);
                      editRegion(s.index, r.startSec, r.endSec, true);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
