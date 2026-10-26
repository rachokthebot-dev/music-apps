import { readFile } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { searchCandidates, type Candidate } from "@music-apps/shared/youtube-search";
import type { ParsedTrack } from "@music-apps/shared/apple-music";
import { prisma } from "./prisma";
import { SETTINGS_FILE } from "./paths";
import { downloadAndProcess } from "./youtube-download";

const DEFAULT_MAX_DURATION = 600; // 10 minutes — the same cap a single import enforces

// Matching is cheap (~1.2 s per track) but each search spawns a yt-dlp process,
// so a 50-track playlist must not fire 50 at once.
const MATCH_CONCURRENCY = 4;

// Below this the top candidate is a guess, not a match. Calibrated against the
// scorer: a title hit alone is +3, and anything worth auto-selecting also has
// an artist, channel or length signal behind it.
const CONFIDENT_SCORE = 6;

export async function getMaxDuration(): Promise<number> {
  try {
    const settings = JSON.parse(await readFile(SETTINGS_FILE, "utf-8"));
    return settings.youtubeMaxDuration ?? DEFAULT_MAX_DURATION;
  } catch {
    return DEFAULT_MAX_DURATION;
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export interface MatchRow {
  title: string;
  artist: string;
  durationSec: number | null;
  /** Ranked, best first. Empty when YouTube returned nothing usable. */
  candidates: Candidate[];
  /** True when the best candidate is strong enough to import unreviewed. */
  confident: boolean;
  /** Already in the library — preselected as a skip rather than a duplicate. */
  existingId: string | null;
}

/**
 * A song you already own doesn't need downloading again. Loose containment,
 * because an imported title carries the uploader's extra words.
 */
export function findExisting(
  songs: Array<{ id: string; title: string; artist: string }>,
  track: ParsedTrack
): string | null {
  const t = norm(track.title);
  const a = norm(track.artist);
  if (!t) return null;
  const hit = songs.find((s) => {
    const st = norm(s.title);
    if (!st.includes(t) && !t.includes(st)) return false;
    // Titles collide across bands, so an artist on both sides must agree.
    return !a || !norm(s.artist) || norm(s.artist).includes(a) || a.includes(norm(s.artist));
  });
  return hit?.id ?? null;
}

/** Run `worker` over `items` with a fixed number in flight, preserving order. */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

/**
 * Apply the import cap, then decide whether the winner is safe to auto-select.
 *
 * Over-cap results are demoted rather than dropped, so a missing obvious match
 * is explained rather than silently absent — but they can never be imported,
 * so they must never end up as the pick.
 */
export function rankCandidates(
  candidates: Candidate[],
  maxDurationSec: number
): { candidates: Candidate[]; confident: boolean } {
  for (const c of candidates) {
    if (c.durationSec !== null && c.durationSec > maxDurationSec) {
      c.tooLong = true;
      c.score -= 100;
    }
  }
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  return {
    candidates: sorted,
    confident: Boolean(top) && !top.tooLong && top.score >= CONFIDENT_SCORE,
  };
}

/**
 * Find the best YouTube track for every song in the playlist.
 *
 * The playlist's track length is passed through as `expectedSec` — it is the
 * scorer's sharpest tool, and the main thing keeping a ten-minute live upload
 * from winning a slot the album cut should have.
 */
export async function matchPlaylist(tracks: ParsedTrack[]): Promise<MatchRow[]> {
  const maxDuration = await getMaxDuration();
  const library = await prisma.song.findMany({ select: { id: true, title: true, artist: true } });

  return mapWithLimit(tracks, MATCH_CONCURRENCY, async (track) => {
    let candidates: Candidate[] = [];
    try {
      candidates = await searchCandidates({
        title: track.title,
        artist: track.artist,
        lane: "track",
        expectedSec: track.durationSec,
      });
    } catch {
      // One failed search shouldn't sink the whole playlist — the row simply
      // arrives with nothing to pick, and you can search it by hand.
    }

    const ranked = rankCandidates(candidates, maxDuration);
    return {
      title: track.title,
      artist: track.artist,
      durationSec: track.durationSec,
      candidates: ranked.candidates,
      confident: ranked.confident,
      existingId: findExisting(library, track),
    };
  });
}

/** Reuse a folder of the same name rather than piling up duplicates on re-runs. */
async function ensureFolder(name: string): Promise<string> {
  // SQLite has no case-insensitive `equals` through Prisma, so the comparison
  // happens here — re-importing "Road Trip" must not sit beside "road trip".
  const folders = await prisma.folder.findMany({ select: { id: true, name: true } });
  const existing = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;

  const last = await prisma.folder.findFirst({ orderBy: { orderIndex: "desc" } });
  const folder = await prisma.folder.create({
    data: { name, orderIndex: (last?.orderIndex ?? -1) + 1 },
  });
  return folder.id;
}

export interface Pick {
  title: string;
  artist: string;
  /** The video to download. Absent when the pick is a song already in the library. */
  url?: string;
  /** A library song to file into the folder as-is — no download, no analysis. */
  existingId?: string;
}

/**
 * Queue a whole playlist.
 *
 * Every song row is created up front, filed into the folder and left pending,
 * so the library shows the full playlist filling in from the first second —
 * and a reload mid-run loses nothing, because the progress lives in the rows
 * rather than in memory. Downloads then run one at a time: each one is a
 * yt-dlp fetch plus ffmpeg plus analysis, and running them together starves
 * them all.
 *
 * Songs you already own are filed into the folder too, in playlist order, so
 * the folder mirrors the whole playlist rather than just its new arrivals.
 */
export async function importPlaylist(
  name: string,
  picks: Pick[]
): Promise<{ folderId: string; songIds: string[]; linked: number }> {
  const folderId = await ensureFolder(name);

  // A song deleted between review and import is dropped, not linked to nothing.
  const wanted = picks.flatMap((p) => (p.existingId ? [p.existingId] : []));
  const present = new Set(
    (await prisma.song.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map(
      (s) => s.id
    )
  );

  // Upsert: re-importing into the same folder just re-orders it.
  const links = picks.flatMap((pick, i) =>
    pick.existingId && present.has(pick.existingId)
      ? [
          prisma.songFolder.upsert({
            where: { songId_folderId: { songId: pick.existingId, folderId } },
            create: { songId: pick.existingId, folderId, orderIndex: i },
            update: { orderIndex: i },
          }),
        ]
      : []
  );
  const queued = picks.flatMap((pick, i) =>
    !pick.existingId && pick.url ? [{ id: uuidv4(), url: pick.url, i }] : []
  );

  await prisma.$transaction([
    // A re-run into an existing folder still counts as a change to it.
    prisma.folder.update({ where: { id: folderId }, data: { updatedAt: new Date() } }),
    ...links,
    ...queued.map(({ id, url, i }) =>
      prisma.song.create({
        data: {
          id,
          // Named from the playlist, not from the video, so the library never
          // shows "ELO- Evil Woman (Official Video)".
          title: picks[i].title,
          artist: picks[i].artist,
          originalFilename: url,
          originalFilePath: "",
          mimeType: "audio/mpeg",
          processingStatus: "pending",
          importJob: { create: { status: "pending", progressMessage: "Queued" } },
          folders: { create: { folderId, orderIndex: i } },
        },
      })
    ),
  ]);

  void runQueue(queued);

  return { folderId, songIds: queued.map((q) => q.id), linked: links.length };
}

async function runQueue(queued: Array<{ id: string; url: string }>): Promise<void> {
  for (const { id, url } of queued) {
    try {
      // downloadAndProcess writes its own failures to the song and job rows, so
      // a bad video doesn't stop the songs queued behind it. The guard here is
      // for the row going missing instead — deleting a queued song from the
      // library mid-run must not strand the rest of the playlist.
      await downloadAndProcess(id, url);
    } catch {
      // nothing left to record it against; move on to the next song
    }
  }
}
