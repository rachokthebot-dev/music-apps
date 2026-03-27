import path from "path";

const DATA_ROOT = path.resolve(process.cwd(), "..", "data");

export const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
export const AUDIO_DIR = path.join(DATA_ROOT, "audio");
export const TMP_DIR = path.join(DATA_ROOT, "tmp");
export const SETTINGS_FILE = path.join(DATA_ROOT, "settings.json");

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
export const ALLOWED_EXTENSIONS = [".mp3", ".mp4"];
export const ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "video/mp4",
  "audio/mp4",
];
