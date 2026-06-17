// R5 Vocal Integration — Demucs stem separation pipeline.
//
// Runs `htdemucs` from the .venv-sf Python venv (the SongFormer venv —
// demucs lives there already, so we don't need a second venv). The htdemucs
// model produces four MP3 stems per track: vocals, drums, bass, other.
//
// Why htdemucs (not htdemucs_ft):
//   The "fine-tuned" variant is *worse* on overall SDR (0.15 dB drop) and
//   takes ~4× as long. Vocals are slightly better (0.19 dB) but the cost is
//   not worth it for v1.
//
// Output naming:
//   <songId>_stem_vocals.mp3
//   <songId>_stem_drums.mp3
//   <songId>_stem_bass.mp3
//   <songId>_stem_other.mp3
//
// Stored in AUDIO_DIR so the existing /api/media/<filename> route serves
// them with range-request support (no new media route needed).

import { execFile } from "child_process";
import path from "path";
import { mkdir, rename, rm, access } from "fs/promises";
import { AUDIO_DIR } from "./paths";
import { prisma } from "./prisma";

const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const DEMUCS_BIN = path.join(PROJECT_ROOT, ".venv-sf", "bin", "demucs");

const STEM_NAMES = ["vocals", "drums", "bass", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];

export function stemFilename(songId: string, stem: StemName): string {
  return `${songId}_stem_${stem}.mp3`;
}

/**
 * Return whether all 4 stems already exist on disk for this song.
 * Useful for backfill (skip work) and for the runtime status route.
 */
export async function stemsExist(songId: string): Promise<boolean> {
  const checks = STEM_NAMES.map((s) =>
    access(path.join(AUDIO_DIR, stemFilename(songId, s)))
      .then(() => true)
      .catch(() => false)
  );
  const results = await Promise.all(checks);
  return results.every(Boolean);
}

/**
 * Run Demucs htdemucs on a song's normalized audio. On success, the 4 stems
 * land in AUDIO_DIR and stemsState='ready'. On failure, stemsState='error'
 * and stemsErrorMessage is populated. Never throws — callers fire-and-forget.
 *
 * On a 4-minute track this takes ~3–6 min CPU-only on an M4 mini; htdemucs
 * is parallelised with `-j 4` worker threads (matches the deepening note).
 */
export async function processStems(songId: string, audioPath: string): Promise<void> {
  try {
    // Idempotency: skip if already complete.
    if (await stemsExist(songId)) {
      await prisma.song.update({
        where: { id: songId },
        data: { stemsState: "ready", stemsErrorMessage: null, stemsCompletedAt: new Date() },
      });
      return;
    }

    await prisma.song.update({
      where: { id: songId },
      data: { stemsState: "processing", stemsErrorMessage: null },
    });

    // Demucs writes to <outDir>/htdemucs/<source-basename>/{stem}.mp3 by
    // default. We run it into a scratch directory then move stems into
    // AUDIO_DIR under our id-prefixed names.
    const scratch = path.join(AUDIO_DIR, `.stems-tmp-${songId}`);
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });

    await new Promise<void>((resolve, reject) => {
      execFile(
        DEMUCS_BIN,
        [
          "-n", "htdemucs",
          "-d", "cpu",
          "-j", "4",
          "--mp3",
          "--mp3-bitrate", "192",
          "-o", scratch,
          audioPath,
        ],
        // CPU stem separation on a long song can take 5–10 min. Hard cap
        // at 20 min so a hung process doesn't tie up the queue forever.
        { timeout: 20 * 60 * 1000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`demucs failed: ${stderr || error.message}`));
          } else {
            resolve();
          }
        }
      );
    });

    // Demucs derives the inner directory name from the input file's basename
    // (without extension). Our normalized files are `<id>.mp3` so the dir is
    // `<scratch>/htdemucs/<id>/`.
    const audioBase = path.basename(audioPath, path.extname(audioPath));
    const innerDir = path.join(scratch, "htdemucs", audioBase);

    for (const stem of STEM_NAMES) {
      const src = path.join(innerDir, `${stem}.mp3`);
      const dst = path.join(AUDIO_DIR, stemFilename(songId, stem));
      await rename(src, dst);
    }

    await rm(scratch, { recursive: true, force: true });

    await prisma.song.update({
      where: { id: songId },
      data: {
        stemsState: "ready",
        stemsErrorMessage: null,
        stemsCompletedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stem separation failed";
    console.error(`[stems ${songId}]`, message);
    await prisma.song
      .update({
        where: { id: songId },
        data: { stemsState: "error", stemsErrorMessage: message },
      })
      .catch(() => {
        // Song row may have been deleted mid-render; ignore.
      });
  }
}
