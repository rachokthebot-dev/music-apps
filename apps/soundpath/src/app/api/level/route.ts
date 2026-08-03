/**
 * Preset levelling sessions.
 *
 *   GET    — every session, newest first.
 *   POST   — open one for a preset, by library key or uploaded .hlx.
 *   DELETE — throw one away, readings and confirmed versions with it.
 *
 * Opening is idempotent: the session is keyed by the preset's hash, so a patch
 * you have already recorded comes back with its readings. That is the same rule
 * the setlist store uses — readings describe a patch, and a patch whose bytes
 * changed is a different patch.
 */

import { presetNameOf } from "@/lib/levelDoc";
import { openPresetLevel, clearPresetLevel, listPresetLevels } from "@/lib/presetLevelStore";
import { getPreset } from "@/lib/presetStore";
import { findPresetByHash } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, sessions: listPresetLevels() });
}

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Attach the preset as `file`" }, { status: 400 });
    }
    const hlx = await file.text();
    try {
      JSON.parse(hlx);
    } catch {
      return Response.json({ ok: false, error: "That isn't a readable .hlx file" }, { status: 400 });
    }
    // The preset's own name beats the filename: a file handed over by another
    // app is named for whatever that app could safely put on disk, which
    // arrives here as SMELLS_LIKE_T_S_. Fall back to the filename only for a
    // preset that never carried a name.
    const doc = openPresetLevel(hlx, presetNameOf(hlx, file.name.replace(/\.hlx$/i, "")));
    return Response.json({ ok: true, id: doc.id, name: doc.name });
  }

  const body = (await req.json().catch(() => ({}))) as { presetHash?: string; presetId?: string };

  if (body.presetHash) {
    const found = findPresetByHash(body.presetHash);
    if (!found) return Response.json({ ok: false, error: "No preset with that hash" }, { status: 404 });
    const doc = openPresetLevel(found.hlx, found.name);
    return Response.json({ ok: true, id: doc.id, name: doc.name });
  }

  if (body.presetId) {
    const row = await getPreset(body.presetId).catch(() => null);
    if (!row) return Response.json({ ok: false, error: "No preset with that id" }, { status: 404 });
    const doc = openPresetLevel(row.hlx, row.name);
    return Response.json({ ok: true, id: doc.id, name: doc.name });
  }

  return Response.json({ ok: false, error: "Send presetHash, presetId, or a .hlx file" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "Which session?" }, { status: 400 });
  clearPresetLevel(id);
  return Response.json({ ok: true });
}
