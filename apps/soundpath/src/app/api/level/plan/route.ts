/** GET /api/level/plan — what each snapshot of one preset needs to hit its level. */

import { buildPlan } from "@/lib/levelPlan";
import { readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });
  return Response.json({ ok: true, ...buildPlan(doc) });
}
