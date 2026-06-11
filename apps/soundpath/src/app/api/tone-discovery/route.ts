/**
 * POST /api/tone-discovery
 * body: { vibe: string, targetSnapshotIndex: number }
 *
 * Returns the LLM's chosen song + dialed-in tone settings for the requested
 * vibe. Same shape as Match Song but with an additional whyThisExemplar field.
 */

import { readActiveMaster } from "@/lib/masterStore";
import { discoverTone } from "@/lib/toneDiscovery";
import type { LlmProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      vibe?: string;
      targetSnapshotIndex?: number;
      provider?: LlmProvider;
    };
    if (!body.vibe || !body.vibe.trim()) {
      return Response.json({ ok: false, error: "vibe description is required" }, { status: 400 });
    }
    const idx = body.targetSnapshotIndex;
    if (typeof idx !== "number" || idx < 0 || idx > 7) {
      return Response.json({ ok: false, error: "targetSnapshotIndex must be 0..7" }, { status: 400 });
    }

    const preset = readActiveMaster();
    const result = await discoverTone(preset, {
      vibe: body.vibe.trim(),
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
