import { execFile } from "child_process";

export interface VideoMeta {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

export interface VideoChapter {
  title: string;
  startSec: number;
  endSec: number;
}

export async function checkYtdlp(): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    execFile("yt-dlp", ["--version"], (error, stdout) => {
      if (error) {
        resolve({ installed: false });
      } else {
        resolve({ installed: true, version: stdout.trim() });
      }
    });
  });
}

/**
 * Creator-authored chapter markers, when the video has them. Most song
 * playthroughs label their sections (Intro/Verse/Chorus/Solo/…), which is
 * exact structure for free — no audio analysis needed.
 *
 * Returns [] when the video has no chapters or yt-dlp fails: callers treat
 * "no chapters" as a normal outcome and fall back to the local model.
 */
export async function fetchChapters(url: string): Promise<VideoChapter[]> {
  return new Promise((resolve) => {
    execFile(
      "yt-dlp",
      ["--no-playlist", "--print", "%(chapters)j", url],
      { timeout: 30000 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        try {
          // yt-dlp prints the literal string "NA" for videos without chapters.
          const raw = stdout.trim();
          if (!raw || raw === "NA") {
            resolve([]);
            return;
          }
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            resolve([]);
            return;
          }
          resolve(
            parsed
              .filter(
                (c) =>
                  typeof c?.start_time === "number" && typeof c?.end_time === "number"
              )
              .map((c) => ({
                title: String(c.title || "Section").trim(),
                startSec: c.start_time,
                endSec: c.end_time,
              }))
          );
        } catch {
          resolve([]);
        }
      }
    );
  });
}

export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--no-playlist",
        "--print", "%(title)s",
        "--print", "%(uploader)s",
        "--print", "%(duration)s",
        "--print", "%(thumbnail)s",
        url,
      ],
      { timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          if (msg.includes("not installed") || error.code === "ENOENT") {
            reject(new Error("yt-dlp is not installed. Install it with: brew install yt-dlp"));
          } else if (msg.includes("Sign in") || msg.includes("age")) {
            reject(new Error("This video is age-restricted and cannot be downloaded"));
          } else if (msg.includes("Private") || msg.includes("unavailable")) {
            reject(new Error("Video is unavailable (private or deleted)"));
          } else {
            reject(new Error("Invalid URL or video not found"));
          }
          return;
        }
        try {
          const lines = stdout.trim().split("\n");
          resolve({
            title: lines[0] || "Unknown",
            artist: lines[1] || "",
            duration: parseFloat(lines[2]) || 0,
            thumbnail: lines[3] || "",
          });
        } catch {
          reject(new Error("Failed to parse video metadata"));
        }
      }
    );
  });
}
