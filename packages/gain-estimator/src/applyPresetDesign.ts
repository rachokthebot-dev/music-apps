/**
 * Apply a designed preset onto the structural skeleton.
 *
 * Input is a `PresetDesign` — the LLM's choice of chain blocks, snapshot
 * configurations, and metadata. We do:
 *   1. Clone the skeleton (controller, global, variax, dt0/dt1, powercabs, …)
 *   2. Wipe the existing chain + snapshot state
 *   3. Place every block from `design.chain` using HelAIx catalog defaults
 *   4. Set every snapshot's enabled-blocks map and per-block param overrides
 *   5. Apply the deterministic solo derivation rules
 *   6. Set preset name + snapshot names
 *
 * Output is a HelixPreset ready to stringify and import into HX Edit.
 *
 * The applier is INTENTIONALLY DUMB — it follows the design verbatim. The LLM
 * is responsible for picking valid block IDs and sensible chain order. We
 * validate model IDs against the HelAIx catalog and report any that can't be
 * resolved; the post-pass doesn't try to "fix" the design itself.
 */

import {
  cloneSkeleton,
  placeBlock,
  setSnapshotName,
  setPresetName,
  clearChainBlocks,
  clearAllSnapshots,
} from "./presetSkeleton";
import { getCatalogEntry } from "./catalog";
import type { HelixPreset } from "./types";

// ---------------------------------------------------------------------------
// Public types — the LLM's output schema, validated here before applying
// ---------------------------------------------------------------------------

export type DesignedBlock = {
  /** Which slot to occupy (e.g. "block0"). */
  slot: string;
  /** Which DSP — "dsp0" (main) or "dsp1" (rarely used in our designs). */
  dsp: "dsp0" | "dsp1";
  /** Helix model id (HD2_…). Must exist in the HelAIx catalog. */
  model: string;
  /** Signal path within the DSP: 0 (main) or 1 (parallel after split). */
  path: 0 | 1;
  /** Order within the path (0..N). */
  position: number;
  /** For amps: which cab slot to pair with (e.g. "cab0"). */
  cab?: string;
};

export type DesignedSnapshot = {
  /** 0..7 — index into the 8 snapshot slots. */
  index: number;
  /** Display name for the Helix LT footswitch (max 16 chars). */
  name: string;
  /** Set of slot ids that are enabled in this snapshot (e.g. ["block0","block2"]). */
  enabledBlocks: string[];
  /** Per-block param overrides for this snapshot. Keyed by slot id. */
  params: { [slot: string]: { [paramName: string]: number } };
};

export type PresetDesign = {
  presetName: string;
  chain: DesignedBlock[];
  snapshots: DesignedSnapshot[];
  designNotes?: string;
};

