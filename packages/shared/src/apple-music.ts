import { cleanTitle, type ParsedPlaylist, type ParsedTrack } from "./playlist";

// Re-exported so a caller that already speaks Apple doesn't need a second
// import for the shape it gets back.
export type { ParsedPlaylist, ParsedTrack };

/** Apple Music playlist URLs look like /playlist/<slug>/pl.<id>. */
export function isApplePlaylistUrl(url: string): boolean {
  return /^https?:\/\/music\.apple\.com\/[^/]+\/playlist\//.test(url.trim());
}

/** ld+json states length as an ISO 8601 duration: "PT3M57S". */
function parseIsoDuration(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return sec > 0 ? sec : null;
}

/** serialized-server-data states it in milliseconds. */
function parseMsDuration(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw / 1000);
}

/**
 * Pull the track list out of a public Apple Music playlist page.
 *
 * Two shapes exist and both are needed: Apple-curated playlists ship a
 * schema.org `ld+json` block with a `track` array, while user playlists don't —
 * their data is in a `serialized-server-data` script instead. Neither needs
 * credentials.
 */
export async function fetchApplePlaylist(url: string): Promise<ParsedPlaylist> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Apple Music returned ${res.status}`);
  const html = await res.text();

  // serialized-server-data first: it carries the artist per row, while the
  // ld+json block leaves byArtist null on Apple-curated playlists — and a
  // YouTube search without the artist finds the wrong song.
  const fromServer = parseServerData(html);
  if (fromServer && fromServer.tracks.length > 0) return fromServer;

  const fromLd = parseLdJson(html);
  if (fromLd && fromLd.tracks.length > 0) return fromLd;

  throw new Error("Could not read a track list from that playlist page");
}

function parseLdJson(html: string): ParsedPlaylist | null {
  const m = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    const raw = Array.isArray(d?.track) ? d.track : [];
    return {
      name: String(d?.name ?? "Imported playlist"),
      tracks: raw
        .map((t: { name?: string; byArtist?: { name?: string } | string; duration?: unknown }) => ({
          title: cleanTitle(String(t?.name ?? "")),
          artist:
            typeof t?.byArtist === "object" ? String(t.byArtist?.name ?? "") : String(t?.byArtist ?? ""),
          durationSec: parseIsoDuration(t?.duration),
        }))
        .filter((t: ParsedTrack) => t.title),
    };
  } catch {
    return null;
  }
}

function parseServerData(html: string): ParsedPlaylist | null {
  const m = html.match(
    /<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/
  );
  if (!m) return null;

  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }

  // Track rows are the nodes carrying both a title and a subtitle link (the
  // artist). Walking for that shape is sturdier than guessing at Apple's
  // container keys, which change without notice.
  const found: ParsedTrack[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const links = o.subtitleLinks;
    if (typeof o.title === "string" && Array.isArray(links) && links.length > 0) {
      const first = links[0] as { title?: string };
      found.push({
        title: String(o.title),
        artist: String(first?.title ?? ""),
        durationSec: parseMsDuration(o.duration),
      });
    }
    Object.values(o).forEach(walk);
  };
  walk(data);

  // The playlist's own header row matches the same shape — it appears first and
  // its "artist" is the curator, so drop it rather than importing the playlist
  // as a song.
  const name = extractName(html) ?? "Imported playlist";
  const deduped: ParsedTrack[] = [];
  const seen = new Set<string>();
  for (const t of found) {
    const key = `${t.title}|${t.artist}`.toLowerCase();
    if (seen.has(key)) continue;
    if (t.title.toLowerCase() === name.toLowerCase()) continue;
    seen.add(key);
    deduped.push({ title: cleanTitle(t.title), artist: t.artist, durationSec: t.durationSec });
  }

  return { name, tracks: deduped.filter((t) => t.title) };
}

/**
 * Apple titles its playlist pages "<name> by <curator> on Apple Music". Both
 * tails have to come off: the name is shown to the user, and it's also what
 * identifies the header row so it isn't imported as a song.
 */
function stripAppleSuffix(raw: string): string {
  return raw
    .replace(/\s+by\s+.+?\s+on\s+Apple Music\s*$/i, "")
    .replace(/\s*[-–—]\s*Apple Music\s*$/i, "")
    .replace(/\s+on\s+Apple Music\s*$/i, "")
    .trim();
}

function extractName(html: string): string | null {
  const og = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (og) return stripAppleSuffix(og[1]);
  const title = html.match(/<title>([^<]+)<\/title>/);
  return title ? stripAppleSuffix(title[1]) : null;
}
