/**
 * POST /api/match-song/apply
 * body: MatchSongResult (the proposal from /api/match-song)
 *
 * Applies the proposed snapshot patch, saves to iCloud, returns the file
 * as a download.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  applySnapshotPatch,
  stringifyHelixPreset,
  estimateAllSnapshots,
  type SnapshotPatch,
} from "@music-apps/gain-estimator";

import { PRESET_DIR, readActiveMaster } from "@/lib/masterStore";
import type { MatchSongResult } from "@/lib/matchSong";
import { savePreset } from "@/lib/presetStore";

export const dynamic = "force-dynamic";

function dispositionHeader(fileName: string): string {
  const ascii = fileName.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function POST(req: Request) {
  try {
    const result = (await req.json()) as MatchSongResult;
    if (!result || typeof result.targetSnapshotIndex !== "number") {
      return Response.json({ ok: false, error: "invalid MatchSongResult" }, { status: 400 });
    }

    const preset = readActiveMaster();
    const patch: SnapshotPatch = {
      targetSnapshotIndex: result.targetSnapshotIndex,
      enable: result.enable,
      bypass: result.bypass,
      params: result.params,
    };
    const { preset: patched, report } = applySnapshotPatch(preset, patch);

    // Write the result alongside the master in PRESET_DIR with a descriptive
    // name; sanitize for filesystem.
    const tag = `${result.song} ${result.artist}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
    const outPath = join(
      PRESET_DIR,
      `active-master — match ${result.targetSnapshotName} — ${tag}.hlx`
    );
    const body = stringifyHelixPreset(patched);
    writeFileSync(outPath, body, "utf-8");

    // Persist to the Library (best-effort). Tone Discovery routes through this
    // same apply endpoint; the whyThisExemplar field distinguishes it.
    const isToneDiscovery =
      typeof (result as { whyThisExemplar?: unknown }).whyThisExemplar === "string";
    try {
      const loudness = estimateAllSnapshots(patched).map((s, i, arr) => ({
        index: i,
        name: s.snapshotName,
        loudnessDb: Number((s.loudnessDb - arr[0].loudnessDb).toFixed(2)),
      }));
      await savePreset({
        name: `${result.song} — ${result.artist} (${result.targetSnapshotName})`.slice(0, 80),
        flow: isToneDiscovery ? "tone-discovery" : "match-song",
        hardwareTarget: "LT",
        tones: {
          song: result.song,
          artist: result.artist,
          targetSnapshotName: result.targetSnapshotName,
          whyThisExemplar: (result as { whyThisExemplar?: string }).whyThisExemplar,
        },
        hlx: body,
        snapshots: loudness.map((l) => l.name),
        loudness,
      });
    } catch (e) {
      console.error("[match-song/apply] failed to save to Library:", e);
    }

    const fileName = `${preset.data.meta.name || "preset"} — match ${result.targetSnapshotName} — ${tag}.hlx`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": dispositionHeader(fileName),
        "X-Unresolved-Count": String(report.unresolved.length),
        "X-Enabled-Count": String(report.enabledBlocks.length),
        "X-Bypassed-Count": String(report.bypassedBlocks.length),
        "X-Params-Set-Count": String(report.paramsSet.length),
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
