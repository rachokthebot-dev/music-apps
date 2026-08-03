/**
 * Core estimator — pure functions over a Helix preset's JSON.
 * No package-internal cycles: only depends on types + blockGain.
 */

import type { HelixPreset, BlockNode, SnapshotNode } from "./types";
import { gainForModel, type GainContext } from "./blockGain";

export type SnapshotLoudness = {
  snapshotIndex: number;
  snapshotName: string;
  loudnessDb: number;
  contributions: Array<{
    dsp: string;
    slot: string;
    model: string;
    enabled: boolean;
    db: number | null;
    note?: string;
  }>;
};

export type ParamOverride = {
  dsp: string;
  slot: string;
  param: string;
  value: number;
};

function readParamValue(
  block: BlockNode,
  snapshot: SnapshotNode,
  dsp: string,
  slot: string,
  paramName: string
): number | undefined {
  const override = snapshot.controllers?.[dsp]?.[slot]?.[paramName]?.["@value"];
  if (typeof override === "number") return override;

  const defaultVal = block[paramName];
  if (typeof defaultVal === "number") return defaultVal;
  if (
    defaultVal &&
    typeof defaultVal === "object" &&
    "@value" in defaultVal &&
    typeof (defaultVal as { "@value": unknown })["@value"] === "number"
  ) {
    return (defaultVal as { "@value": number })["@value"];
  }
  return undefined;
}

function isEnabled(
  block: BlockNode,
  snapshot: SnapshotNode,
  dsp: string,
  slot: string
): boolean {
  const snapOverride = snapshot.blocks?.[dsp]?.[slot];
  if (typeof snapOverride === "boolean") return snapOverride;
  return Boolean(block["@enabled"]);
}

function listChainBlocks(preset: HelixPreset): Array<{ dsp: string; slot: string; block: BlockNode }> {
  const out: Array<{ dsp: string; slot: string; block: BlockNode }> = [];
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      if (typeof block["@model"] !== "string") continue;
      out.push({ dsp, slot, block });
    }
  }
  return out;
}

function getSnapshot(preset: HelixPreset, snapIdx: number): SnapshotNode {
  if (snapIdx < 0 || snapIdx > 7) throw new Error(`snapshot index out of range: ${snapIdx}`);
  const snap = preset.data.tone[`snapshot${snapIdx}` as keyof typeof preset.data.tone] as
    | SnapshotNode
    | undefined;
  if (!snap) throw new Error(`snapshot${snapIdx} missing from preset`);
  return snap;
}

function applyOverrides(preset: HelixPreset, snapIdx: number, overrides: ParamOverride[]): HelixPreset {
  const copy = JSON.parse(JSON.stringify(preset)) as HelixPreset;
  const snap = getSnapshot(copy, snapIdx);
  snap.controllers ??= {};
  for (const o of overrides) {
    snap.controllers[o.dsp] ??= {};
    snap.controllers[o.dsp][o.slot] ??= {};
    snap.controllers[o.dsp][o.slot][o.param] ??= { "@value": 0, "@fs_enabled": false };
    snap.controllers[o.dsp][o.slot][o.param]["@value"] = o.value;
  }
  return copy;
}

export function estimateSnapshotLoudness(preset: HelixPreset, snapIdx: number): SnapshotLoudness {
  const snap = getSnapshot(preset, snapIdx);
  const contributions: SnapshotLoudness["contributions"] = [];
  let totalDb = 0;

  for (const { dsp, slot, block } of listChainBlocks(preset)) {
    const model = block["@model"] as string;
    const enabled = isEnabled(block, snap, dsp, slot);

    if (!enabled) {
      contributions.push({ dsp, slot, model, enabled: false, db: 0, note: "bypassed" });
      continue;
    }

    const ctx: GainContext = {
      paramValue: (p) => readParamValue(block, snap, dsp, slot, p),
    };
    const db = gainForModel(model, ctx);
    if (db === null) {
      contributions.push({
        dsp,
        slot,
        model,
        enabled: true,
        db: null,
        note: "unknown block model — gain unmodeled, treated as 0 dB",
      });
      continue;
    }
    contributions.push({ dsp, slot, model, enabled: true, db });
    totalDb += db;
  }

  // Path outputs aren't "blockN" slots, so the chain walk misses them — but
  // they're the last gain stage before the jacks and preset authors use them as
  // the master level. MAN IN A BOX ships +8.2 dB on path 1 and +2.7 on path 2;
  // ignoring that under-reported the preset by nearly 11 dB.
  // Path 1's output says where it goes: 2 = "Path 2A" (into path 2), anything
  // else = straight to the jacks. When it goes straight out, path 2 carries no
  // signal and its output level is inert — counting it would credit a preset
  // for gain nothing passes through.
  const path1Out = (preset.data.tone.dsp0 as { outputA?: BlockNode } | undefined)?.outputA;
  const feedsPath2 = path1Out?.["@output"] === 2;
  const livePaths = feedsPath2 ? (["dsp0", "dsp1"] as const) : (["dsp0"] as const);

  for (const dsp of livePaths) {
    const out = (preset.data.tone[dsp] as { outputA?: BlockNode } | undefined)?.outputA;
    if (!out) continue;
    const db = readParamValue(out, snap, dsp, "outputA", "gain") ?? 0;
    if (db === 0) continue;
    contributions.push({
      dsp,
      slot: "outputA",
      model: String(out["@model"] ?? "HD2_AppDSPFlowOutput"),
      enabled: true,
      db,
    });
    totalDb += db;
  }

  return {
    snapshotIndex: snapIdx,
    snapshotName: snap["@name"] ?? `snapshot${snapIdx}`,
    loudnessDb: totalDb,
    contributions,
  };
}

export function predictLoudnessChange(
  preset: HelixPreset,
  snapIdx: number,
  overrides: ParamOverride[]
): SnapshotLoudness {
  const patched = applyOverrides(preset, snapIdx, overrides);
  return estimateSnapshotLoudness(patched, snapIdx);
}

export function estimateAllSnapshots(preset: HelixPreset): SnapshotLoudness[] {
  const out: SnapshotLoudness[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(estimateSnapshotLoudness(preset, i));
  }
  return out;
}
