import { NextResponse } from "next/server";
import { fetchApplePlaylist, isApplePlaylistUrl } from "@music-apps/shared/apple-music";
import { fetchSpotifyPlaylist, isSpotifyPlaylistUrl } from "@music-apps/shared/spotify";

/**
 * Read a playlist without importing anything — the review step shows the
 * parsed tracks first, so a bad parse is caught before anything downloads.
 *
 * Apple and Spotify links both land here and reduce to the same shape; the
 * rest of the import pipeline never learns which service a track came from.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    if (isApplePlaylistUrl(url)) {
      return NextResponse.json(await fetchApplePlaylist(url));
    }
    if (isSpotifyPlaylistUrl(url)) {
      return NextResponse.json(await fetchSpotifyPlaylist(url));
    }

    return NextResponse.json(
      { error: "That doesn't look like an Apple Music or Spotify playlist link" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read playlist";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
