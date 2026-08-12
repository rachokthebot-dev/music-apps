/** PATCH /api/level/name — rename this preset, or its snapshots. */

import { setNames } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const preset = doc.presets[0];
  if (!preset) {
    return Response.json({ ok: false, error: "That session has no preset in it" }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    snapshots?: Record<string, string>;
  };
  const r = setNames(presetDocs, doc, preset, body, true);
  return Response.json(r.body, { status: r.status });
}
