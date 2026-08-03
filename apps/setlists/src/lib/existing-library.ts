import type { Lane } from "./youtube-search";

/**
 * The sibling apps own their own databases, so we ask them over HTTP rather
 * than reaching into their SQLite files — their schemas are theirs to change.
 */
const LICKBANK = process.env.LICKBANK_URL ?? "http://127.0.0.1:3001/lickbank";
const SHREDDY = process.env.SHREDDY_URL ?? "http://127.0.0.1:3000/shreddy";

export interface ExistingItem {
  app: "lickbank" | "shreddy";
  id: string;
  title: string;
  url: string;
  sectionCount?: number;
  /** Folders it already belongs to — appended to, never replaced. */
  folderIds?: string[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Loose containment — imported titles carry the uploader's extra words. */
function looksLikeMatch(candidateTitle: string, song: string): boolean {
  const a = norm(candidateTitle);
  const b = norm(song);
  return Boolean(b) && a.includes(b);
}

/** Both apps expose membership as folders[].folderId on the list endpoints. */
function folderIdsOf(row: unknown): string[] {
  const f = (row as { folders?: Array<{ folderId?: string }> })?.folders;
  return Array.isArray(f) ? f.map((x) => x?.folderId).filter((x): x is string => Boolean(x)) : [];
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // The sibling app may simply not be running — that's not an error here.
    return null;
  }
}

/**
 * Already-imported songs, so the wizard can offer to reuse them. Returns []
 * when the other app is down; skipping the shortcut is better than failing
 * the whole search.
 */
export async function findExisting(
  title: string,
  artist: string,
  lane: Lane
): Promise<ExistingItem[]> {
  const out: ExistingItem[] = [];

  if (lane === "lesson") {
    const data = await getJson(`${LICKBANK}/api/sources`);
    if (Array.isArray(data)) {
      for (const s of data as Array<{ id?: string; title?: string; folders?: unknown }>) {
        if (s?.id && s?.title && looksLikeMatch(s.title, title)) {
          out.push({
            app: "lickbank",
            id: s.id,
            title: s.title,
            url: `${LICKBANK}/sources/${s.id}`,
            folderIds: folderIdsOf(s),
          });
        }
      }
    }
  } else {
    const data = await getJson(`${SHREDDY}/api/songs`);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { songs?: unknown })?.songs)
        ? (data as { songs: unknown[] }).songs
        : [];
    for (const s of rows as Array<{ id?: string; title?: string; folders?: unknown }>) {
      if (s?.id && s?.title && looksLikeMatch(s.title, title)) {
        out.push({
          app: "shreddy",
          id: s.id,
          title: s.title,
          url: `${SHREDDY}/songs/${s.id}`,
          folderIds: folderIdsOf(s),
        });
      }
    }
  }

  void artist;
  return out;
}
