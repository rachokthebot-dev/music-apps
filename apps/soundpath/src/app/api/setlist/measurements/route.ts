/** DELETE /api/setlist/measurements — clear every reading in one setlist. */

import { clearReadings } from "@/lib/levelActions";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const r = clearReadings(setlistDocs, setlist);
  return Response.json(r.body, { status: r.status });
}
