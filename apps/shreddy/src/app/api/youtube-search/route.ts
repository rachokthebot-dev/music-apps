import { NextResponse } from "next/server";
import { searchByQuery } from "@music-apps/shared/youtube-search";
import { readFile } from "fs/promises";
import { SETTINGS_FILE } from "@/lib/paths";

const DEFAULT_MAX_DURATION = 600; // 10 minutes — same cap the import enforces

async function getMaxDuration(): Promise<number> {
  try {
    const data = await readFile(SETTINGS_FILE, "utf-8");
    const settings = JSON.parse(data);
    return settings.youtubeMaxDuration ?? DEFAULT_MAX_DURATION;
  } catch {
    return DEFAULT_MAX_DURATION;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const candidates = await searchByQuery({
      query,
      // Shreddy practises to the recording itself, so lessons and covers are
      // the wrong kind of result here.
      lane: "track",
      maxDurationSec: await getMaxDuration(),
    });

    return NextResponse.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
