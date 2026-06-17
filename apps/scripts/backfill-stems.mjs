#!/usr/bin/env node
//
// backfill-stems.mjs — Run Demucs across the song library.
//
// Iterates Song rows where stemsState != 'ready' (and the normalized audio
// exists on disk) and runs the same demucs invocation used by the runtime
// pipeline at import time. Sequential by design — Demucs is already
// CPU-saturating at -j 4.
//
// Flags:
//   --dry-run         Print the queue and exit; no Demucs.
//   --only=<songId>   Backfill a single song (overrides state filter).
//   --include-errors  Also re-run songs with stemsState='error'.
//
// Safety:
//   * File lock at /tmp/shreddy-backfill-stems.lock prevents two
//     simultaneous backfill runs from clobbering the same _stems-tmp dirs.
//   * SIGINT trap completes the in-flight song's DB update before exit so
//     the lock and stemsState don't get stuck in 'processing'.
//
// DB access bypasses the generated Prisma client (which Prisma 7 ships as
// .ts) and talks directly to the SQLite file via @libsql/client. We touch
// only Song.stems* columns, so raw SQL is cleaner than dragging the type
// runtime in here.
//
// Usage:
//   node apps/scripts/backfill-stems.mjs --dry-run
//   node apps/scripts/backfill-stems.mjs
//   node apps/scripts/backfill-stems.mjs --only=<songId>

import { execFile } from "child_process";
import { mkdir, rename, rm, access, writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(APPS_DIR, "data", "audio");
// DB lives at apps/shreddy/dev.db (Shreddy's .env points at `file:./dev.db`
// resolved from the shreddy workspace). The apps/data/shreddy.db file is
// vestigial from an earlier layout — do not use it.
const DB_FILE = path.join(APPS_DIR, "shreddy", "dev.db");
const DEMUCS_BIN = path.join(APPS_DIR, ".venv-sf", "bin", "demucs");
const LOCK_FILE = "/tmp/shreddy-backfill-stems.lock";

const STEM_NAMES = ["vocals", "drums", "bass", "other"];

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INCLUDE_ERRORS = args.includes("--include-errors");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

function stemFilename(songId, stem) {
  return `${songId}_stem_${stem}.mp3`;
}

async function acquireLock() {
  try {
    await access(LOCK_FILE);
    const existing = await readFile(LOCK_FILE, "utf8");
    throw new Error(
      `Backfill is already running (lock at ${LOCK_FILE} held by pid ${existing.trim()}). ` +
        `If you're sure no other backfill is running, rm ${LOCK_FILE} and retry.`
    );
  } catch (e) {
    if (e?.code === "ENOENT") {
      /* good — lock is free */
    } else {
      throw e;
    }
  }
  await writeFile(LOCK_FILE, String(process.pid));
}

async function releaseLock() {
  try {
    await unlink(LOCK_FILE);
  } catch {
    /* already gone */
  }
}

async function stemsExist(songId) {
  for (const s of STEM_NAMES) {
    try {
      await access(path.join(AUDIO_DIR, stemFilename(songId, s)));
    } catch {
      return false;
    }
  }
  return true;
}

function runDemucs(audioPath, scratchDir) {
  return new Promise((resolve, reject) => {
    execFile(
      DEMUCS_BIN,
      [
        "-n", "htdemucs",
        "-d", "cpu",
        "-j", "4",
        "--mp3",
        "--mp3-bitrate", "192",
        "-o", scratchDir,
        audioPath,
      ],
      { timeout: 30 * 60 * 1000 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`demucs failed: ${stderr || error.message}`));
        else resolve();
      }
    );
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function processOne(db, song) {
  const audioPath = path.join(AUDIO_DIR, song.normalizedAudioPath);
  try {
    await access(audioPath);
  } catch {
    console.warn(`[skip ${song.id}] normalized audio missing at ${audioPath}`);
    return;
  }

  if (await stemsExist(song.id)) {
    console.log(`[hit  ${song.id}] stems already on disk — marking ready`);
    await db.execute({
      sql: `UPDATE Song SET stemsState='ready', stemsErrorMessage=NULL, stemsCompletedAt=? WHERE id=?`,
      args: [nowIso(), song.id],
    });
    return;
  }

  console.log(`[run  ${song.id}] ${song.title}`);
  await db.execute({
    sql: `UPDATE Song SET stemsState='processing', stemsErrorMessage=NULL WHERE id=?`,
    args: [song.id],
  });

  const scratch = path.join(AUDIO_DIR, `.stems-tmp-${song.id}`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });

  try {
    await runDemucs(audioPath, scratch);
    const audioBase = path.basename(audioPath, path.extname(audioPath));
    const innerDir = path.join(scratch, "htdemucs", audioBase);
    for (const stem of STEM_NAMES) {
      await rename(
        path.join(innerDir, `${stem}.mp3`),
        path.join(AUDIO_DIR, stemFilename(song.id, stem))
      );
    }
    await rm(scratch, { recursive: true, force: true });
    await db.execute({
      sql: `UPDATE Song SET stemsState='ready', stemsErrorMessage=NULL, stemsCompletedAt=? WHERE id=?`,
      args: [nowIso(), song.id],
    });
    console.log(`[done ${song.id}]`);
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[fail ${song.id}] ${message}`);
    await db
      .execute({
        sql: `UPDATE Song SET stemsState='error', stemsErrorMessage=? WHERE id=?`,
        args: [message, song.id],
      })
      .catch(() => {});
  }
}

async function main() {
  const db = createClient({ url: `file:${DB_FILE}` });

  let interrupted = false;
  const onSig = () => {
    if (interrupted) {
      console.error("\nSecond SIGINT — exiting hard.");
      process.exit(130);
    }
    interrupted = true;
    console.error("\nSIGINT received — finishing in-flight song then exiting.");
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  await acquireLock();

  try {
    let sql;
    let argsList = [];
    if (ONLY) {
      sql = `SELECT id, title, normalizedAudioPath, stemsState FROM Song WHERE id=?`;
      argsList = [ONLY];
    } else if (INCLUDE_ERRORS) {
      sql = `SELECT id, title, normalizedAudioPath, stemsState FROM Song
             WHERE normalizedAudioPath IS NOT NULL
               AND processingStatus='ready'
               AND stemsState != 'ready'
             ORDER BY createdAt ASC`;
    } else {
      sql = `SELECT id, title, normalizedAudioPath, stemsState FROM Song
             WHERE normalizedAudioPath IS NOT NULL
               AND processingStatus='ready'
               AND stemsState IN ('pending', 'processing')
             ORDER BY createdAt ASC`;
    }
    const result = await db.execute({ sql, args: argsList });
    const songs = result.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      normalizedAudioPath: String(r.normalizedAudioPath),
      stemsState: String(r.stemsState),
    }));

    console.log(`Found ${songs.length} song(s) to backfill.`);
    if (DRY_RUN) {
      for (const s of songs) {
        console.log(`  [${s.stemsState}] ${s.id}  ${s.title}`);
      }
      return;
    }

    for (const song of songs) {
      if (interrupted) break;
      await processOne(db, song);
    }
  } finally {
    await releaseLock();
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  releaseLock().finally(() => process.exit(1));
});
