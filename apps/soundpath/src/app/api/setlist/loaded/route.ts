/** PUT /api/setlist/loaded — declare which version is on the Helix right now. */

import { setLoaded } from "@/lib/levelActions";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const body = (await req.json()) as { version?: number | null; offsetDb?: number };
  const r = setLoaded(setlistDocs, setlist, body);
  return Response.json(r.body, { status: r.status });
}
