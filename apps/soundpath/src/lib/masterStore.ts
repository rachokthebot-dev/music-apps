/**
 * Where everything SoundPath stores on disk lives.
 *
 * One directory, configurable via the SOUNDPATH_PRESET_DIR env var. If you sync
 * presets through iCloud Drive between Macs, point it there; otherwise the
 * default ~/Documents/helix-presets/ is fine.
 *
 *   setlists/    — gigs, with their readings and confirmed versions
 *   leveling/    — single-preset levelling sessions, same shape
 *   soundpath-settings.json — the target level and record offset
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
