import {
  alignGain,
  applyProposals,
  DEFAULT_CONFIG,
  estimateAllSnapshots,
  type HelixPreset,
} from "@music-apps/gain-estimator";

export type Role = "clean" | "rhythm" | "chorus" | "solo";

export interface LevelModel {
  rhythmOffsetDb: number;
  chorusOffsetDb: number;
  soloOffsetDb: number;
}

export interface AppliedResult {
  preset: HelixPreset;
  /** Where this preset now sits relative to the setlist's Clean reference. */
  trimDb: number;
  /** False when the preset had nowhere to write the trim. */
  trimApplied: boolean;
  /**
   * dB of trim that wouldn't fit in the output block's range. Non-zero means
   * this preset still sits that far off the setlist — silently clamping is how
   * a preset ends up looking aligned on screen and wrong in the room.
   */
  residualDb: number;
  changed: number;
}

/**
 * Write the setlist's level model into a preset.
 *
 * The wizard used to only *show* targets, so an exported .hls carried whatever
 * levels the preset authors happened to pick — a 15 dB spread across one gig.
 * This turns the model into actual parameter changes, using the same aligner
 * SoundPath uses so both apps agree on what alignment means.
 *
 * Roles map onto per-snapshot targets relative to the baseline snapshot, which
 * is exactly the shape AlignmentConfig.targets already takes.
 */
export function applyLevels(
  preset: HelixPreset,
  rolesByIndex: Record<number, Role>,
  model: LevelModel
): AppliedResult {
  const offsetFor = (role: Role): number =>
    role === "clean"
      ? 0
      : role === "rhythm"
        ? model.rhythmOffsetDb
        : role === "chorus"
          ? model.chorusOffsetDb
          : model.soloOffsetDb;

  const loud = estimateAllSnapshots(preset);
  if (loud.length === 0) throw new Error("preset has no snapshots to align");

  // The baseline is whichever snapshot carries the lowest target; everything
  // else is expressed relative to it, which is what the aligner expects.
  const entries = loud.map((l) => ({
    index: l.snapshotIndex,
    target: offsetFor(rolesByIndex[l.snapshotIndex] ?? "rhythm"),
    db: l.loudnessDb,
  }));
  const anchor = entries.reduce((lo, e) => (e.target < lo.target ? e : lo), entries[0]);

  const targets: Record<number, number> = {};
  for (const e of entries) {
    if (e.index === anchor.index) continue;
    targets[e.index] = Number((e.target - anchor.target).toFixed(2));
  }

  const result = alignGain(preset, {
    ...DEFAULT_CONFIG,
    baselineIndex: anchor.index,
    targets,
  });

  const applied = applyProposals(preset, result.proposals);
  const trimDb = Number((anchor.target - anchor.db).toFixed(2));
  const trimmed = applyPresetTrim(applied, trimDb);

  return {
    preset: trimmed.preset,
    trimDb,
    trimApplied: trimmed.applied,
    residualDb: trimmed.residualDb,
    changed: result.proposals.length + (trimmed.applied ? 1 : 0),
  };
}

/** The Helix output block's Level runs to +12 dB at the top. */
const MAX_OUTPUT_DB = 12;
const MIN_OUTPUT_DB = -60;

/**
 * Shift a whole preset by `trimDb`.
 *
 * alignGain can't do this — its baseline snapshot is 0 dB by definition, so it
 * only ever fixes relationships *inside* a preset. The cross-preset offset is
 * what stops one song arriving 14 dB hot.
 *
 * This writes the path output level, which is the last stage before the jacks.
 * An earlier version inserted a Gain block into the first free slot instead,
 * which was wrong in a way the estimate couldn't see: a free slot is often
 * *before* the amp, and gain into a saturating amp changes drive, not output
 * level. MAN IN A BOX took −14 dB in front of a high-gain amp and came out just
 * as loud. The output block has no such ambiguity, already exists in every
 * preset, and re-exporting overwrites it rather than stacking another block.
 */
function applyPresetTrim(
  preset: HelixPreset,
  trimDb: number
): { preset: HelixPreset; applied: boolean; residualDb: number } {
  if (Math.abs(trimDb) < 0.1) return { preset, applied: false, residualDb: 0 };

  const copy = JSON.parse(JSON.stringify(preset)) as HelixPreset;
  const tone = copy.data?.tone as Record<string, unknown> | undefined;
  if (!tone) return { preset, applied: false, residualDb: trimDb };

  const dsp = terminalPath(tone);
  const outs = routedOutputs(tone, dsp);
  if (outs.length === 0) return { preset, applied: false, residualDb: trimDb };

  let residualDb = 0;
  for (const [, out] of outs) {
    const current = typeof out.gain === "number" ? out.gain : 0;
    const wanted = current + trimDb;
    const capped = Math.max(MIN_OUTPUT_DB, Math.min(MAX_OUTPUT_DB, wanted));
    out.gain = Number(capped.toFixed(2));
    // Report the shortfall rather than pretending the preset landed on target.
    residualDb = Number((wanted - capped).toFixed(2));
  }

  // A snapshot override would shadow the value we just wrote, so drop any.
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`] as
      | { controllers?: Record<string, Record<string, Record<string, unknown>>> }
      | undefined;
    for (const [slot] of outs) delete snap?.controllers?.[dsp]?.[slot]?.gain;
  }

  return { preset: copy, applied: true, residualDb };
}

/**
 * Which path ends the chain.
 *
 * Path 1's output says where it goes: 2 means "Path 2A", so path 2 is the end;
 * 1 means it hits the jacks directly and path 2 is unused. Assuming dsp1 was
 * wrong for Offspring and Kid, which route straight out of path 1 and carry no
 * blocks on path 2 at all — their trim went somewhere no signal passes.
 */
function terminalPath(tone: Record<string, unknown>): "dsp0" | "dsp1" {
  const a = (tone.dsp0 as { outputA?: Record<string, unknown> } | undefined)?.outputA;
  return a?.["@output"] === 2 ? "dsp1" : "dsp0";
}

/**
 * The outputs on a path that actually feed the jacks. @output 0 means unrouted;
 * a split preset can send both A and B out, and both legs need the same trim or
 * only half the sound moves.
 */
function routedOutputs(
  tone: Record<string, unknown>,
  dsp: "dsp0" | "dsp1"
): Array<[string, Record<string, unknown>]> {
  const path = tone[dsp] as Record<string, Record<string, unknown>> | undefined;
  if (!path) return [];
  return Object.entries(path).filter(
    ([slot, node]) => slot.startsWith("output") && node && node["@output"] !== 0
  );
}
