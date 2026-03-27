import { execFile } from "child_process";
import { access } from "fs/promises";
import path from "path";

export function pitchFilename(entityId: string, semitones: number): string {
  const sign = semitones >= 0 ? "up" : "down";
  return `${entityId}_pitch_${sign}${Math.abs(semitones)}.mp3`;
}

export function validateSemitones(semitones: unknown): semitones is number {
  return typeof semitones === "number" && semitones !== 0 && semitones >= -12 && semitones <= 12;
}

/**
 * Pitch-shift an audio file using ffmpeg.
 * Returns the output filename. Uses caching — if the output already exists, returns immediately.
 */
export async function shiftPitch(
  sourceFile: string,
  outputDir: string,
  entityId: string,
  semitones: number
): Promise<string> {
  await access(sourceFile);

  const outFilename = pitchFilename(entityId, semitones);
  const outPath = path.join(outputDir, outFilename);

  // Return cached version if it exists
  try {
    await access(outPath);
    return outFilename;
  } catch {
    // Need to generate
  }

  // factor = 2^(semitones/12)
  // asetrate changes pitch (and speed), aresample restores sample rate,
  // atempo compensates for the speed change to preserve duration
  const factor = Math.pow(2, semitones / 12);
  const invFactor = 1 / factor;
  const filterChain = `asetrate=44100*${factor},aresample=44100,atempo=${invFactor}`;

  return new Promise<string>((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-y", "-i", sourceFile, "-af", filterChain, "-b:a", "192k", "-vn", outPath],
      { timeout: 120000 },
      (error, _stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error("ffmpeg is not installed. Install it with: brew install ffmpeg"));
          } else {
            console.error("ffmpeg pitch shift failed:", stderr);
            reject(new Error("Pitch processing failed"));
          }
          return;
        }
        resolve(outFilename);
      }
    );
  });
}
