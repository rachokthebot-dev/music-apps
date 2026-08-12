import { NextResponse } from "next/server";
import { searchByQuery } from "@music-apps/shared/youtube-search";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Sources are what you clip licks out of, so lesson videos win — and the
    // chapter check matters, since chapters become sections on import.
    const candidates = await searchByQuery({ query, lane: "lesson" });

    return NextResponse.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
