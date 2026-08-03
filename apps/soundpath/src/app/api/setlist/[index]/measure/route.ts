/**
 * Readings for one preset in a gig.
 *
 *   PATCH — one snapshot, measured live in the browser.
 *   POST  — one .wav holding every snapshot of that preset in turn.
 *
 * Both go through the shared actions, so a reading stored here means exactly
 * what one stored by the preset leveller means. The logic that matters — the
 * clipped-take refusal and the baseline stamp — is in levelActions.
 */

import { storeReading, storeUpload } from "@/lib/levelActions";
import { type LevelPreset } from "@/lib/levelDoc";
import { readSetlist, setlistDocs, type StoredSetlist } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

type Resolved =
  | { ok: false; res: Response }
  | { ok: true; setlist: StoredSetlist; preset: LevelPreset };

/** Resolve ?id= and the slot, or say which one is missing. */
async function resolve(req: Request, params: Promise<{ index: string }>): Promise<Resolved> {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) {
    return { ok: false, res: Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 }) };
  }
  const idx = Number((await params).index);
  const preset = setlist.presets.find((p) => p.index === idx);
  if (!preset) {
    return { ok: false, res: Response.json({ ok: false, error: "No preset at that slot" }, { status: 404 }) };
  }
  return { ok: true, setlist, preset };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ index: string }> }) {
  const found = await resolve(req, params);
  if (!found.ok) return found.res;

  const body = (await req.json()) as { snapshotIndex?: number; lufs?: number; peakDbfs?: number };
  const r = storeReading(setlistDocs, found.setlist, found.preset, body);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request, { params }: { params: Promise<{ index: string }> }) {
  const found = await resolve(req, params);
  if (!found.ok) return found.res;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Attach the recording as `file`" }, { status: 400 });
  }

  const r = await storeUpload(
    setlistDocs,
    found.setlist,
    found.preset,
    file,
    Number(form.get("measureSec") ?? 3.0)
  );
  return Response.json(r.body, { status: r.status });
}
