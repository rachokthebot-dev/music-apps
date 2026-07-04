/**
 * Measured-loudness bookkeeping.
 *
 * The gain estimator *predicts* per-snapshot loudness from the preset JSON.
 * This stores the *measured* integrated LUFS for each snapshot (from a real
 * capture uploaded to /api/preset/[slot]/measure), so the UI can show the
 * residual — how far the estimator is off.
 *
 * One JSON file per slot next to the slot files in SOUNDPATH_PRESET_DIR.
 * Keyed by snapshot index; re-measuring a snapshot overwrites it. Importing a
 * new preset into a slot clears that slot's measurements — they belong to the
 * preset that was measured, not the slot.
 */

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PRESET_DIR, type Slot } from "./masterStore";

export function measurementsPath(slot: Slot): string {
  return join(PRESET_DIR, `measurements-${slot}.json`);
}

export type SnapshotMeasurement = {
  /** Integrated loudness, LUFS. */
  lufs: number;
  /** ISO timestamp of capture. */
  at: string;
};

type MeasurementFile = {
  snapshots: { [index: string]: SnapshotMeasurement };
};

function read(slot: Slot): MeasurementFile {
  const path = measurementsPath(slot);
  if (!existsSync(path)) return { snapshots: {} };
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as MeasurementFile;
  } catch {
    return { snapshots: {} };
  }
}

export function readMeasurements(slot: Slot): { [index: number]: SnapshotMeasurement } {
  const out: { [index: number]: SnapshotMeasurement } = {};
  for (const [k, v] of Object.entries(read(slot).snapshots)) out[Number(k)] = v;
  return out;
}

export function writeMeasurement(
  slot: Slot,
  snapshotIndex: number,
  lufs: number
): SnapshotMeasurement {
  const file = read(slot);
  const m: SnapshotMeasurement = { lufs, at: new Date().toISOString() };
  file.snapshots[String(snapshotIndex)] = m;
  writeFileSync(measurementsPath(slot), JSON.stringify(file, null, 2), "utf-8");
  return m;
}

export function clearMeasurements(slot: Slot): void {
  rmSync(measurementsPath(slot), { force: true });
}
