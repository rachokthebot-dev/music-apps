/**
 * Measured-loudness bookkeeping.
 *
 * The gain estimator *predicts* per-snapshot loudness from the preset JSON.
 * This stores the *measured* integrated LUFS for each snapshot (from a real
 * capture uploaded to /api/measure), so the UI can show the residual — how far
 * the estimator is off — and, later, feed corrections back into the per-block
 * gain models.
 *
 * One JSON file next to the active master in SOUNDPATH_PRESET_DIR. Keyed by
 * snapshot index; re-measuring a snapshot overwrites it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRESET_DIR } from "./masterStore";

export const MEASUREMENTS_PATH = join(PRESET_DIR, "measurements.json");

export type SnapshotMeasurement = {
  /** Integrated loudness, LUFS. */
  lufs: number;
  /** ISO timestamp of capture. */
  at: string;
};

type MeasurementFile = {
  snapshots: { [index: string]: SnapshotMeasurement };
};

function read(): MeasurementFile {
  if (!existsSync(MEASUREMENTS_PATH)) return { snapshots: {} };
  try {
    return JSON.parse(readFileSync(MEASUREMENTS_PATH, "utf-8")) as MeasurementFile;
  } catch {
    return { snapshots: {} };
  }
}

export function readMeasurements(): { [index: number]: SnapshotMeasurement } {
  const out: { [index: number]: SnapshotMeasurement } = {};
  for (const [k, v] of Object.entries(read().snapshots)) out[Number(k)] = v;
  return out;
}

export function writeMeasurement(snapshotIndex: number, lufs: number): SnapshotMeasurement {
  const file = read();
  const m: SnapshotMeasurement = { lufs, at: new Date().toISOString() };
  file.snapshots[String(snapshotIndex)] = m;
  writeFileSync(MEASUREMENTS_PATH, JSON.stringify(file, null, 2), "utf-8");
  return m;
}
