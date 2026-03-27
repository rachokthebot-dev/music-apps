import path from "path";

const DATA_ROOT = path.resolve(process.cwd(), "..", "data");

export const SOURCES_DIR = path.join(DATA_ROOT, "sources");
export const CLIPS_DIR = path.join(DATA_ROOT, "clips");
export const TMP_DIR = path.join(DATA_ROOT, "tmp");

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB (videos are larger)
export const ALLOWED_EXTENSIONS = [".mp3", ".mp4"];
export const ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "video/mp4",
  "audio/mp4",
];
