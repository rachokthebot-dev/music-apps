import { NextResponse } from "next/server";
import { importPlaylist, type Pick } from "@/lib/playlist-import";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const picks: Pick[] = Array.isArray(body?.picks) ? body.picks : [];

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const valid = picks.filter(
      (p) =>
        p &&
        typeof p.title === "string" &&
        p.title &&
        ((typeof p.url === "string" && p.url) || (typeof p.existingId === "string" && p.existingId))
    );
    if (valid.length === 0) {
      return NextResponse.json({ error: "Nothing selected to import" }, { status: 400 });
    }

    const result = await importPlaylist(name, valid);
    return NextResponse.json({ ...result, queued: result.songIds.length }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
