/**
 * DELETE /api/setlist/[index] — drop one preset from a gig.
 *
 * Its readings go with it. The rest are renumbered so a preset's index stays
 * its Helix slot — the export packs presets in order, so a gap here would show
 * a slot number the file doesn't have.
 *
 * Confirmed versions are untouched: they rebuild from their own frozen
 * presets, so a file you already took to a gig keeps the song you dropped.
 */

import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ index: string }> }
) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const idx = Number((await params).index);
  const preset = setlist.presets.find((p) => p.index === idx);
  if (!preset) return Response.json({ ok: false, error: "No preset at that slot" }, { status: 404 });
  if (setlist.presets.length === 1) {
    return Response.json({ ok: false, error: "A setlist needs at least one preset" }, { status: 400 });
  }

  setlist.presets = setlist.presets
    .filter((p) => p !== preset)
    .map((p, i) => ({ ...p, index: i }));
  setlistDocs.write(setlist);
  return Response.json({ ok: true, removed: preset.name, count: setlist.presets.length });
}
