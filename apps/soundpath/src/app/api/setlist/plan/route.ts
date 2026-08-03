/** GET /api/setlist/plan — what each snapshot needs to hit its role's level. */

import { buildPlan } from "@/lib/levelPlan";
import { readSetlist } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });
  return Response.json({ ok: true, ...buildPlan(setlist) });
}
