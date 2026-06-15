import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";

/**
 * Pitch-preserving tempo stretch via ffmpeg.
 *
 * Sibling module to ffmpeg-pitch.ts — same cache-on-disk pattern, same
 * filename convention, different responsibility. Pitch shifts pitch; this
 * stretches time without changing pitch. Built as separate modules because
 * "stretch" and "pitch" are different concepts even when both use ffmpeg.
 *
 * Used by the sandbox R1 mockup (ultra-slow tempo for the 50% Rule). Filter
 * choice:
 *   - Try `rubberband` first if compiled into the local ffmpeg — phase-coherent
 *     grain-based stretching, audibly cleaner at extreme ratios (≤ 0.25×).
 *   - Fall back to chained `atempo` filters. Each `atempo` accepts 0.5–100.0;
 *     for 0.10× we chain `atempo=0.5,atempo=0.5,atempo=0.4`. Some warm-up
 *     artifact per stage; acceptable for mockup grading.
 *
 * iPad-Safari note: HTMLAudioElement.playbackRate silently clamps at 0.5 on
 * Safari, which is why server-side rendering is required for true ultra-slow.
 */

const SUPPORTED_FILTER_CACHE: { rubberband: boolean | null } = { rubberband: null };

export function tempoFilename(entityId: string, multiplier: number): string {
  // Two-digit padded so song-a_tempo_010.mp3 / _025.mp3 sort correctly.
  const tag = Math.round(multiplier * 100).toString().padStart(3, "0");
  return `${entityId}_tempo_${tag}.mp3`;
}

export function validateMultiplier(value: unknown): value is number {
  return typeof value === "number" && value >= 0.1 && value <= 1.0;
}

/**
 * Build the ffmpeg filter argument string for a given multiplier.
 * Exported for tests and to make the chain logic visible at the API edge.
 */
export function buildStretchFilter(
  multiplier: number,
  preferRubberband: boolean
): string {
  if (preferRubberband) return `rubberband=tempo=${multiplier}`;
  // Chained atempo. Each filter takes 0.5..100.
  const factors: number[] = [];
  let remaining = multiplier;
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining = remaining / 0.5; // each 0.5 halves the playback speed; we need to "use up" remaining
  }
  factors.push(Number(remaining.toFixed(4)));
  return factors.map((f) => `atempo=${f}`).join(",");
}

/**
 * Probe ffmpeg once per process for rubberband filter support. Cached.
 */
async function probeRubberband(): Promise<boolean> {
  if (SUPPORTED_FILTER_CACHE.rubberband !== null) {
    return SUPPORTED_FILTER_CACHE.rubberband;
  }
  return new Promise<boolean>((resolve) => {
    execFile(
      "ffmpeg",
      ["-hide_banner", "-filters"],
      { timeout: 5000 },
      (error, stdout) => {
        const has = !error && /\brubberband\b/.test(stdout);
        SUPPORTED_FILTER_CACHE.rubberband = has;
        resolve(has);
      }
    );
  });
}

/**
 * Stretch an audio file's tempo by `multiplier` without changing pitch.
 * Returns the output filename in `outputDir`. Caches on disk.
 *
 * @throws Error("ffmpeg is not installed") on ENOENT
 * @throws Error("Tempo stretch failed") on other ffmpeg failures
 */
export async function stretchTempo(
  sourceFile: string,
  outputDir: string,
  entityId: string,
  multiplier: number
): Promise<string> {
  await access(sourceFile);

  const outFilename = tempoFilename(entityId, multiplier);
  const outPath = path.join(outputDir, outFilename);

  // Cache hit
  try {
    await access(outPath);
    return outFilename;
  } catch {
    // need to render
  }

  const hasRubberband = await probeRubberband();
  const filter = buildStretchFilter(multiplier, hasRubberband);

  return new Promise<string>((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-y", "-i", sourceFile, "-af", filter, "-b:a", "192k", "-vn", outPath],
      { timeout: 120000 },
      (error, _stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error("ffmpeg is not installed. Install it with: brew install ffmpeg"));
          } else {
            console.error("ffmpeg tempo stretch failed:", stderr);
            reject(new Error("Tempo stretch failed"));
          }
          return;
        }
        resolve(outFilename);
      }
    );
  });
}
