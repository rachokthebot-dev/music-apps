/**
 * Deterministic gain aligner.
 *
 * Takes the estimator's per-snapshot loudness readings and computes the
 * smallest tonal-impact adjustment to bring each snapshot to its target.
 *
 * v1 rules (locked):
 *   - Baseline: CLEAN snapshot (index 0) is 0 dB by definition
 *   - Other rhythm snapshots target = 0 dB (equal-loud with CLEAN)
 *   - Solo snapshots target = sibling rhythm + lift (strict +3 dB or genre-aware)
 *   - Adjust only the active amp's ChVol and the Boost block's Gain
 *   - When target is unreachable within those knobs, return a conflict for the
 *     user to decide (we do NOT silently touch Drive or other tone-affecting knobs)
 *
 * Sibling mapping is fixed by the master's snapshot naming convention:
 *   CLEAN ↔ CLEAN SOLO   (0 ↔ 4)
 *   JAZZ ↔ JAZZ SOLO     (1 ↔ 5)
 *   ROCK RHY ↔ ROCK SOLO (2 ↔ 6)
 *   HEAVY RHY ↔ HEAVY SOLO (3 ↔ 7)
 */

import type { HelixPreset, BlockNode } from "./types";
import { estimateSnapshotLoudness, predictLoudnessChange, type ParamOverride } from "./estimator";
import { friendlyBlock, friendlyParam } from "./blockNames";

/** A proposed parameter change with friendly labels attached. */
export type Change = ParamOverride & {
  block: string;       // friendly block name, e.g. "JCM800"
  paramLabel: string;  // friendly param name, e.g. "Channel Vol"
};

/**
 * Structural changes to the preset that can't be expressed as a param override.
 *   - enableBlock:  flip a snapshot-level enable override to true so a bypassed
 *                   block becomes active in just this snapshot.
 *   - (preset-level block insertion is reported on AlignmentResult.insertion, not here.)
 */
export type StructuralChange = {
  kind: "enableBlock";
  dsp: string;
  slot: string;
  block: string; // friendly name for UI display
};

export type SoloLiftMode = "strict_3db" | "genre_aware";

export type AlignmentConfig = {
  baselineIndex: number; // snapshot to treat as 0 dB (default 0 = CLEAN)
  soloLiftMode: SoloLiftMode;
  toleranceDb: number; // changes smaller than this are not proposed (default 0.5)
  /**
   * User-set per-snapshot targets in dB relative to the baseline snapshot.
   * Keyed by snapshot index. Missing entries fall back to the built-in tier/lift
   * defaults below (RHYTHM_TIER_DB + targetLiftFor). The baseline snapshot's
   * entry is ignored — it's always 0 by definition.
   */
  targets?: Record<number, number>;
  /**
   * When the ChVol+Boost fallback can't reach a target because no HD2_VolPanGain
   * block exists anywhere in the preset, allow inserting one into the first free
   * slot on the active amp's DSP path. Default false (preserve legacy behavior).
   */
  allowBoostInsertion?: boolean;
};

export const DEFAULT_CONFIG: AlignmentConfig = {
  baselineIndex: 0,
  soloLiftMode: "strict_3db",
  toleranceDb: 0.5,
};

// snapshot index → its solo sibling. 0..3 are rhythms, 4..7 are their solos.
const SOLO_SIBLING_OF: Record<number, number> = { 0: 4, 1: 5, 2: 6, 3: 7 };
const RHYTHM_SIBLING_OF: Record<number, number> = { 4: 0, 5: 1, 6: 2, 7: 3 };

// Rhythm-tier targets (dB above CLEAN). Heavies sit a touch above cleans by
// design — equal-loud across all rhythms makes HEAVY feel underpowered.
// 0 = CLEAN, 1 = JAZZ, 2 = ROCK RHY, 3 = HEAVY RHY.
const RHYTHM_TIER_DB: Record<number, number> = { 0: 0.0, 1: 0.0, 2: 1.5, 3: 2.5 };

// Genre-aware lifts: cleans need bigger lift to cut through, heavies need less
// because they're already compressed/present.
const GENRE_LIFT_DB: Record<number, number> = {
  4: 4.0, // CLEAN SOLO  — full lift to cut through
  5: 3.5, // JAZZ SOLO   — slightly more than strict
  6: 3.0, // ROCK SOLO   — standard
  7: 2.0, // HEAVY SOLO  — less, already loud
};

export function targetLiftFor(snapIdx: number, mode: SoloLiftMode): number {
  if (!(snapIdx in RHYTHM_SIBLING_OF)) return 0;
  return mode === "strict_3db" ? 3.0 : GENRE_LIFT_DB[snapIdx] ?? 3.0;
}

