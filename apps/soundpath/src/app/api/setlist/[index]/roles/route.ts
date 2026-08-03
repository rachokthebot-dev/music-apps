/** PATCH /api/setlist/[index]/roles — what each snapshot counts as. */

import { setRoles } from "@/lib/levelActions";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ index: string }> }
) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const idx = Number((await params).index);
  const preset = setlist.presets.find((p) => p.index === idx);
  if (!preset) return Response.json({ ok: false, error: "No preset at that slot" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { roles?: Record<string, string> };
  const r = setRoles(setlistDocs, setlist, preset, body.roles ?? {});
  return Response.json(r.body, { status: r.status });
}
