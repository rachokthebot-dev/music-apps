/**
 * PATCH /api/setlist/order — reorder a gig's presets.
 *
 * Body: { order: number[] }, every preset index in its new order. Indices are
 * renumbered to match, since a preset's index is its Helix slot. Readings and
 * versions are keyed by hash, so nothing is lost.
 */

import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { order?: unknown };
  const order = Array.isArray(body.order) ? body.order.map(Number) : [];
  const byIndex = new Map(setlist.presets.map((p) => [p.index, p]));
  if (order.length !== byIndex.size || new Set(order).size !== order.length || order.some((i) => !byIndex.has(i))) {
    return Response.json({ ok: false, error: "That order doesn't match this setlist" }, { status: 400 });
  }

  setlist.presets = order.map((i, slot) => ({ ...byIndex.get(i)!, index: slot }));
  setlistDocs.write(setlist);
  return Response.json({ ok: true });
}
