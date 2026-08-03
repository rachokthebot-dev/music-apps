/**
 * Settings that outlive any one gig.
 *
 * Only the target level lives here, and only because it has to be shared: a
 * reference averaged from each setlist's own recordings centres that gig
 * nicely but says nothing about where any *other* gig sits, so two setlists
 * levelled separately can end up far apart. Anything that should apply across
 * setlists can't be stored in one.
 *
 * This is only meaningful because the USB tap is fixed — digital, no gain
 * stage on the computer, and knob-independent (measured: 0.24 dB across the
 * volume knob's travel). An absolute LUFS number therefore means the same
 * thing in March as in August. Through an analog interface it wouldn't.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRESET_DIR } from "./masterStore";

export interface SoundpathSettings {
  /**
   * Absolute LUFS every clean snapshot is aimed at, across all setlists.
   * null falls back to per-gig centring: each setlist averages its own
   * recordings, which centres that gig nicely and leaves it unrelated to any
   * other.
   */
  targetLufs: number | null;
  /** dB kept in hand below the output block's ceiling, so nothing sits on it. */
  headroomDb: number;
  /**
   * dB the original-presets download is shifted by, so takes don't clip on the way in.
   *
   * A preset hot enough to hit 0 dBFS at the USB tap records squashed, and a
   * squashed take measures *quieter* than the patch is — so the plan would
   * push it up, making it worse. Turning the whole gig down before recording
   * fixes that, and costs nothing: at 24 bits, 24 dB down still leaves ~80 dB
   * over the noise floor.
   *
   * It does not change the finished file. Every reading stamps the level it
   * was taken through, so the offset is added straight back when the
   * correction is worked out — the same cancellation that makes the output
   * block useless for fixing a quiet preset works in our favour here.
   */
  recordOffsetDb: number;
}

/**
 * −18 LUFS, 6 dB in hand.
 *
 * Peak is what clips, not loudness. Measured crest on this rig runs 8–11 dB,
 * so −18 puts worst-case peaks near −7 dBFS — clear of the converter, and well
 * under the ceiling a healthy gig can reach. Louder buys nothing: at 24 bits
 * this still sits 80 dB above the noise floor.
 *
 * The 6 dB is margin below the output block's +12 ceiling so no snapshot ends
 * up sitting on it. Three would do while nothing changes; six survives
 * swapping in a patch a few dB quieter without clamping the same day.
 */
export const DEFAULT_SETTINGS: SoundpathSettings = {
  targetLufs: -18,
  headroomDb: 6,
  // Zero by default: it only earns its keep when something actually clips.
  recordOffsetDb: 0,
};

const FILE = join(PRESET_DIR, "soundpath-settings.json");

export function readSettings(): SoundpathSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(FILE, "utf-8")) as object) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(next: SoundpathSettings): void {
  mkdirSync(PRESET_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(next, null, 2));
}

export function settingsExist(): boolean {
  return existsSync(FILE);
}
