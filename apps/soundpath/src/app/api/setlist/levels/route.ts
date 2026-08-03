/**
 * PATCH /api/setlist/levels — the offsets every preset targets, and the trim the
 * recordings were made through.
 */

import { setLevels } from "@/lib/levelActions";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = setLevels(setlistDocs, setlist, body);
  return Response.json(r.body, { status: r.status });
}
