import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { downloadPreset, toneIdFromUrl } from "./tonecloud";
import { parseSnapshots } from "./preset-snapshots";
import { findExisting } from "./existing-library";

const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

const LICKBANK = process.env.LICKBANK_URL ?? "http://127.0.0.1:3001/lickbank";
const SHREDDY = process.env.SHREDDY_URL ?? "http://127.0.0.1:3000/shreddy";

export interface RunState {
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  currentTitle?: string;
  message?: string;
  log: string[];
}

// Per-setlist, in memory. A lost run state is recoverable — the songs carry
// their own lickbankSourceId/shreddySongId, so progress is never guessed.
const runs = new Map<string, RunState>();

export function getRun(setlistId: string): RunState | null {
  return runs.get(setlistId) ?? null;
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(data?.error ?? res.status));
    return data as Record<string, unknown>;
  } catch (err) {
    throw err instanceof Error ? err : new Error("request failed");
  }
}

/** Reuse a folder of the same name rather than piling up duplicates on re-runs. */
async function ensureFolder(base: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/api/folders`, { signal: AbortSignal.timeout(8000) });
    const folders = (await res.json()) as Array<{ id: string; name: string }>;
    const hit = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
  } catch {
    // fall through and try to create
  }
  try {
    const made = await postJson(`${base}/api/folders`, { name });
    return typeof made?.id === "string" ? made.id : null;
  } catch {
    return null;
  }
}

/**
 * Add to a folder without evicting it from others. Both apps treat folderIds as
 * the complete set, so sending just the setlist folder would unfile a song from
 * wherever it already lived.
 */
async function assignFolder(
  base: string,
  path: string,
  id: string,
  folderId: string,
  existingFolderIds: string[] = []
) {
  const merged = Array.from(new Set([...existingFolderIds, folderId]));
  await fetch(`${base}/api/${path}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderIds: merged }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}

/**
 * Import every chosen video into LickBank and Shreddy, one song at a time.
 *
 * Sequential on purpose: each import downloads a video and runs ffmpeg, and
 * running five at once on this machine starves them all — the same failure that
 * made LickBank's analysis look broken.
 */
