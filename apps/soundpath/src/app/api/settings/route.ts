/**
 * GET/PUT /api/settings — the target level, shared by every setlist.
 *
 * Separate from a setlist on purpose: its whole job is to make gigs land at
 * the same place, which nothing stored inside one gig can do.
 */

import { DEFAULT_SETTINGS, readSettings, writeSettings } from "@/lib/settingsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, settings: readSettings() });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    targetLufs?: number | null;
    headroomDb?: number;
    recordOffsetDb?: number;
  };
  const current = readSettings();

  const targetLufs =
    body.targetLufs === undefined
      ? current.targetLufs
      : body.targetLufs === null
        ? null
        : Number(body.targetLufs);
  if (targetLufs !== null && (!Number.isFinite(targetLufs) || targetLufs > 0 || targetLufs < -60)) {
    return Response.json(
      { ok: false, error: "Target must be between -60 and 0 LUFS" },
      { status: 400 }
    );
  }

  const headroomDb = body.headroomDb === undefined ? current.headroomDb : Number(body.headroomDb);
  if (!Number.isFinite(headroomDb) || headroomDb < 0 || headroomDb > 24) {
    return Response.json({ ok: false, error: "Headroom must be 0–24 dB" }, { status: 400 });
  }

  const recordOffsetDb =
    body.recordOffsetDb === undefined ? current.recordOffsetDb : Number(body.recordOffsetDb);
  // Only ever a back-off. A positive value would push presets toward the
  // clipping this exists to avoid.
  if (!Number.isFinite(recordOffsetDb) || recordOffsetDb > 0 || recordOffsetDb < -40) {
    return Response.json({ ok: false, error: "Record offset must be -40\u20130 dB" }, { status: 400 });
  }

  const next = { ...DEFAULT_SETTINGS, targetLufs, headroomDb, recordOffsetDb };
  writeSettings(next);
  return Response.json({ ok: true, settings: next });
}
