/**
 * POST /api/match-song
 * body: { song: string, artist: string, targetSnapshotIndex: number }
 *
 * Returns the LLM's proposed tone-match without applying it. The user
 * confirms in the UI, then POSTs to /api/match-song/apply.
 */

import { readActiveMaster } from "@/lib/masterStore";
import { callGemini } from "@/lib/matchSong";
import type { LlmProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      song?: string;
      artist?: string;
      targetSnapshotIndex?: number;
      provider?: LlmProvider;
    };
    if (!body.song || !body.artist) {
      return Response.json(
        { ok: false, error: "song and artist are required" },
        { status: 400 }
      );
    }
    const idx = body.targetSnapshotIndex;
    if (typeof idx !== "number" || idx < 0 || idx > 7) {
      return Response.json(
        { ok: false, error: "targetSnapshotIndex must be 0..7" },
        { status: 400 }
      );
    }

    const preset = readActiveMaster();
    const result = await callGemini(preset, {
      song: body.song,
      artist: body.artist,
      targetSnapshotIndex: idx,
      provider: body.provider,
    });

    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
