/**
 * PATCH /api/setlist/[index]/arrange — reorder or delete a preset's snapshots.
 *
 * Body: { order: number[] }, the snapshot indices in their new order; any left
 * out are deleted. See snapshotEdit for what happens to the payload.
 */

import { rearrangeSnapshots } from "@/lib/snapshotEdit";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ index: string }> }
) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const idx = Number((await params).index);
  const at = setlist.presets.findIndex((p) => p.index === idx);
  if (at < 0) return Response.json({ ok: false, error: "No preset at that slot" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { order?: unknown };
  const order = Array.isArray(body.order) ? body.order.map(Number) : [];
  const r = rearrangeSnapshots(setlist.presets[at], order);
  if (!r.ok) return Response.json(r, { status: 400 });

  setlist.presets[at] = r.preset;
  setlistDocs.write(setlist);
  return Response.json({ ok: true, snapshots: r.preset.snapshots });
}
