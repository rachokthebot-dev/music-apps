/**
 * POST /api/preset/[slot]/preview
 *
 * Same input shape as /api/preset/[slot]/export, but does NOT write a file.
 * Applies pending changes in-memory, runs the gain estimator, and returns
 * the updated loudness landscape + per-snapshot deltas.
 *
 * Used by the editor to live-preview what Align Gain's staged changes would
 * do to the loudness numbers, without the user having to Export + re-import
 * to see them.
 */

import {
  applySnapshotPatch,
  estimateAllSnapshots,
  type SnapshotPatch,
  type BlockNode,
  type HelixPreset,
} from "@music-apps/gain-estimator";

import { isSlot, readSlot } from "@/lib/masterStore";

export const dynamic = "force-dynamic";

type PendingBlock = { enabled?: boolean; params?: { [param: string]: number } };
type PendingPerSnapshot = { [blockName: string]: PendingBlock };
type Pending = { [snapshotIndex: string]: PendingPerSnapshot };

type PendingInsertion = {
  dsp: string;
  slot: string;
  model: string;
  defaults?: Record<string, number>;
};

function applyInsertion(preset: HelixPreset, ins: PendingInsertion): void {
  const dspMap = (preset.data.tone as Record<string, unknown>)[ins.dsp] as
    | { [slot: string]: unknown }
    | undefined;
  if (!dspMap) return;
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
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slot: string }> }
) {
  const { slot } = await params;
  if (!isSlot(slot)) {
    return Response.json({ ok: false, error: "slot must be 'a' or 'b'" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as { pending?: Pending; insertion?: PendingInsertion };
    const pending = body.pending ?? {};

    // Start from the slot's preset, layer pending changes on top in-memory.
    let preset = readSlot(slot);

    // Apply structural insertion first so per-snapshot patches can resolve the
    // inserted block's friendly name.
    if (body.insertion) {
      preset = JSON.parse(JSON.stringify(preset)) as HelixPreset;
      applyInsertion(preset, body.insertion);
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
      const { preset: next } = applySnapshotPatch(preset, patch);
      preset = next;
    }

    const all = estimateAllSnapshots(preset);
    const baselineRaw = all[0].loudnessDb;
    const loudness = all.map((s) => ({
      index: s.snapshotIndex,
      name: s.snapshotName,
      loudnessDb: Number((s.loudnessDb - baselineRaw).toFixed(2)),
      rawLoudnessDb: Number(s.loudnessDb.toFixed(2)),
    }));

    return Response.json({ ok: true, loudness });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
