/**
 * GET /api/level/export — one levelled preset as a .hlx.
 *
 * The single-preset counterpart to the setlist export, and it follows the same
 * rules: ?version=n rebuilds a confirmed pass from its frozen preset, no
 * version gives you the latest confirmed one (or the live plan, which is a
 * preview and says so by carrying no version number), and ?version=original
 * gives the preset exactly as stored — shifted by the record offset only when
 * the plan says that offset is in the loaded file.
 *
 * The version goes in the preset's own name as well as the filename, because
 * the name is the only thing the Helix shows you. Sixteen characters is all
 * there is, so the tag wins and the name is trimmed to fit.
 */

import { nameForSong, nameSnapshots, type HlxLike } from "@music-apps/gain-estimator";

import { applyGainsToPresets, applyPlanToPresets, offsetPresets, type GainRow } from "@/lib/applyLevels";
import type { SnapshotState } from "@/lib/levelDoc";
import { readPresetLevel, readVersionPayload } from "@/lib/presetLevelStore";

export const dynamic = "force-dynamic";

/** Helix shows 16 characters; keep the version and trim the name to fit. */
function titleFor(name: string, n: number | null): string {
  if (n === null) return name.slice(0, 16);
  const tag = ` v${n}`;
  return `${name.slice(0, 16 - tag.length)}${tag}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const doc = readPresetLevel(url.searchParams.get("id"));
  if (!doc) return Response.json({ ok: false, error: "No preset open" }, { status: 404 });

  const versions = doc.versions ?? [];
  const asked = url.searchParams.get("version");
  const snapshots = doc.presets[0]?.snapshots;

  if (asked === "original") {
    // Only "in the loaded file" bakes the record offset in. Unticked — the
    // default — this is the preset exactly as stored, which is what the link
    // says it is. Ticked, the file matches what the plan already believes is
    // on the pedal, so the download and the corrections can't disagree.
    const offset = doc.loadedOffsetDb ?? 0;
    const untouched = offsetPresets(doc, offset);
    const suffix = offset === 0 ? "_original" : `_original_${offset}dB`;
    return hlxResponse(doc.name, null, suffix, untouched[0]?.hlx, snapshots);
  }

  const wanted =
    asked === null ? versions[versions.length - 1] : versions.find((v) => String(v.n) === asked);

  if (asked !== null && !wanted) {
    return Response.json({ ok: false, error: `No version ${asked}` }, { status: 404 });
  }

  if (wanted) {
    // A frozen version carries its own finished preset, so it rebuilds no
    // matter what happened afterwards.
    const frozen = readVersionPayload(doc.id, wanted.n);
    if (frozen?.[0]) return hlxResponse(doc.name, wanted.n, `_v${wanted.n}`, frozen[0].hlx);

    const gains = new Map<string, GainRow[]>(wanted.presets.map((p) => [p.hash, p.gains]));
    return hlxResponse(
      doc.name,
      wanted.n,
      `_v${wanted.n}`,
      applyGainsToPresets(doc, gains)[0]?.hlx,
      snapshots
    );
  }

  return hlxResponse(doc.name, null, "_preview", applyPlanToPresets(doc)[0]?.hlx, snapshots);
}

function hlxResponse(
  name: string,
  n: number | null,
  suffix: string,
  hlx: string | undefined,
  /**
   * Hand-typed snapshot names to stamp in. Omitted for a frozen version: those
   * were written when it was confirmed, and restamping from a document that
   * has been renamed since would change a file already taken to a gig.
   */
  snapshots?: SnapshotState[]
): Response {
  if (!hlx) return Response.json({ ok: false, error: "Nothing to export" }, { status: 404 });

  let file = hlx;
  try {
    const named = nameForSong(JSON.parse(hlx) as HlxLike, titleFor(name, n));
    file = JSON.stringify(snapshots ? nameSnapshots(named, snapshots) : named);
  } catch {
    // An unparseable payload is still the file we were asked for; it just
    // keeps whatever name it already had.
  }

  const safe = name.replace(/[^\w\-]+/g, "_").slice(0, 40) || "preset";
  return new Response(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}${suffix}.hlx"`,
    },
  });
}
