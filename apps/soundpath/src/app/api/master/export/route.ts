/**
 * POST /api/master/export
 *
 * Takes accumulated pending changes (from Align Gain + Match Song) and
 * produces a single patched .hlx as a download. This is the only endpoint
 * that writes a downloadable file — both "Apply" actions in the UI just
 * stage changes; only Export materializes them.
 *
 * Body shape:
 *   {
 *     pending: {
 *       <snapshotIndex>: {
 *         <friendlyBlockName>: {
 *           enabled?: boolean,
 *           params?: { <paramName>: number }
 *         }
 *       }
 *     }
 *   }
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  applySnapshotPatch,
  stringifyHelixPreset,
  type SnapshotPatch,
  type HelixPreset,
  type BlockNode,
} from "@music-apps/gain-estimator";

import { PRESET_DIR, readActiveMaster } from "@/lib/masterStore";

export const dynamic = "force-dynamic";

type PendingBlock = { enabled?: boolean; params?: { [param: string]: number } };
type PendingPerSnapshot = { [blockName: string]: PendingBlock };
type Pending = { [snapshotIndex: string]: PendingPerSnapshot };

/**
 * A preset-level block insertion staged by the new gain-targets flow. When
 * present, a fresh block is written to tone[dsp][slot] before the per-snapshot
 * patches run, so the patches can reference it by its friendly name.
 */
type PendingInsertion = {
  dsp: string;
  slot: string;
  model: string;
  defaults?: Record<string, number>;
};

function applyInsertion(preset: HelixPreset, ins: PendingInsertion): boolean {
  const dspMap = (preset.data.tone as Record<string, unknown>)[ins.dsp] as
    | { [slot: string]: unknown }
    | undefined;
  if (!dspMap) return false;
  const newBlock: BlockNode = {
    "@model": ins.model,
    "@enabled": false,
    "@no_snapshot_bypass": false,
    "@path": 0,
    "@position": 0,
    "@stereo": false,
    "@type": 0,
    ...(ins.defaults ?? {}),
  } as BlockNode;
  dspMap[ins.slot] = newBlock;
  return true;
}

/**
 * Write the preset-level Output Block gain (the absolute baseline knob).
 * Mirrors the value to all four output slots: {dsp0,dsp1} × {outputA,outputB}.
 * This is the single dB knob that shifts the whole preset relative to other
 * presets — separate from per-snapshot relative alignment (ChVol on amps).
 */
function setOutputGain(preset: HelixPreset, gainDb: number): number {
  let count = 0;
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const dspMap = preset.data.tone[dsp] as Record<string, unknown> | undefined;
    if (!dspMap) continue;
    for (const slot of ["outputA", "outputB"]) {
      const node = dspMap[slot] as { gain?: number } | undefined;
      if (node && typeof node === "object") {
        node.gain = gainDb;
        count += 1;
      }
    }
  }
  return count;
}

function dispositionHeader(fileName: string): string {
  const ascii = fileName.replace(/[—–]/g, "-").replace(/[^\x20-\x7E]/g, "_");
  const utf8 = encodeURIComponent(fileName);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pending?: Pending;
      outputGain?: number;
      insertion?: PendingInsertion;
    };
    const pending = body.pending ?? {};

    let preset = readActiveMaster();
    let totalEnabled = 0;
    let totalBypassed = 0;
    let totalParams = 0;
    let totalUnresolved = 0;
    let outputGainWritten = 0;
    let insertionApplied = false;

    if (typeof body.outputGain === "number" && Number.isFinite(body.outputGain)) {
      outputGainWritten = setOutputGain(preset, body.outputGain);
    }

    // Apply structural insertion FIRST so per-snapshot patches can resolve the
    // new block by friendly name when they reference it.
    if (body.insertion) {
      insertionApplied = applyInsertion(preset, body.insertion);
    }

    for (const [idxStr, perSnap] of Object.entries(pending)) {
      const idx = Number(idxStr);
      if (!Number.isFinite(idx) || idx < 0 || idx > 7) continue;

      const enable: string[] = [];
      const bypass: string[] = [];
      const params: { [block: string]: { [p: string]: number } } = {};

      for (const [blockName, changes] of Object.entries(perSnap)) {
        if (changes.enabled === true) enable.push(blockName);
        else if (changes.enabled === false) bypass.push(blockName);
        if (changes.params) params[blockName] = changes.params;
      }

      const patch: SnapshotPatch = {
        targetSnapshotIndex: idx,
        enable,
        bypass,
        params,
      };
      const { preset: next, report } = applySnapshotPatch(preset, patch);
      preset = next;
      totalEnabled += report.enabledBlocks.length;
      totalBypassed += report.bypassedBlocks.length;
      totalParams += report.paramsSet.length;
      totalUnresolved += report.unresolved.length;
    }

    const body_str = stringifyHelixPreset(preset);

    // Also save a copy alongside the master in PRESET_DIR — handy when the
    // dir is sync'd (iCloud Drive, Dropbox, etc) so a second Mac can grab the
    // edited file from Finder without going through the browser download.
    const outPath = join(PRESET_DIR, `active-master — edited.hlx`);
    writeFileSync(outPath, body_str, "utf-8");

    const fileName = `${preset.data.meta.name || "preset"} — edited.hlx`;
    return new Response(body_str, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": dispositionHeader(fileName),
        "X-Enabled-Count": String(totalEnabled),
        "X-Bypassed-Count": String(totalBypassed),
        "X-Params-Set-Count": String(totalParams),
        "X-Unresolved-Count": String(totalUnresolved),
        "X-Output-Gain-Slots-Written": String(outputGainWritten),
        "X-Block-Inserted": String(insertionApplied),
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
