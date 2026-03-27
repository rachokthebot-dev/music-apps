import { execFile } from "child_process";

export interface VideoMeta {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
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

export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      ["--dump-json", "--no-playlist", url],
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
          const data = JSON.parse(stdout);
          resolve({
            title: data.title || "Unknown",
            artist: data.uploader || data.artist || data.creator || "",
            duration: data.duration || 0,
            thumbnail: data.thumbnail || "",
          });
        } catch {
          reject(new Error("Failed to parse video metadata"));
        }
      }
    );
  });
}
