import { execFile } from "child_process";
import path from "path";
import { rename, mkdir } from "fs/promises";
import { SOURCES_DIR } from "./paths";
import { prisma } from "./prisma";
import { generateWaveformData } from "./waveform";

/**
 * Process an uploaded video/audio file for LickBank.
 * Steps: move to sources dir, extract audio (if video), get duration, generate waveform.
 */
export async function processUpload(sourceId: string, uploadPath: string, originalFilename: string) {
  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { processingStatus: "processing" },
    });
    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "processing", progressMessage: "Processing file..." },
    }).catch(() => {});

    await mkdir(SOURCES_DIR, { recursive: true });

    const ext = path.extname(originalFilename).toLowerCase();
    const isVideo = ext === ".mp4";
    const videoFilename = `${sourceId}.mp4`;
    const audioFilename = `${sourceId}.mp3`;

    if (isVideo) {
      // Move video to sources dir
      const videoPath = path.join(SOURCES_DIR, videoFilename);
      await rename(uploadPath, videoPath);

      // Extract audio
      await prisma.importJob.update({
        where: { sourceId },
        data: { progressMessage: "Extracting audio..." },
      }).catch(() => {});

      const audioPath = path.join(SOURCES_DIR, audioFilename);
      await new Promise<void>((resolve, reject) => {
        execFile(
          "ffmpeg",
          ["-i", videoPath, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", "-f", "mp3", "-y", audioPath],
          { timeout: 300000 },
          (error, _stdout, stderr) => {
            if (error) reject(new Error(`ffmpeg audio extraction failed: ${stderr || error.message}`));
            else resolve();
          }
        );
      });

      // Get duration
      const duration = await getDuration(videoPath);

      // Generate waveform
      await prisma.importJob.update({
        where: { sourceId },
        data: { progressMessage: "Generating waveform..." },
      }).catch(() => {});

      let waveformData: string | null = null;
      try {
        waveformData = await generateWaveformData(audioFilename);
      } catch { /* non-critical */ }

      await prisma.source.update({
        where: { id: sourceId },
        data: {
          processingStatus: "ready",
          videoPath: videoFilename,
          audioPath: audioFilename,
          durationSec: duration,
          waveformData,
        },
      });
    } else {
      // Audio file — move to sources, normalize
      await prisma.importJob.update({
        where: { sourceId },
        data: { progressMessage: "Normalizing audio..." },
      }).catch(() => {});

      const audioPath = path.join(SOURCES_DIR, audioFilename);
      await new Promise<void>((resolve, reject) => {
        execFile(
          "ffmpeg",
          ["-i", uploadPath, "-ar", "44100", "-ac", "2", "-b:a", "192k", "-f", "mp3", "-y", audioPath],
          { timeout: 300000 },
          (error, _stdout, stderr) => {
            if (error) reject(new Error(`ffmpeg normalization failed: ${stderr || error.message}`));
            else resolve();
          }
        );
      });

      const duration = await getDuration(audioPath);

      await prisma.importJob.update({
        where: { sourceId },
        data: { progressMessage: "Generating waveform..." },
      }).catch(() => {});

      let waveformData: string | null = null;
      try {
        waveformData = await generateWaveformData(audioFilename);
      } catch { /* non-critical */ }

      await prisma.source.update({
        where: { id: sourceId },
        data: {
          processingStatus: "ready",
          videoPath: null,
          audioPath: audioFilename,
          durationSec: duration,
          waveformData,
        },
      });
    }

    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "completed", progressMessage: "Done" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error("Upload processing error:", message);
    await prisma.source.update({
      where: { id: sourceId },
      data: { processingStatus: "error" },
    });
    await prisma.importJob.update({
      where: { sourceId },
      data: { status: "error", errorMessage: message },
    }).catch(() => {});
  }
}

function getDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      (error, stdout) => {
        if (error) resolve(null);
        else {
          const sec = parseFloat(stdout.trim());
          resolve(isNaN(sec) ? null : sec);
        }
      }
    );
  });
}
