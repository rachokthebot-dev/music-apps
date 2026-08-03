/** PUT /api/level/loaded — declare which version of this preset is on the Helix. */

import { setLoaded } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const body = (await req.json()) as { version?: number | null; offsetDb?: number };
  const r = setLoaded(presetDocs, doc, body);
  return Response.json(r.body, { status: r.status });
}
