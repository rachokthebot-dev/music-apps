import { NextResponse } from "next/server";
import { matchPresets } from "@/lib/helix-match";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";

    if (!title && !artist) {
      return NextResponse.json({ error: "title or artist is required" }, { status: 400 });
    }

    const matches = await matchPresets(title, artist);
    return NextResponse.json({ matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preset match failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
