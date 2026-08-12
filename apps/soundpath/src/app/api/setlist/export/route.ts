/**
 * GET /api/setlist/export — the gig as one .hls, levelled from the recordings.
 *
 * This is the download the Setlists app points at. It is the only export that
 * carries levels: the wizard ships presets exactly as downloaded, because
 * levelling needs measurements that only exist here.
 *
 * ?version=n rebuilds a confirmed pass from its stored gains. Without it you
 * get the latest confirmed version, or — if nothing has been confirmed yet —
 * the live plan, which is a preview and says so by carrying no version number.
 *
 * A confirmed version is emitted from the finished presets frozen with it, so
 * it keeps rebuilding after the live presets have been replaced.
 *
 * ?version=original emits the presets exactly as uploaded, with no correction
 * at all — the record offset rides along only when the setlist says that
 * offset is in the loaded file. That is how you get back to a known baseline:
 * load it, tell the
 * setlist that's what's on the pedal, and every reading afterwards is measured
 * from a level this app can actually see.
 *
 * The version goes in the setlist name as well as the filename, so the Helix
 * itself shows which pass is loaded. Mid-gig that is the only place you can
 * check.
 */

import { buildSetlistFile, nameForSong, nameSnapshots, type HlxLike } from "@music-apps/gain-estimator";

import { offsetPresets, applyGainsToPresets, applyPlanToPresets, type GainRow } from "@/lib/applyLevels";
import { readSetlist, readVersionPayload } from "@/lib/setlistStore";

export const dynamic = "force-dynamic";

/** Helix shows 32 characters; keep the version and trim the name to fit. */
function titleFor(name: string, n: number | null): string {
  if (n === null) return name.slice(0, 32);
  const tag = ` v${n}`;
  return `${name.slice(0, 32 - tag.length)}${tag}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const setlist = readSetlist(url.searchParams.get("id"));
  if (!setlist) return Response.json({ ok: false, error: "No setlist loaded" }, { status: 404 });

  const versions = setlist.versions ?? [];
  const asked = url.searchParams.get("version");

  if (asked === "original") {
    // Only "in the loaded file" bakes the record offset in. Unticked — the
    // default — this is the presets exactly as stored, which is what the link
    // says it is. Ticked, the file matches what the plan already believes is
    // on the pedal, so the download and the corrections can't disagree.
    const offset = setlist.loadedOffsetDb ?? 0;
    const untouched = offsetPresets(setlist, offset);
    const suffix = offset === 0 ? "_original" : `_original_${offset}dB`;
    return hlsResponse(setlist.name, null, suffix, untouched);
  }

  const wanted =
    asked === null ? versions[versions.length - 1] : versions.find((v) => String(v.n) === asked);

  if (asked !== null && !wanted) {
    return Response.json({ ok: false, error: `No version ${asked}` }, { status: 404 });
  }

  // A confirmed version froze the presets it was built from. Change one and
  // that version still rebuilds perfectly — it just no longer describes this
  // gig. Handing it over as "the current file" is how you take last week's
  // preset to a gig believing it's this week's, so the default download
  // refuses once the presets have moved on. Asking for it by number still
  // works: the file is fine, it's the "latest" claim that isn't.
  if (asked === null && wanted && setlist.presetsChangedAt && wanted.createdAt < setlist.presetsChangedAt) {
    return Response.json(
      {
        ok: false,
        error: `v${wanted.n} was confirmed before ${(setlist.changedPresets ?? []).join(", ") || "the presets"} changed, so it isn't this gig any more. To record a fresh pass, download the original file (?version=original) — it has every preset as it stands now, including any just added — load that onto the Helix, then confirm a new version. Ask for ?version=${wanted.n} if you specifically want the old file.`,
      },
      { status: 409 }
    );
  }

  let applied;
  if (wanted) {
    // A frozen version carries its own finished presets, so it rebuilds no
    // matter what has happened to the live ones since.
    const frozen = readVersionPayload(setlist.id, wanted.n);
    if (frozen) {
      return hlsResponse(
        setlist.name,
        wanted.n,
        `_v${wanted.n}`,
        frozen.map((f) => ({
          preset: { index: f.index, name: f.name } as never,
          hlx: f.hlx,
          written: {},
        }))
      );
    }

    const live = new Set(setlist.presets.map((p) => p.hash));
    const gone = wanted.presets.filter((p) => !live.has(p.hash));
    if (gone.length > 0) {
      // Emitting the rest would be a different file wearing the same version
      // number, which is worse than refusing.
      return Response.json(
        {
          ok: false,
          error: `Version ${wanted.n} can't be rebuilt — ${gone
            .map((p) => p.name)
            .join(", ")} ${gone.length === 1 ? "has" : "have"} been replaced since.`,
        },
        { status: 409 }
      );
    }
    const gains = new Map<string, GainRow[]>(wanted.presets.map((p) => [p.hash, p.gains]));
    applied = applyGainsToPresets(setlist, gains);
  } else {
    applied = applyPlanToPresets(setlist);
  }

  const n = wanted?.n ?? null;
  return hlsResponse(setlist.name, n, n === null ? "_preview" : `_v${n}`, applied);
}

function hlsResponse(
  name: string,
  n: number | null,
  suffix: string,
  applied: ReturnType<typeof applyGainsToPresets>
): Response {
  const slots: HlxLike[] = [];
  for (const a of applied) {
    // Slot position follows setlist position, so a gap stays a gap.
    while (slots.length < a.preset.index) slots.push({});
    try {
      // Name the slot after the song, not whoever uploaded the preset, and
      // carry any hand-typed snapshot names down with it. A frozen version
      // has no snapshots on its stub preset — its names were written into the
      // payload when it was confirmed, and must not be restamped from a
      // document that has moved on since.
      const named = nameForSong(JSON.parse(a.hlx) as HlxLike, a.preset.name);
      slots.push(a.preset.snapshots ? nameSnapshots(named, a.preset.snapshots) : named);
    } catch {
      slots.push({});
    }
  }

  const file = buildSetlistFile(titleFor(name, n), slots);
  const safe = name.replace(/[^\w\-]+/g, "_").slice(0, 40) || "setlist";
  return new Response(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}${suffix}.hls"`,
    },
  });
}
