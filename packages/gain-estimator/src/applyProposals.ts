/**
 * Apply a list of alignment proposals to a Helix preset.
 *
 * Pure function: takes a preset and proposals, returns a new patched preset.
 * The original is not mutated. Conflicts and no-change proposals are skipped
 * (only partial changes are written).
 */

import type { HelixPreset, BlockNode } from "./types";
import type { Proposal, PresetInsertion } from "./aligner";

export type ApplyOptions = {
  /** Preset-level structural insertion from AlignmentResult.insertion. */
  insertion?: PresetInsertion;
};

export function applyProposals(
  preset: HelixPreset,
  proposals: Proposal[],
  options: ApplyOptions = {}
): HelixPreset {
  // JSON deep clone — Helix presets are pure data, no functions/Dates/etc.
  const copy = JSON.parse(JSON.stringify(preset)) as HelixPreset;

  // Preset-level insertion happens first so per-snapshot enable overrides have
  // a slot to point at. The new block is created with @enabled: false so it
  // stays bypassed on snapshots that didn't ask for it.
  if (options.insertion) {
    const ins = options.insertion;
    const dspMap = (copy.data.tone as Record<string, unknown>)[ins.dsp] as
      | { [slot: string]: unknown }
      | undefined;
    if (dspMap) {
      const newBlock: BlockNode = {
        "@model": ins.model,
        "@enabled": false,
        "@no_snapshot_bypass": false,
        "@path": 0,
        "@position": 0,
        "@stereo": false,
        "@type": 0,
        ...ins.defaults,
      } as BlockNode;
      dspMap[ins.slot] = newBlock;
    }
  }

  for (const p of proposals) {
    if (p.status === "no_change") continue;
    const hasParamChanges = p.changes.length > 0;
    const hasStructural = !!(p.structuralChanges && p.structuralChanges.length > 0);
    if (!hasParamChanges && !hasStructural) continue;

    const snapKey = `snapshot${p.snapshotIndex}` as const;
    const snap = copy.data.tone[snapKey] as
      | {
          blocks?: { [dsp: string]: { [slot: string]: boolean } };
          controllers?: {
            [dsp: string]: {
              [slot: string]: {
                [param: string]: { "@value": number; "@fs_enabled"?: boolean };
              };
            };
          };
        }
      | undefined;
    if (!snap) continue;
    snap.controllers ??= {};
    snap.blocks ??= {};

    for (const sc of p.structuralChanges ?? []) {
      if (sc.kind === "enableBlock") {
        snap.blocks[sc.dsp] ??= {};
        snap.blocks[sc.dsp][sc.slot] = true;
      }
    }

    for (const c of p.changes) {
      snap.controllers[c.dsp] ??= {};
      snap.controllers[c.dsp][c.slot] ??= {};
      snap.controllers[c.dsp][c.slot][c.param] ??= { "@value": 0, "@fs_enabled": false };
      snap.controllers[c.dsp][c.slot][c.param]["@value"] = c.value;
    }
  }

  return copy;
}

/**
 * Serialize a Helix preset to match HX Edit's native JSON format:
 *   - 2-space indentation
 *   - "key" : "value"  (space before colon, matches HX export)
 *
 * Verified byte-pattern-compatible against user's General Presest 2 master.
 */
export function stringifyHelixPreset(preset: HelixPreset): string {
  // JSON.stringify writes `"key": "value"` — we need `"key" : "value"`.
  // The regex only matches keys (line-start, indented, quoted, followed by colon)
  // so values containing colons aren't affected.
  const raw = JSON.stringify(preset, null, 2);
  return raw.replace(/^(\s*)"([^"\\]*(?:\\.[^"\\]*)*)":/gm, '$1"$2" :');
}
