/**
 * Apply a general snapshot patch to a Helix preset.
 *
 * More general than applyProposals (which is alignment-specific): handles
 * enable/bypass toggles AND parameter overrides on a single snapshot.
 *
 * Friendly block names are resolved by walking the master's chain and
 * matching against friendlyBlock() output. Unresolved names land in
 * the report so the caller can surface them.
 */

import type { HelixPreset, BlockNode } from "./types";
import { friendlyBlock } from "./blockNames";

export type SnapshotPatch = {
  targetSnapshotIndex: number;
  enable?: string[];                  // friendly block names → set blocks[dsp][slot] = true
  bypass?: string[];                  // friendly block names → set false
  params?: {
    [friendlyBlockName: string]: { [param: string]: number };
  };
};

export type ApplyReport = {
  targetSnapshotIndex: number;
  enabledBlocks: Array<{ name: string; dsp: string; slot: string }>;
  bypassedBlocks: Array<{ name: string; dsp: string; slot: string }>;
  paramsSet: Array<{ block: string; dsp: string; slot: string; param: string; value: number }>;
  unresolved: Array<{ name: string; where: "enable" | "bypass" | "params" }>;
};

/**
 * Build a friendly-name → {dsp, slot, block} map for every block in the preset's chain.
 * Used to resolve patch entries to specific JSON paths.
 */
function buildChainIndex(preset: HelixPreset): Map<string, { dsp: string; slot: string; block: BlockNode }> {
  const out = new Map<string, { dsp: string; slot: string; block: BlockNode }>();
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      const model = block["@model"];
      if (typeof model !== "string") continue;
      out.set(friendlyBlock(model), { dsp, slot, block });
    }
  }
  return out;
}

/**
 * Case-insensitive lookup that also tolerates "Amp (US Double)" vs "US Double"
 * and a few other variants. Tries exact match first, then substring fallback.
 */
function lookupBlock(
  index: Map<string, { dsp: string; slot: string; block: BlockNode }>,
  name: string
): { dsp: string; slot: string; block: BlockNode } | null {
  if (index.has(name)) return index.get(name)!;
  const lower = name.toLowerCase().trim();
  for (const [k, v] of index) {
    if (k.toLowerCase() === lower) return v;
  }
  // Strip the parenthetical or category prefix and try again
  const stripped = lower.replace(/^(amp|drive|comp|gate|eq|delay|reverb|volume|cab|mod|filter|pitch|wah)\s*\(/, "").replace(/\)$/, "").trim();
  for (const [k, v] of index) {
    const inner = k.toLowerCase().replace(/^\w+\s*\(/, "").replace(/\)$/, "");
    if (inner === stripped) return v;
  }
  // Substring fallback (the model name alone, e.g. "JCM800" matches "Amp (JCM800)")
  for (const [k, v] of index) {
    if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) return v;
  }
  return null;
}

export function applySnapshotPatch(preset: HelixPreset, patch: SnapshotPatch): {
  preset: HelixPreset;
  report: ApplyReport;
} {
  const copy = JSON.parse(JSON.stringify(preset)) as HelixPreset;
  const idx = buildChainIndex(copy);
  const snapKey = `snapshot${patch.targetSnapshotIndex}` as const;
  const snap = copy.data.tone[snapKey] as
    | {
        blocks?: { [dsp: string]: { [slot: string]: boolean } };
        controllers?: {
          [dsp: string]: {
            [slot: string]: { [param: string]: { "@value": number; "@fs_enabled"?: boolean } };
          };
        };
      }
    | undefined;

  const report: ApplyReport = {
    targetSnapshotIndex: patch.targetSnapshotIndex,
    enabledBlocks: [],
    bypassedBlocks: [],
    paramsSet: [],
    unresolved: [],
  };

  if (!snap) {
    throw new Error(`snapshot${patch.targetSnapshotIndex} missing from preset`);
  }
  snap.blocks ??= {};
  snap.controllers ??= {};

  for (const name of patch.enable ?? []) {
    const found = lookupBlock(idx, name);
    if (!found) {
      report.unresolved.push({ name, where: "enable" });
      continue;
    }
    snap.blocks[found.dsp] ??= {};
    snap.blocks[found.dsp][found.slot] = true;
    report.enabledBlocks.push({ name, dsp: found.dsp, slot: found.slot });
  }

  for (const name of patch.bypass ?? []) {
    const found = lookupBlock(idx, name);
    if (!found) {
      report.unresolved.push({ name, where: "bypass" });
      continue;
    }
    snap.blocks[found.dsp] ??= {};
    snap.blocks[found.dsp][found.slot] = false;
    report.bypassedBlocks.push({ name, dsp: found.dsp, slot: found.slot });
  }

  for (const [name, params] of Object.entries(patch.params ?? {})) {
    const found = lookupBlock(idx, name);
    if (!found) {
      report.unresolved.push({ name, where: "params" });
      continue;
    }
    snap.controllers[found.dsp] ??= {};
    snap.controllers[found.dsp][found.slot] ??= {};
    for (const [paramName, value] of Object.entries(params)) {
      snap.controllers[found.dsp][found.slot][paramName] ??= { "@value": 0, "@fs_enabled": false };
      snap.controllers[found.dsp][found.slot][paramName]["@value"] = value;
      report.paramsSet.push({
        block: name,
        dsp: found.dsp,
        slot: found.slot,
        param: paramName,
        value,
      });
    }
  }

  return { preset: copy, report };
}