export type Proposal = {
  snapshotIndex: number;
  snapshotName: string;
  currentDb: number;
  targetDb: number;
  deltaDb: number; // target - current
  status: "no_change" | "adjusted" | "conflict";
  changes: Change[];                         // parameter overrides
  structuralChanges?: StructuralChange[];    // snapshot-level enable flips, etc.
  reasoning: string; // short deterministic explanation; LLM may rewrite later
  conflict?: {
    kind:
      | "chvol_saturated"
      | "boost_already_max"
      | "no_active_amp"
      | "no_slot_for_boost"
      | "boost_missing";
    detail: string;
  };
};

/**
 * Preset-level structural change: a new HD2_VolPanGain block to be inserted.
 * Computed once per alignment run and shared by all snapshots that reference it
 * (those snapshots emit an enableBlock structural change for the same dsp/slot).
 */
export type PresetInsertion = {
  dsp: string;
  slot: string;
  model: string;                          // "HD2_VolPanGain"
  block: string;                          // friendly name
  defaults: Record<string, number>;       // initial param values, e.g. {Gain: 0}
};

/** Build a Change record from a ParamOverride plus the block's model string. */
function changeFor(
  override: ParamOverride,
  blockModel: string
): Change {
  return {
    ...override,
    block: friendlyBlock(blockModel),
    paramLabel: friendlyParam(override.param),
  };
}

/**
 * Whether a specific block slot is enabled in a snapshot.
 * Snapshot's per-slot override wins over the block's default @enabled.
 */
function blockEnabledInSnapshot(
  preset: HelixPreset,
  snapIdx: number,
  dsp: string,
  slot: string
): boolean {
  const snap = preset.data.tone[`snapshot${snapIdx}` as keyof typeof preset.data.tone] as
    | { blocks?: { [dsp: string]: { [slot: string]: boolean } } }
    | undefined;
  const snapOverride = snap?.blocks?.[dsp]?.[slot];
  if (typeof snapOverride === "boolean") return snapOverride;
  const block = (preset.data.tone[dsp as "dsp0" | "dsp1"] as { [s: string]: BlockNode } | undefined)?.[slot];
  return Boolean(block?.["@enabled"]);
}

export type AlignmentResult = {
  baselineName: string;
  baselineRawDb: number; // raw estimator output (informational)
  proposals: Proposal[];
  unchanged: Proposal[];
  /** Set when a new HD2_VolPanGain block must be inserted to satisfy targets. */
  insertion?: PresetInsertion;
};

/**
 * Per-snapshot dB offset from a chosen baseline, computed from the estimator.
 * Used by the UI to prefill the targets panel: "if I just left things alone,
 * here's where each snapshot sits relative to the baseline I picked."
 */
export function currentMeasuredOffsets(
  preset: HelixPreset,
  baselineIndex: number
): Record<number, number> {
  const baselineDb = estimateSnapshotLoudness(preset, baselineIndex).loudnessDb;
  const out: Record<number, number> = {};
  for (let i = 0; i < 8; i++) {
    if (i === baselineIndex) continue;
    const db = estimateSnapshotLoudness(preset, i).loudnessDb;
    out[i] = Number((db - baselineDb).toFixed(2));
  }
  return out;
}

/**
 * Resolve the target dB for a snapshot. User-supplied targets win; missing
 * entries fall back to the built-in tier/lift defaults.
 */
function resolveTargetDb(snapIdx: number, config: AlignmentConfig): number {
  if (snapIdx === config.baselineIndex) return 0;
  if (config.targets && Object.prototype.hasOwnProperty.call(config.targets, snapIdx)) {
    return config.targets[snapIdx];
  }
  if (snapIdx in RHYTHM_SIBLING_OF) {
    const siblingIdx = RHYTHM_SIBLING_OF[snapIdx];
    const siblingTierDb = RHYTHM_TIER_DB[siblingIdx] ?? 0;
    return siblingTierDb + targetLiftFor(snapIdx, config.soloLiftMode);
  }
  return RHYTHM_TIER_DB[snapIdx] ?? 0;
}

/**
 * First free slot on a DSP path, preferring slots AFTER `afterSlotIdx` so the
 * inserted Boost sits post-amp. A slot is "free" if it doesn't exist or has no
 * @model set. Returns null if every slot on this path is occupied.
 *
 * Helix LT has 5 block slots per DSP path (block0..block4) but we scan up to 7
 * defensively in case a different Helix product is loaded.
 */
