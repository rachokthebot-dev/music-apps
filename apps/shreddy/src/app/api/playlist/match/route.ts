import { NextResponse } from "next/server";
import type { ParsedTrack } from "@music-apps/shared/apple-music";
import { matchPlaylist, getMaxDuration } from "@/lib/playlist-import";

// A search per track, four at a time — a 50-track playlist needs the headroom.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tracks: ParsedTrack[] = Array.isArray(body?.tracks) ? body.tracks : [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks are required" }, { status: 400 });
    }

    return NextResponse.json({
      rows: await matchPlaylist(tracks),
      maxDurationSec: await getMaxDuration(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Match failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
