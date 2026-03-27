import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { SOURCES_DIR } from "./paths";

const exec = promisify(execFile);

const NUM_PEAKS = 400;

/**
 * Generate waveform peak data from an audio file using ffmpeg.
 * Returns a JSON string of ~400 normalized float values (0.0–1.0).
 */
export async function generateWaveformData(audioPath: string): Promise<string> {
  const fullPath = path.join(SOURCES_DIR, audioPath);

  // Decode audio to raw 16-bit PCM, mono, 8kHz (low-res is fine for peaks)
  const { stdout } = await exec("ffmpeg", [
    "-i", fullPath,
    "-ac", "1",           // mono
    "-ar", "8000",        // 8kHz sample rate
    "-f", "s16le",        // raw 16-bit signed little-endian
    "-acodec", "pcm_s16le",
    "pipe:1",
  ], { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 });

  const samples = new Int16Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 2);
  const totalSamples = samples.length;

  if (totalSamples === 0) {
    return JSON.stringify(new Array(NUM_PEAKS).fill(0));
  }

  const chunkSize = Math.max(1, Math.floor(totalSamples / NUM_PEAKS));
  const peaks: number[] = [];

  for (let i = 0; i < NUM_PEAKS; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalSamples);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max / 32768); // normalize to 0.0–1.0
  }

  return JSON.stringify(peaks);
}
