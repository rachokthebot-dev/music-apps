/**
 * Preset slot bookkeeping.
 *
 * The app works on two presets at once: slot "a" (the baseline preset) and
 * slot "b" (the preset being aligned to it). Each slot is a .hlx file in the
 * preset dir, configurable via the SOUNDPATH_PRESET_DIR env var. If you sync
 * presets through iCloud Drive between Macs, point it there; otherwise the
 * default ~/Documents/helix-presets/ is fine.
 *
 *   slot-a.hlx   — baseline preset
 *   slot-b.hlx   — preset to align
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { HelixPreset } from "@music-apps/gain-estimator";

/**
 * Resolve the preset directory. Override with SOUNDPATH_PRESET_DIR.
 *   - Tilde (`~`) at the start is expanded to $HOME.
 *   - Relative paths are resolved against cwd.
 *   - Created on demand so a fresh checkout works without manual setup.
 */
function resolvePresetDir(): string {
  const raw = process.env.SOUNDPATH_PRESET_DIR?.trim();
  const fallback = join(homedir(), "Documents", "helix-presets");
  const expanded = raw
    ? raw.startsWith("~/")
      ? join(homedir(), raw.slice(2))
      : raw
    : fallback;
  if (!existsSync(expanded)) {
    try {
      mkdirSync(expanded, { recursive: true });
    } catch {
      // best-effort; the read path below will surface a clear error if needed
    }
  }
  return expanded;
}

export const PRESET_DIR = resolvePresetDir();

export type Slot = "a" | "b";

export function isSlot(v: unknown): v is Slot {
  return v === "a" || v === "b";
}

export function slotPath(slot: Slot): string {
  return join(PRESET_DIR, `slot-${slot}.hlx`);
}

/** True when the slot has a preset loaded. */
export function slotExists(slot: Slot): boolean {
  return existsSync(slotPath(slot));
}

export function deleteSlot(slot: Slot): void {
  rmSync(slotPath(slot), { force: true });
}

export function readSlot(slot: Slot): HelixPreset {
  if (!slotExists(slot)) {
    throw new Error(`no preset loaded in slot ${slot} (${slotPath(slot)})`);
  }
  return JSON.parse(readFileSync(slotPath(slot), "utf-8")) as HelixPreset;
}

export function writeSlot(slot: Slot, bytes: Buffer | string): void {
  writeFileSync(slotPath(slot), bytes);
}