function findFreeSlotForBoost(
  preset: HelixPreset,
  dsp: string,
  afterSlotIdx: number
): { dsp: string; slot: string } | null {
  const SLOT_MAX = 7;
  const dspMap = (preset.data.tone as Record<string, unknown>)[dsp] as
    | { [slot: string]: unknown }
    | undefined;
  const isFree = (slot: string) => {
    const existing = dspMap?.[slot];
    if (!existing) return true;
    if (typeof existing !== "object") return true;
    const model = (existing as { "@model"?: unknown })["@model"];
    return !model || (typeof model === "string" && model.length === 0);
  };
  for (let i = afterSlotIdx + 1; i <= SLOT_MAX; i++) {
    const slot = `block${i}`;
    if (isFree(slot)) return { dsp, slot };
  }
  // No room after — fall back to any free slot on this path.
  for (let i = 0; i <= SLOT_MAX; i++) {
    const slot = `block${i}`;
    if (isFree(slot)) return { dsp, slot };
  }
  return null;
}

function slotIndex(slot: string): number {
  const m = /^block(\d+)$/.exec(slot);
  return m ? Number(m[1]) : -1;
}

/**
 * Find the slot of the active amp in a given snapshot.
 * Returns the dsp + slot of whichever HD2_Amp* block is enabled.
 */
function findActiveAmp(
  preset: HelixPreset,
  snapIdx: number
): { dsp: string; slot: string; block: BlockNode } | null {
  const snap = preset.data.tone[`snapshot${snapIdx}` as keyof typeof preset.data.tone];
  if (!snap || typeof snap !== "object") return null;
  const snapshotBlocks = (snap as { blocks?: { [dsp: string]: { [s: string]: boolean } } }).blocks;

  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      const model = block["@model"];
      if (typeof model !== "string" || !model.startsWith("HD2_Amp")) continue;
      const snapOverride = snapshotBlocks?.[dsp]?.[slot];
      const enabled = typeof snapOverride === "boolean" ? snapOverride : Boolean(block["@enabled"]);
      if (enabled) return { dsp, slot, block };
    }
  }
  return null;
}

/**
 * Find the Boost block (HD2_VolPanGain) in the master, regardless of enabled state.
 * (Boost can be enabled by the alignment if the snapshot needs a lift.)
 */
function findBoostBlock(preset: HelixPreset): { dsp: string; slot: string; block: BlockNode } | null {
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      const model = block["@model"];
      if (typeof model === "string" && model.startsWith("HD2_VolPanGain")) {
        return { dsp, slot, block };
      }
    }
  }
  return null;
}

/**
 * Given a desired dB change and a current ChVol value, return the new ChVol
 * that produces that delta under our log-curve model.
 * chvol_dB = 20 * log10(ChVol) so ChVol_new = ChVol_old * 10^(delta/20)
 * Clamped to [0.05, 1.0].
 */
function chvolForDeltaDb(currentChvol: number, deltaDb: number): number {
  const raw = currentChvol * Math.pow(10, deltaDb / 20);
  return Math.max(0.05, Math.min(1.0, raw));
}

function readParamValueNumber(
  block: BlockNode,
  snapshot: { controllers?: { [dsp: string]: { [s: string]: { [p: string]: { "@value": number } } } } },
  dsp: string,
  slot: string,
  paramName: string,
  fallback: number
): number {
  const override = snapshot.controllers?.[dsp]?.[slot]?.[paramName]?.["@value"];
  if (typeof override === "number") return override;
  const def = block[paramName];
  if (typeof def === "number") return def;
  if (def && typeof def === "object" && "@value" in def) {
    const v = (def as { "@value": unknown })["@value"];
    if (typeof v === "number") return v;
  }
  return fallback;
}

/**
 * Mutable per-run context shared across snapshots so we can:
 *   - reuse a single Boost insertion across multiple snapshots
 *   - decide insertion based on whichever amp.dsp we saw first
 */
type AlignmentContext = {
  insertion: PresetInsertion | null;
  insertionAttempted: boolean; // true once we tried and committed (or failed)
};

