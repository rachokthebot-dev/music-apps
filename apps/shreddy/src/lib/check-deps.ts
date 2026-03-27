import { execFile } from "child_process";
import path from "path";
import { access } from "fs/promises";

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
  installHint: string;
}

function checkCommand(cmd: string, args: string[]): Promise<{ ok: boolean; version?: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve({ ok: false });
      } else {
        resolve({ ok: true, version: stdout.trim().split("\n")[0] });
      }
    });
  });
}

export async function checkDependencies(): Promise<DependencyStatus[]> {
  const PROJECT_ROOT = path.resolve(process.cwd(), "..");
  const PYTHON_BIN = path.join(PROJECT_ROOT, ".venv", "bin", "python3");

  const results: DependencyStatus[] = [];

  // ffmpeg
  const ffmpeg = await checkCommand("ffmpeg", ["-version"]);
  results.push({
    name: "ffmpeg",
    installed: ffmpeg.ok,
    version: ffmpeg.version?.match(/ffmpeg version (\S+)/)?.[1],
    required: true,
    installHint: "brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
  });

  // ffprobe
  const ffprobe = await checkCommand("ffprobe", ["-version"]);
  results.push({
    name: "ffprobe",
    installed: ffprobe.ok,
    version: ffprobe.version?.match(/ffprobe version (\S+)/)?.[1],
    required: true,
    installHint: "Included with ffmpeg — install ffmpeg to get ffprobe",
  });

  // yt-dlp
  const ytdlp = await checkCommand("yt-dlp", ["--version"]);
  results.push({
    name: "yt-dlp",
    installed: ytdlp.ok,
    version: ytdlp.version,
    required: false,
    installHint: "brew install yt-dlp (macOS) or pip install yt-dlp",
  });

  // Python venv
  let pythonOk = false;
  let pythonVersion: string | undefined;
  try {
    await access(PYTHON_BIN);
    const python = await checkCommand(PYTHON_BIN, ["--version"]);
    pythonOk = python.ok;
    pythonVersion = python.version?.replace("Python ", "");
  } catch {
    pythonOk = false;
  }
  results.push({
    name: "python (venv)",
    installed: pythonOk,
    version: pythonVersion,
    required: true,
    installHint: "python3 -m venv .venv && source .venv/bin/activate && pip install librosa matplotlib scipy numpy anthropic",
  });

  // librosa (check Python can import it)
  if (pythonOk) {
    const librosa = await checkCommand(PYTHON_BIN, ["-c", "import librosa; print(librosa.__version__)"]);
    results.push({
      name: "librosa",
      installed: librosa.ok,
      version: librosa.version,
      required: true,
      installHint: "source .venv/bin/activate && pip install librosa matplotlib scipy numpy",
    });
  } else {
    results.push({
      name: "librosa",
      installed: false,
      required: true,
      installHint: "Set up Python venv first, then: pip install librosa matplotlib scipy numpy",
    });
  }

  // Anthropic API key
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  results.push({
    name: "Anthropic API key",
    installed: hasApiKey,
    required: false,
    installHint: "Set ANTHROPIC_API_KEY in .env or configure in Settings",
  });

  return results;
}
