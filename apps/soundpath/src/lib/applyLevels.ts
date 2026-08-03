/**
 * Write the measured plan into the presets.
 *
 * Levels go on the **path output block** — the last stage before the jacks. Not
 * Channel Volume, which changes how hard the amp is driven and so alters tone
 * and feel, and not an inserted gain block, which can land in front of the amp
 * where it changes drive rather than level.
 *
 * Per-snapshot corrections are written as snapshot controller overrides on that
 * same output, which is exactly what the author of SMELLS LIKE T.S. had already
 * done by hand. A preset whose author never named a snapshot has nothing to
 * override, so its level goes on the block itself.
 */

import { tonePeers, type LevelDoc, type LevelPreset } from "./levelDoc";
import { buildPlan } from "./levelPlan";

type Node = Record<string, unknown>;

/** The path that actually reaches the jacks: @output 2 means "feeds path 2". */
function terminalPath(tone: Record<string, unknown>): "dsp0" | "dsp1" {
  const a = (tone.dsp0 as { outputA?: Node } | undefined)?.outputA;
  return a?.["@output"] === 2 ? "dsp1" : "dsp0";
}

/** Outputs on that path that are routed somewhere; a split feeds both A and B. */
function routedOutputs(tone: Record<string, unknown>, dsp: string): Array<[string, Node]> {
  const path = tone[dsp] as Record<string, Node> | undefined;
  if (!path) return [];
  return Object.entries(path).filter(
    ([slot, node]) => slot.startsWith("output") && node && node["@output"] !== 0
  );
}

function hasNamedSnapshots(tone: Record<string, unknown>): boolean {
  for (let i = 0; i < 8; i++) {
    const s = tone[`snapshot${i}`] as { "@name"?: string } | undefined;
    const n = String(s?.["@name"] ?? "").trim();
    if (n && !/^snapshot\s*\d+$/i.test(n)) return true;
  }
  return false;
}

export interface AppliedPreset {
  preset: LevelPreset;
  hlx: string;
  /** dB written per snapshot index, for reporting back. */
  written: Record<number, number>;
}

/** Snapshot index → the output level to write, dB. null where unmeasured. */
export type GainRow = { index: number; outputGainDb: number | null };

/**
 * Write gains that have already been decided.
 *
 * Split from the plan so a confirmed version can be rebuilt from its stored
 * numbers rather than recomputed. Recomputing would defeat the point: the
 * whole reason a version exists is that the plan moves whenever a reading or a
 * role offset does.
 */