function buildAlignmentForSnapshot(
  preset: HelixPreset,
  snapIdx: number,
  baselineRawDb: number,
  config: AlignmentConfig,
  ctx: AlignmentContext
): Proposal {
  const currentEstimate = estimateSnapshotLoudness(preset, snapIdx);
  const currentDb = currentEstimate.loudnessDb - baselineRawDb;

  const targetDb = resolveTargetDb(snapIdx, config);
  const deltaDb = targetDb - currentDb;
  const snapshotName = currentEstimate.snapshotName;

  if (Math.abs(deltaDb) < config.toleranceDb) {
    return {
      snapshotIndex: snapIdx,
      snapshotName,
      currentDb,
      targetDb,
      deltaDb,
      status: "no_change",
      changes: [],
      reasoning: `already within ${config.toleranceDb} dB of target`,
    };
  }

  // Need to adjust. Active amp's ChVol is the primary tool.
  const amp = findActiveAmp(preset, snapIdx);
  if (!amp) {
    return {
      snapshotIndex: snapIdx,
      snapshotName,
      currentDb,
      targetDb,
      deltaDb,
      status: "conflict",
      changes: [],
      reasoning: "no active amp in this snapshot — cannot adjust loudness via ChVol",
      conflict: { kind: "no_active_amp", detail: "no HD2_Amp* block is enabled" },
    };
  }

  const snap = preset.data.tone[`snapshot${snapIdx}` as keyof typeof preset.data.tone];
  const snapshot = snap as { controllers?: { [dsp: string]: { [s: string]: { [p: string]: { "@value": number } } } } };
  const currentChvol = readParamValueNumber(amp.block, snapshot, amp.dsp, amp.slot, "ChVol", 1.0);

  const newChvol = chvolForDeltaDb(currentChvol, deltaDb);
  const chvolDeltaActual = 20 * Math.log10(newChvol / currentChvol);
  const residual = deltaDb - chvolDeltaActual;

  // If ChVol got clamped and there's still meaningful residual, fall back to
  // the Boost block (HD2_VolPanGain). Three sub-cases:
  //   (a) Boost exists and is enabled in this snapshot → adjust its Gain
  //   (b) Boost exists but is bypassed in this snapshot → enable + adjust Gain
  //   (c) No Boost block anywhere → insert one (if config allows) + enable + Gain
  if (Math.abs(residual) >= config.toleranceDb) {
    const ampName = friendlyBlock(amp.block["@model"] as string);

    // Resolve which Boost block to target. May already exist, or may be the
    // preset-level insertion we decided on earlier (or are committing now).
    let boostDsp: string | null = null;
    let boostSlot: string | null = null;
    let boostBlockModel = "HD2_VolPanGain";
    let currentBoostGain = 0;
    let boostBypassed = false;
    let needsInsertion = false;

    const existing = findBoostBlock(preset);
    if (existing) {
      boostDsp = existing.dsp;
      boostSlot = existing.slot;
      boostBlockModel = (existing.block["@model"] as string) ?? "HD2_VolPanGain";
      currentBoostGain = readParamValueNumber(
        existing.block,
        snapshot,
        existing.dsp,
        existing.slot,
        "Gain",
        0
      );
      boostBypassed = !blockEnabledInSnapshot(preset, snapIdx, existing.dsp, existing.slot);
    } else if (ctx.insertion) {
      // A prior snapshot already booked the insertion — reuse it.
      boostDsp = ctx.insertion.dsp;
      boostSlot = ctx.insertion.slot;
      currentBoostGain = ctx.insertion.defaults.Gain ?? 0;
      boostBypassed = true;
      needsInsertion = true;
    } else if (config.allowBoostInsertion && !ctx.insertionAttempted) {
      ctx.insertionAttempted = true;
      const free = findFreeSlotForBoost(preset, amp.dsp, slotIndex(amp.slot));
      if (free) {
        ctx.insertion = {
          dsp: free.dsp,
          slot: free.slot,
          model: "HD2_VolPanGain",
          block: friendlyBlock("HD2_VolPanGain"),
          defaults: { Gain: 0 },
        };
        boostDsp = free.dsp;
        boostSlot = free.slot;
        currentBoostGain = 0;
        boostBypassed = true;
        needsInsertion = true;
      }
    }

    if (boostDsp && boostSlot) {
      const newBoostGain = Math.max(-12, Math.min(12, currentBoostGain + residual));
      const boostChange = newBoostGain - currentBoostGain;
      // Boost can absorb the residual (within ±0.5 dB)?
      if (Math.abs(boostChange - residual) < 0.5) {
        const boostName = friendlyBlock(boostBlockModel);
        const structural: StructuralChange[] = [];
        if (boostBypassed) {
          structural.push({
            kind: "enableBlock",
            dsp: boostDsp,
            slot: boostSlot,
            block: boostName,
          });
        }
        const enableNote = boostBypassed
          ? needsInsertion
            ? `Inserted ${boostName} at ${boostDsp}.${boostSlot} (enabled here only). `
            : `Enabled ${boostName} for this snapshot. `
          : "";
        return {
          snapshotIndex: snapIdx,
          snapshotName,
          currentDb,
          targetDb,
          deltaDb,
          status: "adjusted",
          changes: [
            changeFor(
              { dsp: amp.dsp, slot: amp.slot, param: "ChVol", value: Number(newChvol.toFixed(3)) },
              amp.block["@model"] as string
            ),
            changeFor(
              { dsp: boostDsp, slot: boostSlot, param: "Gain", value: Number(newBoostGain.toFixed(2)) },
              boostBlockModel
            ),
          ],
          structuralChanges: structural.length ? structural : undefined,
          reasoning: `Need ${deltaDb >= 0 ? "+" : ""}${deltaDb.toFixed(2)} dB. ${ampName} Channel Vol ${currentChvol.toFixed(3)}→${newChvol.toFixed(3)} (${chvolDeltaActual >= 0 ? "+" : ""}${chvolDeltaActual.toFixed(2)} dB). ${enableNote}${boostName} Gain ${currentBoostGain.toFixed(2)}→${newBoostGain.toFixed(2)} dB (${boostChange >= 0 ? "+" : ""}${boostChange.toFixed(2)} dB).`,
        };
      }
    }

    // Couldn't close the gap within allowed knobs.
    const wouldNeed = residual >= 0 ? `+${residual.toFixed(2)} dB more` : `${residual.toFixed(2)} dB less`;
    const conflictKind: NonNullable<Proposal["conflict"]>["kind"] =
      !boostDsp && !config.allowBoostInsertion
        ? "boost_missing"
        : !boostDsp
          ? "no_slot_for_boost"
          : newChvol === 1.0
            ? "chvol_saturated"
            : "boost_already_max";
    const reason =
      conflictKind === "boost_missing"
        ? "no Boost block in preset and insertion is disabled"
        : conflictKind === "no_slot_for_boost"
          ? "no free slot to insert a Boost block"
          : newChvol === 1.0
            ? "ChVol saturated at max"
            : newChvol === 0.05
              ? "ChVol saturated at min"
              : "Boost cannot close the gap";
    return {
      snapshotIndex: snapIdx,
      snapshotName,
      currentDb,
      targetDb,
      deltaDb,
      status: "conflict",
      changes: [
        changeFor(
          { dsp: amp.dsp, slot: amp.slot, param: "ChVol", value: Number(newChvol.toFixed(3)) },
          amp.block["@model"] as string
        ),
      ],
      reasoning: `Partial fix: ${ampName} Channel Vol ${currentChvol.toFixed(3)}→${newChvol.toFixed(3)} (${chvolDeltaActual.toFixed(2)} dB). Still need ${wouldNeed}.`,
      conflict: { kind: conflictKind, detail: reason },
    };
  }

  // Verify with the estimator's predict function — guards against my model
  // saying one thing and the same model applied another way disagreeing.
  const predicted = predictLoudnessChange(preset, snapIdx, [
    { dsp: amp.dsp, slot: amp.slot, param: "ChVol", value: newChvol },
  ]);
  const predictedDb = predicted.loudnessDb - baselineRawDb;
  const predictedResidual = targetDb - predictedDb;

  const ampName = friendlyBlock(amp.block["@model"] as string);
  return {
    snapshotIndex: snapIdx,
    snapshotName,
    currentDb,
    targetDb,
    deltaDb,
    status: "adjusted",
    changes: [
      changeFor(
        { dsp: amp.dsp, slot: amp.slot, param: "ChVol", value: Number(newChvol.toFixed(3)) },
        amp.block["@model"] as string
      ),
    ],
    reasoning: `Need ${deltaDb >= 0 ? "+" : ""}${deltaDb.toFixed(2)} dB. ${ampName} Channel Vol ${currentChvol.toFixed(3)}→${newChvol.toFixed(3)} (${chvolDeltaActual >= 0 ? "+" : ""}${chvolDeltaActual.toFixed(2)} dB). Predicted residual ${predictedResidual.toFixed(2)} dB.`,
  };
}

export function alignGain(
  preset: HelixPreset,
  config: AlignmentConfig = DEFAULT_CONFIG
): AlignmentResult {
  const baseline = estimateSnapshotLoudness(preset, config.baselineIndex);
  const baselineRawDb = baseline.loudnessDb;
  const baselineName = baseline.snapshotName;

  const ctx: AlignmentContext = { insertion: null, insertionAttempted: false };
  const all: Proposal[] = [];
  for (let i = 0; i < 8; i++) {
    all.push(buildAlignmentForSnapshot(preset, i, baselineRawDb, config, ctx));
  }

  return {
    baselineName,
    baselineRawDb,
    proposals: all.filter((p) => p.status !== "no_change"),
    unchanged: all.filter((p) => p.status === "no_change"),
    insertion: ctx.insertion ?? undefined,
  };
}
