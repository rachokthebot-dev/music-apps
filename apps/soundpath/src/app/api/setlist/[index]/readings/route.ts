/**
 * Readings this preset already has somewhere else.
 *
 *   GET  — is there a levelling session for this patch, and what is in it?
 *   POST — take those readings into the gig.
 *
 * The point is to let you level a changed preset on its own — one .hlx on the
 * Helix, not the whole gig — and then have the setlist pick it up, rather than
 * loading the gig back on just to re-record one song.
 */

import { importReadings } from "@/lib/levelActions";
import { findSessionFor } from "@/lib/presetLevelStore";
import { readSettings } from "@/lib/settingsStore";
import { readSetlist, setlistDocs } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

function resolve(req: Request, index: string) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return { error: "No setlist loaded" as const, status: 404 };
  const preset = setlist.presets.find((p) => p.index === Number(index));
  if (!preset) return { error: "No preset at that slot" as const, status: 404 };
  // Matched on what the preset is, not on the bytes it was stored as — the
  // same patch arrives here re-serialised depending on which way round it
  // came, and would otherwise look like a different preset entirely.
  const session = findSessionFor(preset.hlx);
  return { setlist, preset, session };
}

export async function GET(req: Request, { params }: { params: Promise<{ index: string }> }) {
  const r = resolve(req, (await params).index);
  if ("error" in r) return Response.json({ ok: false, error: r.error }, { status: r.status });

  const src = r.session?.presets[0];
  const readings = (src?.snapshots ?? []).filter((s) => s.measuredLufs !== null);
  const stamps = readings.map((s) => s.measuredAt).filter((d): d is string => Boolean(d)).sort();

  return Response.json({
    ok: true,
    available: readings.length,
    total: r.preset.snapshots.length,
    measuredFrom: stamps[0] ?? null,
    measuredTo: stamps[stamps.length - 1] ?? null,
    baselines: [...new Set(readings.map((s) => s.measuredBaselineDb))],
    /** Readings the gig already has that taking these would write over. */
    replaces: r.preset.snapshots.filter(
      (s) => s.measuredLufs !== null && readings.some((x) => x.index === s.index)
    ).length,
    /** False when the gig centres on its own recordings, where this is unsafe. */
    allowed: readSettings().targetLufs !== null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ index: string }> }) {
  const r = resolve(req, (await params).index);
  if ("error" in r) return Response.json({ ok: false, error: r.error }, { status: r.status });

  const src = r.session?.presets[0];
  if (!src) {
    return Response.json(
      { ok: false, error: "This preset hasn't been levelled on its own." },
      { status: 404 }
    );
  }

  const out = importReadings(
    setlistDocs,
    r.setlist,
    r.preset,
    src,
    readSettings().targetLufs !== null
  );
  return Response.json(out.body, { status: out.status });
}
