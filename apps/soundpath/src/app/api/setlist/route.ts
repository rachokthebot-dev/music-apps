/**
 * GET    /api/setlist — the loaded setlist with each preset's estimated loudness.
 * POST   /api/setlist — upload a .hls, or post presets directly from another app.
 * DELETE /api/setlist — unload it.
 *
 * Estimates come from the static parameter estimator, so a whole gig can be
 * eyeballed before any recording is made. They are a rough sort order and
 * nothing more — every number levelling acts on comes from a measurement.
 */

import { estimateAllSnapshots, type HelixPreset } from "@music-apps/gain-estimator";

import {
  clearSetlist,
  parseHlsFile,
  readSetlist,
  writeSetlist,
  type SetlistPreset,
  type StoredSetlist,
  buildPreset,
  mergeMeasurements,
  DEFAULT_LEVELS,
  LOCAL_ID,
  newSetlistId,
  listSetlists,
} from "@/lib/setlistStore";

interface PresetSummary {
  index: number;
  name: string;
  snapshotCount: number;
  /** Loudness of each snapshot relative to the preset's first, in dB. */
  snapshots: Array<{ index: number; name: string; relDb: number }>;
  /** The preset's own baseline — what shifts it against the rest of the gig. */
  baselineDb: number | null;
  error?: string;
}

function summarise(p: SetlistPreset): PresetSummary {
  try {
    const preset = JSON.parse(p.hlx) as HelixPreset;
    const loud = estimateAllSnapshots(preset);
    const base = loud[0]?.loudnessDb ?? 0;
    return {
      index: p.index,
      name: p.name,
      snapshotCount: loud.length,
      snapshots: loud.map((l) => ({
        index: l.snapshotIndex,
        name: l.snapshotName,
        relDb: Number((l.loudnessDb - base).toFixed(2)),
      })),
      baselineDb: Number(base.toFixed(2)),
    };
  } catch (err) {
    return {
      index: p.index,
      name: p.name,
      snapshotCount: 0,
      snapshots: [],
      baselineDb: null,
      error: err instanceof Error ? err.message : "could not read preset",
    };
  }
}

