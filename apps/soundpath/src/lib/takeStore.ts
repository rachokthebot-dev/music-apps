/**
 * Recorded takes kept on disk, for tuning the measurement window.
 *
 *   takes/<id>.wav   — the raw capture, float32, exactly as it was measured
 *   takes/<id>.json  — what the window did with it
 *
 * The point is the sidecar, not the audio: it stores the region
 * proposeChordRegion picked *and* the region you dragged it to, so a corpus of
 * takes is also a corpus of corrections. Re-running a candidate window over the
 * .wav files and comparing against the hand-adjusted ones is the only way to
 * tell an improvement from a preference, and it can't be done after the fact —
 * the tab throws the audio away when you close it.
 *
 * Debug material, not a feature: nothing reads these back into the app. Set
 * SOUNDPATH_SAVE_TAKES=0 to stop writing them.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { safeId } from "./levelDoc";
import { PRESET_DIR } from "./masterStore";

export const TAKES_DIR = join(PRESET_DIR, "takes");

/**
 * How many takes to keep. A take is ~2 MB and a full levelling pass is dozens
 * of them, so without a cap this quietly fills the presets folder — and the
 * oldest takes are the least useful, since they were measured by a window two
 * revisions ago.
 */
const KEEP = 300;

export function takesEnabled(): boolean {
  return process.env.SOUNDPATH_SAVE_TAKES?.trim() !== "0";
}

export interface TakeRegion {
  startSec: number;
  endSec: number;
  /** False once a handle has been dragged — the proposal no longer owns it. */
  auto: boolean;
}

export interface TakeReading {
  lufs: number;
  peakDbfs: number;
  clipped: boolean;
}

export interface TakeMeta {
  id: string;
  recordedAt: string;
  /** Which flow recorded it: a gig, a single preset, or the /measure bench. */
  source: "setlist" | "preset" | "bench";
  context: {
    /** Absent on the bench, which records rows rather than a named preset. */
    presetName?: string;
    snapshotIndex: number;
    snapshotName?: string;
    role?: string;
  };
  audio: { sampleRate: number; channels: number; durationSec: number };
  /** getSettings() off the input track — an AGC flag explains a bad reading. */
  input?: Record<string, unknown>;
  /** The cap the proposal was made under, since it bounds the window. */
  measureSec: number;
  /** What proposeChordRegion said at record time, kept even after a correction. */
  proposed: TakeRegion;
  /** The window in force now, and what it measures. */
  region: TakeRegion;
  reading: TakeReading;
}

const metaPath = (id: string) => join(TAKES_DIR, `${safeId(id)}.json`);
const wavPath = (id: string) => join(TAKES_DIR, `${safeId(id)}.wav`);

/** Filesystem-safe, sortable, and readable at a glance in a directory listing. */
export function takeId(meta: {
  source: string;
  presetName?: string;
  snapshotIndex: number;
}): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = (meta.presetName ?? "").trim().replace(/[^\w-]+/g, "_").slice(0, 24);
  return safeId(
    [stamp, meta.source, name, `s${meta.snapshotIndex}`].filter(Boolean).join("-")
  );
}

export function saveTake(meta: TakeMeta, wav: Buffer): void {
  mkdirSync(TAKES_DIR, { recursive: true });
  writeFileSync(wavPath(meta.id), wav);
  writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
  prune();
}

/**
 * Record a corrected window over a take already saved.
 *
 * Called while a region handle is being dragged, so a missing take is normal —
 * the take may still be uploading, or the archive may be off — and says so
 * rather than failing.
 */
export function updateTake(
  id: string,
  region: TakeRegion,
  reading: TakeReading,
  /** The cap now in force, when the window was re-proposed under a different one. */
  measureSec?: number
): TakeMeta | null {
  let meta: TakeMeta;
  try {
    meta = JSON.parse(readFileSync(metaPath(id), "utf-8")) as TakeMeta;
  } catch {
    return null;
  }
  const next: TakeMeta = {
    ...meta,
    region,
    reading,
    measureSec: Number.isFinite(measureSec) ? measureSec! : meta.measureSec,
  };
  writeFileSync(metaPath(id), JSON.stringify(next, null, 2));
  return next;
}

/** Drop the oldest takes past KEEP. Ids start with a timestamp, so name order is age order. */
function prune(): void {
  if (!existsSync(TAKES_DIR)) return;
  const ids = readdirSync(TAKES_DIR)
    .filter((f) => f.endsWith(".wav"))
    .map((f) => f.slice(0, -4))
    .sort();
  for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) {
    for (const p of [wavPath(id), metaPath(id)]) if (existsSync(p)) rmSync(p);
  }
}
