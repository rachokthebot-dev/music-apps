import { execFile } from "child_process";
import path from "path";
import { mkdir } from "fs/promises";
import { SOURCES_DIR, CLIPS_DIR } from "./paths";

export async function extractClip(
  lickId: string,
  sourceId: string,
  startSec: number,
  endSec: number
): Promise<{ videoClipPath: string; audioClipPath: string }> {
  await mkdir(CLIPS_DIR, { recursive: true });

  const sourceVideoPath = path.join(SOURCES_DIR, `${sourceId}.mp4`);
  const sourceAudioPath = path.join(SOURCES_DIR, `${sourceId}.mp3`);
  const videoClipPath = path.join(CLIPS_DIR, `${lickId}.mp4`);
  const audioClipPath = path.join(CLIPS_DIR, `${lickId}.mp3`);

  // Extract video clip
  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-i", sourceVideoPath,
        "-ss", startSec.toString(),
        "-t", (endSec - startSec).toString(),
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-y",
        videoClipPath,
      ],
      { timeout: 60000 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`Video clip extraction failed: ${stderr || error.message}`));
        else resolve();
      }
    );
  });

  // Extract audio clip
  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-i", sourceAudioPath,
        "-ss", startSec.toString(),
        "-to", endSec.toString(),
        "-c", "copy",
        "-y",
        audioClipPath,
      ],
      { timeout: 60000 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`Audio clip extraction failed: ${stderr || error.message}`));
        else resolve();
      }
    );
  });

  return {
    videoClipPath: `${lickId}.mp4`,
    audioClipPath: `${lickId}.mp3`,
  };
}
