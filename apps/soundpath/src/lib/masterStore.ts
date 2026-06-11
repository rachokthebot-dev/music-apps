/**
 * Master preset file bookkeeping.
 *
 * The "active master" is the .hlx the app is currently reading and patching.
 * Where it lives is configurable via the SOUNDPATH_PRESET_DIR env var. If you
 * sync presets through iCloud Drive between Macs, point it there; otherwise
 * the default ~/Documents/helix-presets/ is fine.
 *
 *   active-master.hlx                  — what the app reads + patches
 *   active-master — aligned.hlx        — what Apply produces
 *
 * On first run we bootstrap active-master.hlx by copying any .hlx found in
 * the preset dir (preferring "seed.hlx" if present), so the app has something
 * to load. Your original file is never touched after that.
 */

import {
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { HelixPreset } from "@music-apps/gain-estimator";
import { stringifyHelixPreset } from "@music-apps/gain-estimator";

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
export const ACTIVE_MASTER_PATH = join(PRESET_DIR, "active-master.hlx");
export const ALIGNED_OUTPUT_PATH = join(PRESET_DIR, "active-master — aligned.hlx");

/**
 * Ensure active-master.hlx exists. If not, copy from a seed file if available.
 * Looks for "seed.hlx" first; otherwise picks the first non-aligned .hlx in
 * the preset dir. Returns true if a master is now available, false if the dir
 * is empty (user needs to drop in a preset).
 */
export function ensureActiveMaster(): boolean {
  if (existsSync(ACTIVE_MASTER_PATH)) return true;
  const seedExplicit = join(PRESET_DIR, "seed.hlx");
  if (existsSync(seedExplicit)) {
    copyFileSync(seedExplicit, ACTIVE_MASTER_PATH);
    return true;
  }
  try {
    const candidates = readdirSync(PRESET_DIR).filter(
      (f) => f.toLowerCase().endsWith(".hlx") && !f.includes("aligned")
    );
    if (candidates.length > 0) {
      copyFileSync(join(PRESET_DIR, candidates[0]), ACTIVE_MASTER_PATH);
      return true;
    }
  } catch {
    // dir missing is treated as "no seed"
  }
  return false;
}

export function readActiveMaster(): HelixPreset {
  ensureActiveMaster();
  return JSON.parse(readFileSync(ACTIVE_MASTER_PATH, "utf-8")) as HelixPreset;
}

export function writeAlignedOutput(preset: HelixPreset): string {
  writeFileSync(ALIGNED_OUTPUT_PATH, stringifyHelixPreset(preset), "utf-8");
  return ALIGNED_OUTPUT_PATH;
}

export function writeActiveMaster(bytes: Buffer | string): void {
  writeFileSync(ACTIVE_MASTER_PATH, bytes);
}