export async function runSetlist(setlistId: string): Promise<void> {
  const existing = runs.get(setlistId);
  if (existing?.status === "running") return;

  const setlist = await prisma.setlist.findUnique({
    where: { id: setlistId },
    include: { songs: { orderBy: { orderIndex: "asc" } } },
  });
  if (!setlist) return;

  const state: RunState = {
    status: "running",
    total: setlist.songs.length,
    completed: 0,
    log: [],
  };
  runs.set(setlistId, state);

  try {
    const lbFolder = await ensureFolder(LICKBANK, setlist.name);
    const shFolder = await ensureFolder(SHREDDY, setlist.name);
    state.log.push(`Folders ready: LickBank ${lbFolder ? "✓" : "✗"}, Shreddy ${shFolder ? "✓" : "✗"}`);

    for (const song of setlist.songs) {
      state.currentTitle = song.title;
      await prisma.setlistSong.update({
        where: { id: song.id },
        data: { importStatus: "running", importError: null },
      });

      const errors: string[] = [];

      // A song already in the library doesn't need importing — but it does need
      // linking and filing, or the setlist shows "—" for something you own.
      if (!song.lickbankSourceId) {
        const hits = await findExisting(song.title, song.artist, "lesson");
        if (hits.length > 0) {
          await prisma.setlistSong.update({
            where: { id: song.id },
            data: { lickbankSourceId: hits[0].id },
          });
          if (lbFolder) await assignFolder(LICKBANK, "sources", hits[0].id, lbFolder, hits[0].folderIds);
          state.log.push(`LickBank ↔ ${song.title} (already there)`);
          song.lickbankSourceId = hits[0].id;
        }
      }
      if (!song.shreddySongId) {
        const hits = await findExisting(song.title, song.artist, "track");
        if (hits.length > 0) {
          await prisma.setlistSong.update({
            where: { id: song.id },
            data: { shreddySongId: hits[0].id },
          });
          if (shFolder) await assignFolder(SHREDDY, "songs", hits[0].id, shFolder, hits[0].folderIds);
          state.log.push(`Shreddy ↔ ${song.title} (already there)`);
          song.shreddySongId = hits[0].id;
        }
      }

      if (song.lickbankVideoUrl && !song.lickbankSourceId) {
        try {
          const r = await postJson(`${LICKBANK}/api/import/youtube`, { url: song.lickbankVideoUrl });
          const sourceId = typeof r?.id === "string" ? r.id : (r?.source as { id?: string })?.id;
          if (sourceId) {
            await prisma.setlistSong.update({
              where: { id: song.id },
              data: { lickbankSourceId: sourceId },
            });
            if (lbFolder) await assignFolder(LICKBANK, "sources", sourceId, lbFolder);
            state.log.push(`LickBank ← ${song.title}`);
          } else {
            errors.push("LickBank returned no source id");
          }
        } catch (e) {
          errors.push(`LickBank: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      if (song.shreddyVideoUrl && !song.shreddySongId) {
        try {
          const r = await postJson(`${SHREDDY}/api/import/youtube`, {
            url: song.shreddyVideoUrl,
            analyzeSections: true,
          });
          const songId =
            typeof r?.id === "string" ? r.id : (r?.song as { id?: string })?.id;
          if (songId) {
            await prisma.setlistSong.update({
              where: { id: song.id },
              data: { shreddySongId: songId },
            });
            if (shFolder) await assignFolder(SHREDDY, "songs", songId, shFolder);
            // Shreddy names the song after the video ("ELO- Evil Woman
            // (Official Video)"). The setlist already knows the real title and
            // artist, so use those instead.
            await fetch(`${SHREDDY}/api/songs/${songId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: song.title, artist: song.artist }),
              signal: AbortSignal.timeout(15000),
            }).catch(() => {});
            state.log.push(`Shreddy ← ${song.title}`);
          } else {
            errors.push("Shreddy returned no song id");
          }
        } catch (e) {
          errors.push(`Shreddy: ${e instanceof Error ? e.message : "failed"}`);
        }
      }

      // Choosing a preset only records a URL — without this the .hls export
      // would be empty and the levels step would have no snapshots.
      if (song.presetUrl && !song.presetPath) {
        const toneId = toneIdFromUrl(song.presetUrl);
        if (!toneId) {
          errors.push("Preset URL has no tone id");
        } else {
          try {
            const preset = await downloadPreset(toneId);
            const snaps = parseSnapshots(preset);
            if (snaps.length === 0) {
              throw new Error("no snapshots — can't be levelled, choose another preset");
            }
            await mkdir(PRESET_DIR, { recursive: true });
            const filename = `${song.id}.hlx`;
            await writeFile(path.join(PRESET_DIR, filename), JSON.stringify(preset));
            const meta = (preset as { data?: { meta?: { name?: string } } })?.data?.meta;
            await prisma.$transaction([
              prisma.presetSnapshot.deleteMany({ where: { songId: song.id } }),
              prisma.presetSnapshot.createMany({
                data: snaps.map((s) => ({
                  songId: song.id,
                  index: s.index,
                  name: s.name,
                  role: s.role,
                  roleSource: s.roleSource,
                })),
              }),
              prisma.setlistSong.update({
                where: { id: song.id },
                data: { presetPath: filename, presetName: meta?.name ?? song.presetName },
              }),
            ]);
            state.log.push(`Preset ← ${meta?.name ?? song.title} (${snaps.length} snapshots)`);
          } catch (e) {
            errors.push(`Preset: ${e instanceof Error ? e.message : "download failed"}`);
          }
        }
      }

      await prisma.setlistSong.update({
        where: { id: song.id },
        data: {
          importStatus: errors.length > 0 ? "error" : "done",
          importError: errors.length > 0 ? errors.join("; ") : null,
        },
      });
      if (errors.length > 0) state.log.push(`⚠ ${song.title}: ${errors.join("; ")}`);

      state.completed += 1;
    }

    state.status = "done";
    state.currentTitle = undefined;
  } catch (err) {
    state.status = "error";
    state.message = err instanceof Error ? err.message : "Run failed";
  }
}
