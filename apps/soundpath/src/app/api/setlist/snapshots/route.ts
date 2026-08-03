/**
 * GET /api/setlist/snapshots — what each song's preset actually holds.
 *
 * For the Setlists app, which shows a snapshot count next to every song. It
 * used to count rows it had parsed itself, and the two apps disagreed: a
 * preset whose author named one slot and left the rest as copies reads as one
 * snapshot to a simple parse and as two here, because SoundPath falls back to
 * distinct tones when nothing is named. The number on that page is a promise
 * about how much there is to record, so it has to come from whatever is going
 * to do the recording.
 *
 * Keyed by songId, which the Setlists app sends with each preset when it
 * pushes a gig over.
 */

import { buildPlan } from "@/lib/levelPlan";
import { readSetlist } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const plan = buildPlan(setlist);
  const bySongId: Record<string, unknown> = {};

  for (const preset of setlist.presets) {
    if (!preset.songId) continue;
    const row = plan.presets.find((p) => p.hash === preset.hash);
    const snaps = row?.snapshots ?? [];
    bySongId[preset.songId] = {
      preset: preset.name,
      snapshots: snaps.map((s) => ({
        index: s.index,
        name: s.name,
        role: s.role,
        roleSource: s.roleSource,
        measured: s.measuredLufs !== null,
      })),
      measured: snaps.filter((s) => s.measuredLufs !== null).length,
      total: snaps.length,
    };
  }

  return Response.json({
    ok: true,
    songs: bySongId,
    measured: plan.measuredCount,
    total: plan.totalCount,
    /** Presets SoundPath holds that no song claims — a push that went stale. */
    unclaimed: setlist.presets.filter((p) => !p.songId).map((p) => p.name),
  });
}
