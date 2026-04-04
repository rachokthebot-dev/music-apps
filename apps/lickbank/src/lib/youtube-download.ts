import { spawn, execFile } from "child_process";
import path from "path";
import { SOURCES_DIR } from "./paths";
import { prisma } from "./prisma";
import { mkdir } from "fs/promises";
import { generateWaveformData } from "./waveform";

export { checkYtdlp, fetchVideoMeta } from "@music-apps/shared";

export async function downloadVideo(
  sourceId: string,
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ videoPath: string; audioPath: string }> {
  await mkdir(SOURCES_DIR, { recursive: true });

  const videoPath = path.join(SOURCES_DIR, `${sourceId}.mp4`);
  const audioPath = path.join(SOURCES_DIR, `${sourceId}.mp3`);

  // Download video (720p max)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "-f", "bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=720]+bestaudio/best[height<=720]",
      "--merge-output-format", "mp4",
      "--postprocessor-args", "ffmpeg:-c:v libx264 -c:a aac -movflags +faststart",
      "-o", videoPath,
      "--no-playlist",
      "--max-filesize", "500m",
      "--newline",
      url,
    ]);

    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString();
      const match = line.match(/\[download\]\s+([\d.]+)%/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]));
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp failed: ${stderr || `exit code ${code}`}`));
      }
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("yt-dlp is not installed. Install it with: brew install yt-dlp"));
      } else {
        reject(err);
      }
    });
  });

  // Extract audio for waveform/speed control
  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-i", videoPath,
        "-vn",
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "192k",
        "-f", "mp3",
        "-y",
        audioPath,
      ],
      { timeout: 300000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg audio extraction failed: ${stderr || error.message}`));
        } else {
          resolve();
        }
      }
    );
  });

  return { videoPath, audioPath };
}

export async function downloadAndProcess(sourceId: string, url: string) {
  try {
    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "processing", progressMessage: "Downloading video..." },
    });

    const { videoPath, audioPath } = await downloadVideo(sourceId, url, async (percent) => {
      if (Math.floor(percent) % 10 === 0) {
        await prisma.importJob.update({
          where: { sourceId },
          data: { progressMessage: `Downloading: ${Math.floor(percent)}%` },
        }).catch(() => {});
      }
    });

    // Get duration using ffprobe
    const duration = await new Promise<number | null>((resolve) => {
      execFile(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath],
        (error, stdout) => {
          if (error) resolve(null);
          else {
            const sec = parseFloat(stdout.trim());
            resolve(isNaN(sec) ? null : sec);
          }
        }
      );
    });

    // Generate waveform data
    await prisma.importJob.update({
      where: { sourceId },
      data: { progressMessage: "Generating waveform..." },
    }).catch(() => {});

    let waveformData: string | null = null;
    try {
      waveformData = await generateWaveformData(path.basename(audioPath));
    } catch {
      // Non-critical — clipper falls back to flat bar
    }

    // Update source as ready
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        processingStatus: "ready",
        videoPath: path.basename(videoPath),
        audioPath: path.basename(audioPath),
        durationSec: duration,
        waveformData,
      },
    });
    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "completed", progressMessage: "Done" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    await prisma.source.update({
      where: { id: sourceId },
      data: { processingStatus: "error" },
    });
    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "error", errorMessage: message },
    });
  }
}
