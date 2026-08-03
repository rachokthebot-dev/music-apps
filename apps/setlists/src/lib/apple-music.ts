export interface ParsedTrack {
  title: string;
  artist: string;
}

export interface ParsedPlaylist {
  name: string;
  tracks: ParsedTrack[];
}

/** Apple Music playlist URLs look like /playlist/<slug>/pl.<id>. */
export function isApplePlaylistUrl(url: string): boolean {
  return /^https?:\/\/music\.apple\.com\/[^/]+\/playlist\//.test(url.trim());
}

/**
 * Suffixes Apple appends that hurt a YouTube search more than they help.
 * "[Extended Version]" and friends rarely match how a lesson video is titled.
 */
function cleanTitle(title: string): string {
  return (
    title
      // A year often precedes the keyword — "(2012 Remaster)" — so allow it
      // rather than anchoring the keyword to the bracket.
      .replace(
        /\s*[[(][^\])]*\b(?:extended|remaster(?:ed)?|deluxe|single|album version|radio edit|mono|stereo|bonus|anniversary)\b[^\])]*[\])]/gi,
        ""
      )
      .replace(/\s*-\s*(?:\d{4}\s+)?(?:remaster(?:ed)?|single|radio edit)[^-]*$/i, "")
      .trim()
  );
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
        .map((t: { name?: string; byArtist?: { name?: string } | string }) => ({
          title: cleanTitle(String(t?.name ?? "")),
          artist:
            typeof t?.byArtist === "object" ? String(t.byArtist?.name ?? "") : String(t?.byArtist ?? ""),
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
      found.push({ title: String(o.title), artist: String(first?.title ?? "") });
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
    deduped.push({ title: cleanTitle(t.title), artist: t.artist });
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
