import { spawn, execFile } from "child_process";
import path from "path";
import { UPLOADS_DIR } from "./paths";
import { prisma } from "./prisma";
import { mkdir } from "fs/promises";

export { checkYtdlp, fetchVideoMeta } from "@music-apps/shared";

export async function downloadAudio(
  songId: string,
  url: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });

  const outputTemplate = path.join(UPLOADS_DIR, `${songId}.%(ext)s`);
  const outputPath = path.join(UPLOADS_DIR, `${songId}.mp3`);

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "-o", outputTemplate,
      "--no-playlist",
      "--max-filesize", "200m",
      "--newline",
      url,
    ]);

    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString();
      // Parse progress: [download]  45.2% of 5.67MiB
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
        resolve(outputPath);
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
}

// YouTube sometimes rejects the signed media URL the instant we fetch it — a
// 403 two seconds into the job, with the same video downloading fine a minute
// later. The retry has to re-run yt-dlp rather than re-request the URL: only a
// fresh extraction gets a fresh signature, so retrying the dead URL just 403s
// again.
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 3000;

async function downloadWithRetry(
  songId: string,
  url: string,
  onProgress: (percent: number) => void
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadAudio(songId, url, onProgress);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // A missing yt-dlp is a broken install, not a flaky network — waiting
      // nine seconds to say so again helps nobody.
      if (attempt >= DOWNLOAD_ATTEMPTS || message.includes("yt-dlp is not installed")) throw err;

      await prisma.importJob.update({
        where: { songId },
        data: { progressMessage: `Download failed — retrying (${attempt}/${DOWNLOAD_ATTEMPTS - 1})...` },
      }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * attempt));
    }
  }
}

export async function downloadAndProcess(
  songId: string,
  url: string,
  options?: { skipSections?: boolean }
) {
  const { processAudio } = await import("./process-audio");

  try {
    // Update status to downloading
    await prisma.importJob.update({
      where: { songId },
      data: { status: "processing", progressMessage: "Downloading audio..." },
    });

    // Download with progress updates
    const filePath = await downloadWithRetry(songId, url, async (percent) => {
      // Update progress every ~10%
      if (Math.floor(percent) % 10 === 0) {
        await prisma.importJob.update({
          where: { songId },
          data: { progressMessage: `Downloading: ${Math.floor(percent)}%` },
        }).catch(() => {});
      }
    });

    // Update the song's original file path
    await prisma.song.update({
      where: { id: songId },
      data: { originalFilePath: path.basename(filePath) },
    });

    // Hand off to existing processing pipeline
    await processAudio(songId, filePath, { skipSections: options?.skipSections });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    await prisma.song.update({
      where: { id: songId },
      data: { processingStatus: "error", errorMessage: message },
    });
    await prisma.importJob.update({
      where: { songId },
      data: { status: "error", errorMessage: message },
    });
  }
}
