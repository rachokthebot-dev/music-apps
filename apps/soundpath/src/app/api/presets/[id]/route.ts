/**
 * GET    /api/presets/:id → full record including the .hlx payload
 * DELETE /api/presets/:id → drop it from the library
 *
 * Fed by /api/presets/ingest (HelAIx) and by past generations here. Only rows
 * in this table can be deleted: a patch that arrived inside a setlist belongs
 * to that gig, and removing it is the Setlists app's job.
 */

import { deletePreset, getPreset, serializePreset } from "@/lib/presetStore";

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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await deletePreset((await params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
