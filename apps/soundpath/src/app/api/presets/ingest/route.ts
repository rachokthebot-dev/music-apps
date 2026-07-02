/**
 * POST /api/presets/ingest
 *
 * Ingest endpoint for HelAIx (and any other external generator). HelAIx POSTs
 * a generated preset here after it builds it, so both apps feed one Library.
 * The .hlx is stored verbatim for re-download; reopening a cross-hardware
 * (Floor/Stomp) preset in SoundPath's LT-centric editor may need a guard —
 * see the known-edges note in the scope doc.
 *
 * body: {
 *   name: string,
 *   hlx: string,              // preset JSON, stored verbatim
 *   tones?, provider?, model?, hardwareTarget?, snapshots?, loudness?,
 *   flow?                     // defaults to "helaix"
 * }
 */

import { savePreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      hlx?: string;
      tones?: unknown;
      provider?: string;
      model?: string;
      hardwareTarget?: string;
      snapshots?: unknown;
      loudness?: unknown;
      flow?: string;
    };

    if (!body.hlx || typeof body.hlx !== "string") {
      return Response.json(
        { ok: false, error: "hlx (preset JSON string) is required" },
        { status: 400 }
      );
    }

    const saved = await savePreset({
      name: (body.name?.trim() || "HelAIx preset").slice(0, 120),
      sourceApp: "helaix",
      flow: body.flow?.trim() || "helaix",
      provider: body.provider ?? null,
      model: body.model ?? null,
      hardwareTarget: body.hardwareTarget ?? null,
      tones: body.tones ?? null,
      hlx: body.hlx,
      snapshots: body.snapshots ?? null,
      loudness: body.loudness ?? null,
    });

    return Response.json({ ok: true, id: saved.id });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
