/**
 * Confirmed levelling passes for one preset.
 *
 *   GET  — list them, newest first.
 *   POST — freeze the current plan as the next version.
 */

import { confirmVersion, listVersions } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const r = listVersions(presetDocs, doc);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const r = confirmVersion(presetDocs, doc);
  return Response.json(r.body, { status: r.status });
}
