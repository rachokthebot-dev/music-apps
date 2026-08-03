/**
 * Confirmed levelling passes for one setlist.
 *
 *   GET  — list them, newest first, each flagged with whether it can still be
 *          rebuilt (a preset replaced since means its hash has gone).
 *   POST — freeze the current plan as the next version.
 */

import { confirmVersion, listVersions } from "@/lib/levelActions";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const r = listVersions(setlistDocs, setlist);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const r = confirmVersion(setlistDocs, setlist);
  return Response.json(r.body, { status: r.status });
}
