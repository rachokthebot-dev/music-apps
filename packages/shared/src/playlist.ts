// The shape every playlist source is reduced to before it reaches the YouTube
// matcher, plus the title scrubbing they all need. Apple and Spotify each have
// their own fetcher; nothing downstream knows which one a track came from.

export interface ParsedTrack {
  title: string;
  artist: string;
  /** Album-cut length. The strongest signal for telling a master from a
   *  live take or an extended upload, so it is worth carrying through. */
  durationSec: number | null;
}

export interface ParsedPlaylist {
  name: string;
  tracks: ParsedTrack[];
}

/**
 * Suffixes the streaming services append that hurt a YouTube search more than
 * they help. "[Extended Version]" and friends rarely match how a lesson video
 * is titled, and Spotify in particular hangs "- 2011 Remaster" off the title.
 */
export function cleanTitle(title: string): string {
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
