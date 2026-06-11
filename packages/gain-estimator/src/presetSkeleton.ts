/**
 * Preset skeleton — the structural shell of a Helix preset.
 *
 * Source is the phelix GeneratorTemplate (verified to round-trip through HX Edit),
 * vendored as JSON next to the HelAIx catalog. We keep ALL the boilerplate
 * (controller, global, variax, dt0/dt1, powercab*, snapshot structure) and just
 * overwrite the chain blocks + snapshot configurations.
 *
 * This is what makes "design from blank" feasible — we don't have to know every
 * field a Helix preset needs, we inherit them from a known-good template.
 */

import skeletonData from "../data/skeleton.hlx.json";
import { getCatalogEntry } from "./catalog";
import type { HelixPreset } from "./types";

/** Slots available for placing chain blocks in the skeleton. */
export const AVAILABLE_SLOTS = {
  dsp0: { path0: ["block0", "block1", "block2", "block3", "block4"] as const },
  dsp1: { path0: ["block0", "block1", "block2", "block3", "block4"] as const },
} as const;

/** Deep-clone the skeleton so the original JSON import isn't mutated. */
export function cloneSkeleton(): HelixPreset {
  return JSON.parse(JSON.stringify(skeletonData)) as HelixPreset;
}

/**
 * Drop a block's full default definition into a slot.
 * Used by applyPresetDesign to construct the chain from scratch.
 *
 * Reads the @-attributes + parameter defaults from the HelAIx catalog so each
 * placed block looks like it was exported from a freshly-loaded Helix model.
 *
 * Also FILLS IN required @-attrs that HelAIx's catalog is missing — most
 * notably `@type` for cab blocks (30 of 33 cab entries have no @type, which
 * causes HX Edit to choke on import). Inferred per category by comparing
 * HelAIx defaults against a known-working real preset (user's master).
 */
export function placeBlock(
  preset: HelixPreset,
  dsp: "dsp0" | "dsp1",
  slot: string,
  model: string,
  overrides: { path?: number; position?: number; cab?: string } = {}
): boolean {
  const entry = getCatalogEntry(model);
  if (!entry?.Data?.Defaults) return false;

  const defaults = JSON.parse(JSON.stringify(entry.Data.Defaults)) as Record<string, unknown>;
  if (overrides.path !== undefined) defaults["@path"] = overrides.path;
  if (overrides.position !== undefined) defaults["@position"] = overrides.position;
  if (overrides.cab !== undefined) defaults["@cab"] = overrides.cab;

  // Fill any required @-attrs the catalog forgot.
  completeBlockDefaults(model, defaults);

  const dspMap = preset.data.tone[dsp] as Record<string, unknown> | undefined;
  if (!dspMap) return false;
  dspMap[slot] = defaults;
  return true;
}

/**
 * Category → required @-attrs that every working preset has.
 * Derived from inspecting a known-good real master preset side-by-side
 * with HelAIx catalog entries to find the gaps.
 */
function completeBlockDefaults(model: string, defaults: Record<string, unknown>): void {
  // Every block needs @no_snapshot_bypass — HelAIx has it on most, but is
  // inconsistent on cabs and a few drives. Default is false.
  if (!("@no_snapshot_bypass" in defaults)) {
    defaults["@no_snapshot_bypass"] = false;
  }

  // Per-category @type (only fill when missing — never override a value the
  // catalog already chose, since some firmware-specific values may apply).
  if (!("@type" in defaults) || defaults["@type"] === null) {
    let type: number | null = null;
    if (model.startsWith("HD2_Cab")) type = 2;
    else if (model.startsWith("HD2_Amp")) type = 1;
    else if (model.startsWith("HD2_Delay") || model.startsWith("HD2_DL4")) type = 7;
    else if (model.startsWith("HD2_Reverb")) type = 7;
    else if (model.startsWith("HD2_Dist")) type = 0;
    else if (model.startsWith("HD2_Compressor") || model.startsWith("HD2_DM4") || model.startsWith("HD2_Gate")) type = 0;
    else if (model.startsWith("HD2_EQ") || model.startsWith("HD2_CaliQ")) type = 0;
    else if (model.startsWith("HD2_VolPan")) type = 0;
    else if (model.startsWith("HD2_Wah")) type = 0;
    else if (/^HD2_(Chorus|Flanger|Phaser|Tremolo|Vibrato|Rotary|MM4)/.test(model)) type = 0;
    if (type !== null) defaults["@type"] = type;
  }

  // Cabs need @bypassvolume as 1 (matches real master); HelAIx omits it.
  if (model.startsWith("HD2_Cab") && !("@bypassvolume" in defaults)) {
    defaults["@bypassvolume"] = 1;
  }
}

/**
 * Set the snapshot name (visible on the Helix LT footswitch).
 * Defaults coming from the skeleton are SNAPSHOT 1..8 — we rename them.
 */
export function setSnapshotName(preset: HelixPreset, snapIdx: number, name: string): void {
  const snap = preset.data.tone[`snapshot${snapIdx}` as keyof typeof preset.data.tone] as
    | { "@name"?: string }
    | undefined;
  if (snap) snap["@name"] = name.toUpperCase().slice(0, 16);
}

/** Set the preset's display name (top of the Helix LT screen). */
export function setPresetName(preset: HelixPreset, name: string): void {
  preset.data.meta.name = name.slice(0, 16);
}

/**
 * Clear blocks from a DSP path so we can re-populate from scratch. Leaves
 * input/output/split/join structural slots in place.
 */
export function clearChainBlocks(preset: HelixPreset, dsp: "dsp0" | "dsp1"): void {
  const dspMap = preset.data.tone[dsp] as Record<string, unknown> | undefined;
  if (!dspMap) return;
  for (const slot of Object.keys(dspMap)) {
    if (slot.startsWith("block") || slot.startsWith("cab")) {
      delete dspMap[slot];
    }
  }
}

/** Reset all snapshot enable/bypass + controller overrides so we can rebuild them. */
export function clearAllSnapshots(preset: HelixPreset): void {
  for (let i = 0; i < 8; i++) {
    const snap = preset.data.tone[`snapshot${i}` as keyof typeof preset.data.tone] as
      | { blocks?: unknown; controllers?: unknown }
      | undefined;
    if (snap) {
      snap.blocks = {};
      snap.controllers = {};
    }
  }
}