export type ApplyDesignReport = {
  placed: number;
  snapshotsConfigured: number;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyPresetDesign(
  design: PresetDesign
): { preset: HelixPreset; report: ApplyDesignReport } {
  const preset = cloneSkeleton();
  const report: ApplyDesignReport = { placed: 0, snapshotsConfigured: 0, warnings: [] };

  setPresetName(preset, design.presetName || "DESIGNED");

  // Wipe the skeleton's placeholder chain + snapshot state
  clearChainBlocks(preset, "dsp0");
  clearChainBlocks(preset, "dsp1");
  clearAllSnapshots(preset);

  // Place chain blocks
  for (const blk of design.chain) {
    if (!getCatalogEntry(blk.model)) {
      report.warnings.push(`unknown model: ${blk.model} (slot ${blk.dsp}/${blk.slot})`);
      continue;
    }
    const ok = placeBlock(preset, blk.dsp, blk.slot, blk.model, {
      path: blk.path,
      position: blk.position,
      cab: blk.cab,
    });
    if (!ok) {
      report.warnings.push(`failed to place ${blk.model} at ${blk.dsp}/${blk.slot}`);
      continue;
    }
    report.placed += 1;
  }

  // Auto-recover from LLM errors where an amp points at a cab slot that was
  // never actually placed. Pick a sensible 4x12 default (works for Marshall-
  // style and most rock-leaning amps). Catches qwen-hermes' orphan-cab failure.
  const defaultCab = (ampModel: string): string => {
    const e = getCatalogEntry(ampModel);
    const basedOn = (e?.BasedOn ?? "").toLowerCase();
    if (basedOn.includes("vox") || basedOn.includes("ac15") || basedOn.includes("ac30")) {
      return "HD2_CabMicIr_2x12BlueBell";
    }
    if (basedOn.includes("fender") || basedOn.includes("princeton") || basedOn.includes("deluxe") || basedOn.includes("twin")) {
      return "HD2_CabMicIr_1x12USDeluxe";
    }
    if (basedOn.includes("mesa") || basedOn.includes("rectifier") || basedOn.includes("dual")) {
      return "HD2_CabMicIr_4x12CaliV30";
    }
    return "HD2_CabMicIr_4x12Greenback25"; // Marshall / generic high-gain default
  };

  for (const blk of design.chain) {
    if (!blk.model.startsWith("HD2_Amp") || !blk.cab) continue;
    const dspMap = preset.data.tone[blk.dsp] as Record<string, unknown> | undefined;
    if (!dspMap || dspMap[blk.cab]) continue; // cab already placed correctly
    const cabModel = defaultCab(blk.model);
    const placedCab = placeBlock(preset, blk.dsp, blk.cab, cabModel, {
      path: blk.path,
      position: blk.position,
    });
    if (placedCab) {
      report.warnings.push(
        `auto-paired ${blk.model} (${blk.slot}) with default cab ${cabModel} (LLM did not place ${blk.cab})`
      );
      report.placed += 1;
    }
  }

  // Configure each snapshot — enable bits + params
  for (const snap of design.snapshots) {
    if (snap.index < 0 || snap.index > 7) {
      report.warnings.push(`snapshot index out of range: ${snap.index}`);
      continue;
    }
    if (snap.name) setSnapshotName(preset, snap.index, snap.name);

    const snapNode = preset.data.tone[`snapshot${snap.index}` as keyof typeof preset.data.tone] as
      | {
          blocks?: { [dsp: string]: { [slot: string]: boolean } };
          controllers?: {
            [dsp: string]: {
              [slot: string]: { [param: string]: { "@value": number; "@fs_enabled"?: boolean } };
            };
          };
        }
      | undefined;
    if (!snapNode) continue;

    snapNode.blocks ??= {};
    snapNode.controllers ??= {};

    // Compute enable state for every slot in the chain (default OFF; flip ON per design)
    for (const blk of design.chain) {
      snapNode.blocks[blk.dsp] ??= {};
      snapNode.blocks[blk.dsp][blk.slot] = snap.enabledBlocks.includes(blk.slot);
    }

    // The skeleton includes split/join structural blocks in dsp0 and dsp1.
    // Real Helix presets always include "split" in every snapshot's blocks
    // map with True; omitting it makes HX Edit treat the split as bypassed
    // and route signal incorrectly. Mirror that here.
    for (const dspKey of ["dsp0", "dsp1"] as const) {
      const dspMap = preset.data.tone[dspKey] as Record<string, unknown> | undefined;
      if (!dspMap) continue;
      for (const structural of ["split", "join"]) {
        if (structural in dspMap) {
          snapNode.blocks[dspKey] ??= {};
          if (!(structural in snapNode.blocks[dspKey])) {
            snapNode.blocks[dspKey][structural] = true;
          }
        }
      }
    }

    // Per-block param overrides
    for (const [slot, params] of Object.entries(snap.params)) {
      const blk = design.chain.find((b) => b.slot === slot);
      if (!blk) {
        report.warnings.push(`snapshot[${snap.index}] params reference unknown slot ${slot}`);
        continue;
      }
      snapNode.controllers[blk.dsp] ??= {};
      snapNode.controllers[blk.dsp][blk.slot] ??= {};
      for (const [pname, value] of Object.entries(params)) {
        snapNode.controllers[blk.dsp][blk.slot][pname] ??= { "@value": 0, "@fs_enabled": false };
        snapNode.controllers[blk.dsp][blk.slot][pname]["@value"] = value;
      }
    }

    report.snapshotsConfigured += 1;
  }

  return { preset, report };
}
