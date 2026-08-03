import { NextResponse } from "next/server";
import { searchCandidates, type Lane } from "@/lib/youtube-search";
import { findExisting } from "@/lib/existing-library";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const lane: Lane = body?.lane === "track" ? "track" : "lesson";

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Cheap and worth doing first: a song already imported doesn't need a
    // 500 MB re-download, so surface it alongside the search results.
    const [existing, candidates] = await Promise.all([
      findExisting(title, artist, lane),
      searchCandidates({
        title,
        artist,
        lane,
        expectedSec: typeof body?.expectedSec === "number" ? body.expectedSec : null,
      }),
    ]);

    return NextResponse.json({ existing, candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
