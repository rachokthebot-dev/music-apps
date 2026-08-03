/**
 * Readings for the preset being levelled.
 *
 *   PATCH — one snapshot, measured live in the browser.
 *   POST  — one .wav holding every snapshot in turn.
 *
 * The same shared actions the setlist routes call, so a reading taken here is
 * the same kind of number as one taken during a gig pass — including the
 * clipped-take refusal and the baseline stamp that make it interpretable later.
 */

import { storeReading, storeUpload } from "@/lib/levelActions";
import { presetDocs, readPresetLevel } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const preset = doc.presets[0];
  if (!preset) {
    return Response.json({ ok: false, error: "That session has no preset in it" }, { status: 409 });
  }

  const body = (await req.json()) as { snapshotIndex?: number; lufs?: number; peakDbfs?: number };
  const r = storeReading(presetDocs, doc, preset, body);
  return Response.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const doc = readPresetLevel(new URL(req.url).searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Attach the recording as `file`" }, { status: 400 });
  }

  const preset = doc.presets[0];
  if (!preset) {
    return Response.json({ ok: false, error: "That session has no preset in it" }, { status: 409 });
  }

  const r = await storeUpload(
    presetDocs,
    doc,
    preset,
    file,
    Number(form.get("measureSec") ?? 3.0)
  );
  return Response.json(r.body, { status: r.status });
}
