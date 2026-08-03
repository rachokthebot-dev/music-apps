/**
 * GET /api/library — everything SoundPath has stored, for the landing page.
 *
 * Presets come from two places and the page shouldn't care which: patches that
 * arrived inside a setlist (keyed by hash, carrying their readings) and rows in
 * the generated-preset table (from HelAIx and past generations here). Plenty of
 * presets belong to no gig at all, which is why this isn't scoped to a setlist.
 */

import { listPresets } from "@/lib/presetStore";
import { listSetlists, listStoredPresets } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

export async function GET() {
  // A DB hiccup shouldn't blank out the setlists, which are files on disk.
  const generated = await listPresets().catch(() => []);

  return Response.json({
    ok: true,
    setlists: listSetlists(),
    // Same fields a setlist row carries, because they are the same kind of
    // thing on the page: a name, where it came from, when it last moved, and
    // how much of it is recorded.
    presets: [
      ...listStoredPresets().map((p) => ({
        key: `hash:${p.hash}`,
        name: p.name,
        origin: p.setlists.join(", ") || "setlist",
        // What happened to *this* patch, newest first — its last reading, or
        // failing that when it arrived. `p.updatedAt` is the gig file's mtime
        // and is the same for every preset in it, which is what it used to
        // show.
        updatedAt: p.measuredAt ?? p.addedAt ?? p.updatedAt,
        updatedWhat: p.measuredAt ? ("recorded" as const) : p.addedAt ? ("added" as const) : null,
        measuredAt: p.measuredAt,
        addedAt: p.addedAt,
        // A patch stored inside a gig has no life of its own — removing it is
        // the Setlists app's job, not a delete here.
        deletable: false,
        measured: p.measured,
        snapshots: p.snapshots,
      })),
      ...generated.map((p) => ({
        key: `id:${p.id}`,
        name: p.name,
        origin: [p.sourceApp, p.flow].filter(Boolean).join(" · "),
        updatedAt: p.createdAt,
        updatedWhat: "added" as const,
        measuredAt: null,
        addedAt: p.createdAt,
        deletable: true,
        // Nothing has read this patch's snapshots yet — that happens when you
        // open it. Null rather than 0/0, which would claim it has none.
        measured: null,
        snapshots: null,
      })),
    ],
  });
}
