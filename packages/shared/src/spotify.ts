import { cleanTitle, type ParsedPlaylist, type ParsedTrack } from "./playlist";

export type { ParsedPlaylist, ParsedTrack };

/**
 * Spotify playlist links, in the three forms you can end up with:
 *   https://open.spotify.com/playlist/<id>?si=…      (Copy link)
 *   https://open.spotify.com/intl-de/playlist/<id>   (localized web player)
 *   spotify:playlist:<id>                            (Copy Spotify URI)
 */
const PLAYLIST_URL =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,}(?:-[a-z]{2,})?\/)?playlist\/([A-Za-z0-9]+)/i;
const PLAYLIST_URI = /^spotify:playlist:([A-Za-z0-9]+)$/i;

export function isSpotifyPlaylistUrl(url: string): boolean {
  return playlistId(url) !== null;
}

export function playlistId(url: string): string | null {
  const trimmed = url.trim();
  const m = trimmed.match(PLAYLIST_URL) ?? trimmed.match(PLAYLIST_URI);
  return m ? m[1] : null;
}

/** The embed page states track length in milliseconds. */
function parseMsDuration(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw / 1000);
}

/**
 * Spotify lists every artist on a track — "Santana, Rob Thomas". Only the
 * first one goes into the YouTube search, the same as Apple's first
 * subtitle link: a featured name mostly pushes the match toward a remix.
 * The separator is a non-breaking space, so normalize before splitting.
 */
function primaryArtist(subtitle: unknown): string {
  if (typeof subtitle !== "string") return "";
  return subtitle.replace(/ /g, " ").split(",")[0].trim();
}

interface EmbedTrack {
  title?: unknown;
  subtitle?: unknown;
  duration?: unknown;
}

/**
 * Pull the track list out of a public Spotify playlist.
 *
 * Reads the player's own embed page, which ships the playlist as JSON in a
 * `__NEXT_DATA__` block and needs no API credentials — unlike the Web API,
 * which would mean registering an app and storing a client secret for a
 * read anyone can do in a browser.
 *
 * The embed carries the tracks the player loads up front (around 100), so a
 * very long playlist arrives truncated rather than failing.
 */
export async function fetchSpotifyPlaylist(url: string): Promise<ParsedPlaylist> {
  const id = playlistId(url);
  if (!id) throw new Error("That doesn't look like a Spotify playlist link");

  const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Spotify returned ${res.status}`);
  const html = await res.text();

  const m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) throw new Error("Could not read a track list from that playlist page");

  let entity: { name?: unknown; trackList?: unknown };
  try {
    const data = JSON.parse(m[1]);
    entity = data?.props?.pageProps?.state?.data?.entity ?? {};
  } catch {
    throw new Error("Could not read a track list from that playlist page");
  }

  const rows = Array.isArray(entity.trackList) ? (entity.trackList as EmbedTrack[]) : [];
  const tracks: ParsedTrack[] = rows
    .map((t) => ({
      title: cleanTitle(String(t?.title ?? "")),
      artist: primaryArtist(t?.subtitle),
      durationSec: parseMsDuration(t?.duration),
    }))
    .filter((t) => t.title);

  if (tracks.length === 0) {
    // A private or unlisted playlist still renders an embed page — it just
    // comes back empty, so say what to do about it.
    throw new Error("That playlist is empty or not public");
  }

  return { name: String(entity.name ?? "Imported playlist"), tracks };
}
