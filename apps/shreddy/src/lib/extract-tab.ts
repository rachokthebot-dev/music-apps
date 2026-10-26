// Solo → tablature extraction.
//
// Chains: guitar stem (htdemucs_6s, on-demand) → ffmpeg section cut →
// scripts/extract_tab.py (Basic Pitch + DP fretting + beat-grid quantise).
//
// Runs in its own Python venv (.venv-tab) rather than .venv-sf: Basic Pitch
// pulls coremltools and a conflicting resampy pin, and .venv-sf holds the
// working SongFormer + Demucs install that the rest of the app depends on.

import { execFile } from "child_process";
import path from "path";
import { access, mkdir, rm } from "fs/promises";
import { AUDIO_DIR, TMP_DIR } from "./paths";
import { prisma } from "./prisma";
import { ensureGuitarStem } from "./process-stems";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const TAB_PYTHON = path.join(PROJECT_ROOT, ".venv-tab", "bin", "python");
const EXTRACT_SCRIPT = path.join(PROJECT_ROOT, "scripts", "extract_tab.py");

// Demucs edge artifacts land in the first/last moments of a clip, so we
// separate a padded window and trim the padding off afterwards.
const PAD_SEC = 2;

export interface TabNote {
  id: string;
  bar: number;
  beat: number;
  dur: number;
  string: number;   // 1 = high e … 6 = low E
  fret: number;
  midi: number;
  startSec: number;
  endSec: number;
  detectConf: number;
  fretConf: number;
  margin: number | null;
  alts: { string: number; fret: number; extra: number }[];
}

export interface TabResult {
  notes: TabNote[];
  bars: number;
  stats: {
    rawDetections: number;
    afterMelodyCollapse: number;
    rendered: number;
    detectSec: number;
    fretSec: number;
    quantMedianMs: number | null;
    ambiguousFrets: number;
    lowDetect: number;
  };
  stemUrl: string;
  sectionStartSec: number;
  sectionEndSec: number;
}

function run(bin: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr?.slice(-2000) || error.message));
      else resolve(stdout);
    });
  });
}

export async function ensureTabVenv(): Promise<void> {
  try {
    await access(TAB_PYTHON);
  } catch {
    throw new Error(
      "Tab extraction venv not found at apps/.venv-tab. Run:\n" +
      "  python3.11 -m venv apps/.venv-tab && " +
      "apps/.venv-tab/bin/pip install basic-pitch setuptools 'resampy>=0.4.3'"
    );
  }
}

export async function extractTabForSection(sectionId: string): Promise<TabResult> {
  await ensureTabVenv();

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { song: true },
  });
  if (!section) throw new Error("Section not found");

  const song = section.song;
  if (!song.normalizedAudioPath) throw new Error("Song has no normalized audio");
  const songAudio = path.join(AUDIO_DIR, song.normalizedAudioPath);

  // 1. guitar stem for the whole song (cached across sections of the same song)
  const stemPath = await ensureGuitarStem(song.id, songAudio);

  // 2. cut the section out of the stem, with padding trimmed back off
  const scratch = path.join(TMP_DIR, `tab-${sectionId}`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  const clip = path.join(scratch, "solo.wav");
  const from = Math.max(0, section.startSec - PAD_SEC);
  const lead = section.startSec - from;   // actual padding we got at the head
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-i", stemPath,
    "-ss", String(from),
    "-to", String(section.endSec + PAD_SEC),
    "-ar", "22050", "-ac", "1",
    clip,
  ], 120_000);

  const trimmed = path.join(scratch, "solo_trim.wav");
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-i", clip,
    "-ss", String(lead),
    "-to", String(lead + (section.endSec - section.startSec)),
    trimmed,
  ], 120_000);

  // 3. detect + fret + quantise against the song's own beat grid
  const args = [
    EXTRACT_SCRIPT, trimmed,
    "--start", String(section.startSec),
    "--end", String(section.endSec),
  ];
  if (song.beatTimestamps) args.push("--beats", song.beatTimestamps);

  const stdout = await run(TAB_PYTHON, args, 5 * 60 * 1000);
  // Basic Pitch's CoreML backend chatters on stdout; our JSON is the last line.
  const line = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  let parsed: TabResult;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`extract_tab.py returned unparseable output: ${line.slice(0, 300)}`);
  }
  if ((parsed as unknown as { error?: string }).error) {
    throw new Error((parsed as unknown as { error: string }).error);
  }

  await rm(scratch, { recursive: true, force: true });

  return {
    ...parsed,
    stemUrl: `/shreddy/api/media/${path.basename(stemPath)}`,
    sectionStartSec: section.startSec,
    sectionEndSec: section.endSec,
  };
}
