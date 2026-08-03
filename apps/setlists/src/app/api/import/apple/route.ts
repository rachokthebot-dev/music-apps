import { NextResponse } from "next/server";
import { fetchApplePlaylist, isApplePlaylistUrl } from "@/lib/apple-music";

/**
 * Preview a playlist without saving anything — the wizard shows the parsed
 * tracks first so a bad parse is caught before it becomes a setlist.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    if (!isApplePlaylistUrl(url)) {
      return NextResponse.json(
        { error: "That doesn't look like an Apple Music playlist link" },
        { status: 400 }
      );
    }

    const playlist = await fetchApplePlaylist(url);
    return NextResponse.json(playlist);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read playlist";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
