/**
 * GET /api/presets/:id → full record including the .hlx payload
 *
 * Read-only: the library is fed by /api/presets/ingest (HelAIx) and consumed
 * by the import picker; management (rename/favorite/delete) was removed with
 * the library UI.
 */

import { getPreset, serializePreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await getPreset(id);
    if (!row) {
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return Response.json({ ok: true, preset: serializePreset(row, true) });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
