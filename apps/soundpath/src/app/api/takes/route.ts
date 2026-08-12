/**
 * POST  /api/takes — archive one recorded take, audio and all.
 * PATCH /api/takes — record the window it ended up with.
 *
 * Both are debug plumbing: nothing in the app reads a take back, and a failure
 * here must never cost a reading, so the callers fire and forget.
 */

import { saveTake, takeId, takesEnabled, updateTake, type TakeMeta } from "@/lib/takeStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!takesEnabled()) return Response.json({ ok: false, disabled: true });

  const form = await req.formData();
  const file = form.get("file");
  const raw = form.get("meta");
  if (!(file instanceof File) || typeof raw !== "string") {
    return Response.json({ ok: false, error: "Send `file` and `meta`" }, { status: 400 });
  }

  let meta: Omit<TakeMeta, "id" | "recordedAt">;
  try {
    meta = JSON.parse(raw) as Omit<TakeMeta, "id" | "recordedAt">;
  } catch {
    return Response.json({ ok: false, error: "meta is not JSON" }, { status: 400 });
  }

  const id = takeId({
    source: meta.source,
    presetName: meta.context?.presetName,
    snapshotIndex: meta.context?.snapshotIndex ?? 0,
  });
  saveTake(
    { ...meta, id, recordedAt: new Date().toISOString() },
    Buffer.from(await file.arrayBuffer())
  );
  return Response.json({ ok: true, id });
}

export async function PATCH(req: Request) {
  if (!takesEnabled()) return Response.json({ ok: false, disabled: true });

  const body = (await req.json()) as {
    id?: string;
    startSec?: number;
    endSec?: number;
    auto?: boolean;
    lufs?: number;
    peakDbfs?: number;
    clipped?: boolean;
    measureSec?: number;
  };
  if (!body.id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  if (!Number.isFinite(body.startSec) || !Number.isFinite(body.endSec)) {
    return Response.json({ ok: false, error: "startSec and endSec must be numbers" }, { status: 400 });
  }

  const next = updateTake(
    body.id,
    { startSec: body.startSec!, endSec: body.endSec!, auto: Boolean(body.auto) },
    {
      lufs: Number(body.lufs),
      peakDbfs: Number(body.peakDbfs),
      clipped: Boolean(body.clipped),
    },
    body.measureSec
  );
  // A take that isn't there yet is the normal race, not an error worth
  // surfacing: the audio may still be uploading when the first drag lands.
  return Response.json({ ok: Boolean(next) });
}
