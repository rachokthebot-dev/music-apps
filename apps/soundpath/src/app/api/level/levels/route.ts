/** PATCH /api/level/levels — the offsets each role targets for this preset. */

import { setLevels } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = setLevels(presetDocs, doc, body);
  return Response.json(r.body, { status: r.status });
}
