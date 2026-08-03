/**
 * GET /api/level/export — one levelled preset as a .hlx.
 *
 * The single-preset counterpart to the setlist export, and it follows the same
 * rules: ?version=n rebuilds a confirmed pass from its frozen preset, no
 * version gives you the latest confirmed one (or the live plan, which is a
 * preview and says so by carrying no version number), and ?version=original
 * gives the preset exactly as stored, shifted by the record offset.
 *
 * The version goes in the preset's own name as well as the filename, because
 * the name is the only thing the Helix shows you. Sixteen characters is all
 * there is, so the tag wins and the name is trimmed to fit.
 */

import { nameForSong, type HlxLike } from "@music-apps/gain-estimator";

import { applyGainsToPresets, applyPlanToPresets, offsetPresets, type GainRow } from "@/lib/applyLevels";
import { readPresetLevel, readVersionPayload } from "@/lib/presetLevelStore";
import { readSettings } from "@/lib/settingsStore";

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

  if (asked === "original") {
    // The record offset rides on this file: it is the one you load to record
    // through, so turning the preset down to keep takes out of the converter's
    // ceiling belongs here and nowhere else. At 0 it is a no-op.
    const offset = readSettings().recordOffsetDb;
    const untouched = offsetPresets(doc, offset);
    const suffix = offset === 0 ? "_original" : `_original_${offset}dB`;
    return hlxResponse(doc.name, null, suffix, untouched[0]?.hlx);
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
    return hlxResponse(doc.name, wanted.n, `_v${wanted.n}`, applyGainsToPresets(doc, gains)[0]?.hlx);
  }

  return hlxResponse(doc.name, null, "_preview", applyPlanToPresets(doc)[0]?.hlx);
}

function hlxResponse(name: string, n: number | null, suffix: string, hlx: string | undefined): Response {
  if (!hlx) return Response.json({ ok: false, error: "Nothing to export" }, { status: 404 });

  let file = hlx;
  try {
    file = JSON.stringify(nameForSong(JSON.parse(hlx) as HlxLike, titleFor(name, n)));
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