export function applyGainsToPresets(
  doc: LevelDoc,
  gainsByHash: Map<string, GainRow[]>
): AppliedPreset[] {
  return doc.presets.map((preset) => {
    const planned = gainsByHash.has(preset.hash)
      ? { snapshots: gainsByHash.get(preset.hash)! }
      : undefined;
    const written: Record<number, number> = {};
    let parsed: { data?: { tone?: Record<string, unknown> } };
    try {
      parsed = JSON.parse(preset.hlx);
    } catch {
      return { preset, hlx: preset.hlx, written };
    }
    const tone = parsed.data?.tone;
    if (!tone || !planned) return { preset, hlx: preset.hlx, written };

    const dsp = terminalPath(tone);
    const outs = routedOutputs(tone, dsp);
    if (outs.length === 0) return { preset, hlx: preset.hlx, written };

    const named = hasNamedSnapshots(tone);
    const rows = planned.snapshots.filter((s) => s.outputGainDb !== null);

    // A preset nobody named can still switch between two tones, and those are
    // found by content, so one reading stands for every slot that shares it.
    // Without this the second tone's gain would be computed and then dropped.
    const peersOf = (index: number): number[] =>
      named ? [index] : tonePeers(tone, index);

    if (!named && rows.length <= 1) {
      // One fixed tone: the level belongs on the block, and any snapshot
      // override would shadow it.
      const gain = rows[0]?.outputGainDb;
      if (gain === null || gain === undefined) return { preset, hlx: preset.hlx, written };
      for (const [slot, node] of outs) {
        node.gain = gain;
        for (let i = 0; i < 8; i++) {
          const snap = tone[`snapshot${i}`] as
            | { controllers?: Record<string, Record<string, Node>> }
            | undefined;
          delete snap?.controllers?.[dsp]?.[slot]?.gain;
        }
      }
      written[0] = gain;
    } else {
      // The block default covers snapshots we have no reading for; the
      // overrides put each measured snapshot exactly where it belongs.
      const fallback = rows[0]?.outputGainDb;
      if (typeof fallback === "number") for (const [, node] of outs) node.gain = fallback;

      // Snapshots with no reading must fall back to the block, not keep the
      // author's old override — SMELLS LIKE T.S. left its unused slots at +3
      // while the measured ones went to -17, a 20 dB jump one footswitch away.
      const measuredIdx = new Set(rows.flatMap((r) => peersOf(r.index)));
      for (let i = 0; i < 8; i++) {
        if (measuredIdx.has(i)) continue;
        const snap = tone[`snapshot${i}`] as
          | { controllers?: Record<string, Record<string, Node>> }
          | undefined;
        for (const [slot] of outs) delete snap?.controllers?.[dsp]?.[slot]?.gain;
      }

      for (const row of rows) {
        const gain = row.outputGainDb as number;
        for (const i of peersOf(row.index)) {
          const snap = tone[`snapshot${i}`] as
            | { controllers?: Record<string, Record<string, Node>> }
            | undefined;
          if (!snap) continue;
          snap.controllers ??= {};
          snap.controllers[dsp] ??= {};
          for (const [slot] of outs) {
            snap.controllers[dsp][slot] ??= {};
            (snap.controllers[dsp][slot] as Record<string, unknown>).gain = {
              "@value": gain,
              "@fs_enabled": false,
            };
          }
        }
        written[row.index] = gain;
      }
    }

    return { preset, hlx: JSON.stringify(parsed), written };
  });
}

/**
 * Shift every output level in a preset by a fixed amount.
 *
 * Both the block and any snapshot override on it — moving only the block would
 * leave a preset like SMELLS LIKE T.S., whose author wrote his own overrides,
 * just as hot on the snapshots that actually clip.
 */
export function offsetPresets(doc: LevelDoc, offsetDb: number): AppliedPreset[] {
  return doc.presets.map((preset) => {
    const written: Record<number, number> = {};
    if (offsetDb === 0) return { preset, hlx: preset.hlx, written };
    let parsed: { data?: { tone?: Record<string, unknown> } };
    try {
      parsed = JSON.parse(preset.hlx);
    } catch {
      return { preset, hlx: preset.hlx, written };
    }
    const tone = parsed.data?.tone;
    if (!tone) return { preset, hlx: preset.hlx, written };

    const dsp = terminalPath(tone);
    for (const [slot, node] of routedOutputs(tone, dsp)) {
      node.gain = Number((((node.gain as number) ?? 0) + offsetDb).toFixed(2));
      for (let i = 0; i < 8; i++) {
        const snap = tone[`snapshot${i}`] as
          | { controllers?: Record<string, Record<string, Node>> }
          | undefined;
        const ov = snap?.controllers?.[dsp]?.[slot]?.gain as { "@value"?: number } | undefined;
        if (ov && typeof ov["@value"] === "number") {
          ov["@value"] = Number((ov["@value"] + offsetDb).toFixed(2));
        }
      }
    }
    return { preset, hlx: JSON.stringify(parsed), written };
  });
}

/** The live plan, applied. What a download uses when no version is asked for. */
export function applyPlanToPresets(doc: LevelDoc): AppliedPreset[] {
  return applyGainsToPresets(doc, planGains(doc));
}

/** The gains the current readings imply, keyed by hash — what a version stores. */
export function planGains(doc: LevelDoc): Map<string, GainRow[]> {
  const plan = buildPlan(doc);
  const out = new Map<string, GainRow[]>();
  for (const p of plan.presets) {
    out.set(
      p.hash,
      p.snapshots.map((s) => ({ index: s.index, outputGainDb: s.outputGainDb }))
    );
  }
  return out;
}
