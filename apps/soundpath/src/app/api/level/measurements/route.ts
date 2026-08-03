/** DELETE /api/level/measurements — clear this preset's readings. */

import { clearReadings } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const r = clearReadings(presetDocs, doc);
  return Response.json(r.body, { status: r.status });
}