export async function GET(req: Request) {
  const setlist = readSetlist(new URL(req.url).searchParams.get("id"));
  if (!setlist) return Response.json({ ok: true, setlist: null });
  return Response.json({
    ok: true,
    setlist: { id: setlist.id, name: setlist.name, presets: setlist.presets.map(summarise) },
    available: listSetlists(),
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // JSON — the Setlists app posts its presets straight across.
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        setlistId?: string;
        name?: string;
        presets?: Array<{ name?: string; hlx?: string; songId?: string }>;
      };
      const presets = (body.presets ?? [])
        .map((p, i) => buildPreset(i, String(p?.name ?? `Preset ${i + 1}`), String(p?.hlx ?? ""), p?.songId))
        .filter((p) => p.hlx);
      if (presets.length === 0) {
        return Response.json({ ok: false, error: "no presets supplied" }, { status: 400 });
      }
      // Keep measurements for presets that didn't change, so editing one song
      // doesn't cost you the other seven recordings.
      // The id comes from the Setlists app so its download button gets this
      // gig back rather than whichever one happened to be open here.
      const id = String(body.setlistId ?? LOCAL_ID);
      const prev = readSetlist(id);
      // Which songs actually changed, by payload — a rename shouldn't cry wolf
      // and an edited patch under the same name should. Membership, not
      // position: comparing by index meant that dropping one song shifted
      // every song after it and reported them all as changed.
      const before = new Set((prev?.presets ?? []).map((p) => p.hash));
      const touched = prev ? presets.filter((p) => !before.has(p.hash)).map((p) => p.name) : [];
      // When each patch arrived. Carried for anything already here, stamped
      // for anything new — so a preset can say when *it* last changed instead
      // of borrowing the setlist file's mtime, which moves whenever any other
      // song is touched.
      const now = new Date().toISOString();
      const addedBefore = new Map((prev?.presets ?? []).map((p) => [p.hash, p.addedAt]));
      const stored: StoredSetlist = {
        id,
        name: String(body.name ?? "Setlist"),
        levels: prev?.levels ?? { ...DEFAULT_LEVELS },
        presets: mergeMeasurements(presets, prev).map((p) => ({
          ...p,
          addedAt: addedBefore.get(p.hash) ?? (prev ? now : undefined),
        })),
        // Carried, not rebuilt. This route runs on every download from the
        // Setlists app, so anything left out here is silently destroyed by
        // pressing a button that only says "download": the whole version
        // history, and the baseline every future correction is measured from.
        versions: prev?.versions,
        loadedVersion: prev?.loadedVersion ?? null,
        presetsChangedAt: touched.length > 0 ? new Date().toISOString() : prev?.presetsChangedAt ?? null,
        changedPresets: touched.length > 0 ? touched : prev?.changedPresets ?? [],
      };
      writeSetlist(stored);
      return Response.json({ ok: true, id, name: stored.name, count: presets.length });
    }

    /*
     * Multipart .hls upload — a setlist exported from HX Edit. Two different
     * things, told apart by whether an id is given:
     *
     *   no id   a gig that has nothing to do with anything stored here. New
     *           session under its own id, so the one you were levelling
     *           survives having a second file dropped in.
     *
     *   ?id=X   the same gig, re-baselined. You tweaked presets on the pedal
     *           — during a soundcheck, or mid-gig — and this file is now the
     *           truth. Keeps the setlist's identity, its levels and its
     *           version history; replaces the presets and drops every reading,
     *           because those measured patches that no longer exist.
     */
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "expected multipart field 'file'" }, { status: 400 });
    }

    const targetId = new URL(req.url).searchParams.get("id");
    const existing = targetId ? readSetlist(targetId) : null;
    if (targetId && !existing) {
      return Response.json({ ok: false, error: "No setlist with that id" }, { status: 404 });
    }

    const text = await file.text();
    const stored = parseHlsFile(text, existing ? existing.id : newSetlistId());

    // A new gig can't take a name that's already in use. Two setlists called
    // the same thing are indistinguishable in the library and in the download
    // filename, and picking the wrong one means levelling against another
    // gig's recordings. Re-baselining an existing setlist is exempt — it keeps
    // its own name by definition.
    if (!existing) {
      const clash = listSetlists().find(
        (x) => x.name.trim().toLowerCase() === stored.name.trim().toLowerCase()
      );
      if (clash) {
        return Response.json(
          {
            ok: false,
            error: `A setlist called "${clash.name}" already exists (${clash.presets} presets, ${clash.measured}/${clash.snapshots} measured). Rename this one in HX Edit, or open that setlist and use "Replace presets from .hls" if you meant to update it.`,
          },
          { status: 409 }
        );
      }
    }
    if (stored.presets.length === 0) {
      return Response.json(
        { ok: false, error: "That setlist has no presets in it" },
        { status: 400 }
      );
    }

    if (existing) {
      // Roles are a labelling decision about the song, not a measurement, and
      // re-doing them for a whole gig every time a patch is tweaked is a lot
      // of clicking. Baking gains in changes every hash, so they're carried by
      // position and name instead.
      stored.presets = stored.presets.map((p) => {
        const old = existing.presets.find((x) => x.index === p.index);
        return {
          ...p,
          snapshots: p.snapshots.map((s) => {
            const o = old?.snapshots.find((x) => x.index === s.index && x.name === s.name);
            return o?.roleSource === "user" ? { ...s, role: o.role, roleSource: "user" as const } : s;
          }),
        };
      });
      stored.name = existing.name;
      stored.levels = existing.levels;
      stored.versions = existing.versions;
      // The uploaded file *is* what's on the pedal, so it becomes the baseline.
      stored.loadedVersion = null;
      // Every reading went with the old presets, so nothing is left to be
      // stale — the warning would only be noise.
      stored.presetsChangedAt = null;
      stored.changedPresets = [];
    } else {
      stored.presets = mergeMeasurements(stored.presets, null);
    }

    writeSetlist(stored);
    return Response.json({
      ok: true,
      id: stored.id,
      name: stored.name,
      count: stored.presets.length,
      rebaselined: Boolean(existing),
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  clearSetlist(new URL(req.url).searchParams.get("id"));
  return Response.json({ ok: true });
}
