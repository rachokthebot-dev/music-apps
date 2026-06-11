/**
 * Design Preset — Gemini call that takes 3 tone descriptions and returns a
 * complete `PresetDesign` (chain + 8 snapshots).
 *
 * Differs from Match Song / Tone Discovery in TWO important ways:
 *   1. The LLM picks the CHAIN itself (not constrained to user's existing rig).
 *   2. It designs all 8 snapshots in one call so it can plan cross-snapshot
 *      sharing — e.g. one Klon block engaged by Rock+Metal but bypassed by Clean.
 *
 * Uses Gemini 2.5 Flash with a long-form structured prompt that includes:
 *   • Helix LT DSP budget rules
 *   • Skeleton slot layout (block0..block4 per DSP, plus cab0/cab1)
 *   • Catalog of canonical block ids (drawn from HelAIx)
 *   • Auto-derivation rules for solos + clean
 */

import {
  getCatalogEntry,
  type PresetDesign,
} from "@music-apps/gain-estimator";
import helaixCatalog from "@music-apps/gain-estimator/data/helaix-catalog.json";

import { callLlm, type LlmProvider } from "./llm";

export type DesignPresetRequest = {
  tones: [string, string, string]; // free-form descriptions for the 3 rhythm slots
  provider?: LlmProvider;
  /** Override the Ollama model. Useful for experimenting with different local models. */
  ollamaModel?: string;
};

type CatalogEntry = { InternalName: string; Name: string; BasedOn?: string; DSP_Mono?: number };

/** Helix LT DSP budget per path. 100% per DSP path; leave headroom for snapshot
 *  enable changes (which can temporarily activate more blocks than usual). */
const DSP_BUDGET_PER_PATH = 100;
const DSP_TARGET_HEADROOM = 5; // warn if total > 95

/**
 * Compact summary of the catalog for the LLM prompt. We include common amps,
 * drives, mods, delays, reverbs — enough for the model to design competently
 * without ballooning the token count.
 *
 * In `compact` mode we trim aggressively to make the prompt small enough for
 * local models (Gemma 26B-A4B) to evaluate quickly. Cuts ~60% of entries.
 */
function compactCatalog(opts: { compact?: boolean } = {}): string {
  const cat = (helaixCatalog as CatalogEntry[]).slice();
  const categories: Record<string, CatalogEntry[]> = {};
  const groupOf = (e: CatalogEntry): string => {
    const n = e.InternalName;
    if (n.startsWith("HD2_Amp")) return "Amps";
    if (n.startsWith("HD2_Cab")) return "Cabs";
    if (n.startsWith("HD2_Dist")) return "Drives";
    if (n.startsWith("HD2_Compressor") || n.startsWith("HD2_DM4") || n.startsWith("HD2_Gate")) return "Dynamics";
    if (n.startsWith("HD2_EQ") || n.startsWith("HD2_CaliQ")) return "EQ";
    if (n.startsWith("HD2_Delay") || n.startsWith("HD2_DL4")) return "Delays";
    if (n.startsWith("HD2_Reverb")) return "Reverbs";
    if (n.startsWith("HD2_VolPan")) return "Volume";
    if (n.startsWith("HD2_Chorus") || n.startsWith("HD2_Flanger") || n.startsWith("HD2_Phaser") || n.startsWith("HD2_Tremolo") || n.startsWith("HD2_Vibrato") || n.startsWith("HD2_Rotary") || n.startsWith("HD2_MM4")) return "Modulation";
    if (n.startsWith("HD2_Wah")) return "Wah";
    return "Other";
  };

  for (const e of cat) {
    const g = groupOf(e);
    if (!categories[g]) categories[g] = [];
    categories[g].push(e);
  }

  // Trim each category. Compact mode cuts ~60% of entries to fit in a smaller
  // prompt that local 26B-A4B models can evaluate without timing out.
  const fullLimits: Record<string, number> = {
    Amps: 30, Cabs: 20, Drives: 18, Dynamics: 8, EQ: 5,
    Delays: 12, Reverbs: 12, Modulation: 15, Volume: 2, Wah: 4, Other: 0,
  };
  const compactLimits: Record<string, number> = {
    Amps: 8, Cabs: 6, Drives: 5, Dynamics: 3, EQ: 3,
    Delays: 4, Reverbs: 4, Modulation: 4, Volume: 2, Wah: 2, Other: 0,
  };
  const limits = opts.compact ? compactLimits : fullLimits;

  const lines: string[] = [];
  for (const [cat, items] of Object.entries(categories)) {
    if ((limits[cat] ?? 0) === 0) continue;
    lines.push(`\n## ${cat} (pick up to a few)`);
    for (const e of items.slice(0, limits[cat])) {
      const based = e.BasedOn && e.BasedOn !== "Line 6 Original" && e.BasedOn !== "Unknown"
        ? ` — based on ${e.BasedOn}`
        : "";
      const dsp = typeof e.DSP_Mono === "number" ? ` [DSP ${e.DSP_Mono.toFixed(1)}%]` : "";
      lines.push(`- ${e.InternalName}: ${e.Name}${based}${dsp}`);
    }
  }
  return lines.join("\n");
}

const SKELETON_SLOTS = `
Each DSP has 5 main slots: block0, block1, block2, block3, block4.
Cab slots are SEPARATE from main slots: cab0, cab1 (one per amp).
You can use both dsp0 (main signal path) and dsp1 (a second parallel chain via Helix LT split routing).

Path numbering inside a DSP:
  path: 0 = main spine
  path: 1 = parallel path (used after a split block routes signal to it)

Position is the order along the path. Two blocks at the same position are parallel.

Common topology examples:
  Single-amp chain:  block0(Drive) → block1(Amp+cab0) → block2(EQ) → block3(Delay)  [all path 0, position 0..3]
  Dual-amp split:    Comp+Drive at path 0 pos 0..1, then amps at path 0 pos 2 AND path 1 pos 2, then EQ+Delay at path 0 pos 3..4
`;

const SYSTEM_PROMPT_RULES = `
HARD RULES:
0. COMPLETENESS: Write the ENTIRE JSON object — chain array AND all 8 snapshot objects AND close the outer "}". Do NOT stop after presetName/designNotes. A response that stops before all 8 snapshots have been written is a complete failure of the task. Keep writing until the closing brace.
1. JSON only. First char "{", last char "}". No markdown fences, no prose outside the JSON.
2. ALWAYS produce exactly 8 snapshots, indices 0..7.
3. Snapshot 0 is CLEAN. It must use a clean-style amp (no Drive engaged, no high-gain amp) with a sensible neutral sound.
4. Snapshots 1..3 are the three rhythm tones (tone1, tone2, tone3 in that order).
5. Snapshots 4..7 are SOLO variants: 4 = Clean Solo, 5 = tone1 Solo, 6 = tone2 Solo, 7 = tone3 Solo.
6. For each SOLO snapshot, you MUST:
   - enable the Volume/Boost block if one exists (HD2_VolPanGain) with Gain ~3.0 dB
   - keep the same amp(s) and cab(s) enabled as the rhythm sibling
   - optionally engage a clean boost / Klon for edge-of-breakup
   - slightly bump Delay Mix (+0.05 ish) if a delay block is present

7. CHAIN SIZE: maximum 5 chain blocks per DSP path (plus cabs which don't count). Helix LT DSP budget is limited — don't exceed 7 total blocks across the whole chain.
8. CHAIN ORDER: drives before amps; amp followed by its cab; modulation/EQ/delay/reverb after amp (post-cab).
9. AMPS MUST PAIR WITH CABS: every amp block needs a cab block with a "cab" pointer (e.g. amp's cab="cab0", with a separate cab0 slot placed).
10. MODEL IDS: every block "model" must be a real HD2_* id from the catalog below. Do NOT invent ids.
11. Snapshot names: 12 chars max, uppercase looks best on the Helix LT footswitch. Derive them from the user's tone descriptions.
12. NO DEAD BLOCKS: every block you place in the chain MUST be in at least one snapshot's enabledBlocks list. If a block isn't used by any snapshot, remove it from the chain.
13. DSP BUDGET: each DSP path has a 100% budget (see [DSP X%] tags in the catalog). Sum the DSP_Mono of all blocks you place on a single DSP path. Stay under 95% per path. If your design exceeds budget, drop or swap heaviest blocks.

PARAM CONVENTIONS:
- All amp/drive/cab params are 0..1 normalized unless they're a "Gain" on the Boost block (in dB, e.g. 3.0).
- Delay Mix is 0..1. Common values 0.05 (subtle) to 0.4 (lush).
- Reverb Mix is 0..1. Common values 0.10 (room) to 0.40 (cathedral).
`;

const OUTPUT_SCHEMA = `
OUTPUT SCHEMA (exact):
{
  "presetName": "<= 16 chars, e.g. 'JAZZ • ROCK • DJENT'",
  "designNotes": "<one short paragraph: signal flow + sharing rationale>",
  "chain": [
    // 4..8 entries. Order doesn't matter for placement; (dsp, path, position) determines layout.
    {"dsp": "dsp0", "slot": "block0", "path": 0, "position": 0, "model": "HD2_..."},
    {"dsp": "dsp0", "slot": "cab0",   "path": 0, "position": 2, "model": "HD2_Cab..."},
    {"dsp": "dsp0", "slot": "block2", "path": 0, "position": 2, "model": "HD2_Amp...", "cab": "cab0"}
    // ...
  ],
  "snapshots": [
    // exactly 8 entries, indices 0..7
    {
      "index": 0,
      "name": "CLEAN",
      "enabledBlocks": ["block0", "block2", "cab0"],
      "params": {
        "block2": {"Drive": 0.2, "ChVol": 0.75, "Bass": 0.5}
      }
    }
    // ...
  ]
}
`;

export async function designPreset(req: DesignPresetRequest): Promise<PresetDesign> {
  // Local models can't handle the full catalog in time — trim aggressively.
  const catalog = compactCatalog({ compact: req.provider === "ollama" });

  const system =
    `You are an expert Helix LT preset designer. The user describes 3 tones they want for their rhythm snapshots. You design a complete preset that serves all 3 + a clean baseline + 4 solo variants.\n\n` +
    SKELETON_SLOTS +
    SYSTEM_PROMPT_RULES +
    OUTPUT_SCHEMA +
    `\n\nCATALOG (use only these model IDs):\n${catalog}`;

  const userMsg =
    `Design a preset for these 3 tones:\n` +
    `  Tone 1 (rhythm snapshot 1): ${req.tones[0]}\n` +
    `  Tone 2 (rhythm snapshot 2): ${req.tones[1]}\n` +
    `  Tone 3 (rhythm snapshot 3): ${req.tones[2]}\n` +
    `\nReturn ONLY the JSON object.`;

  const llm = await callLlm(
    {
      system,
      user: userMsg,
      jsonMode: true,
      temperature: 0.4,
      maxOutputTokens: 32000,
      // Design Preset only: override default (gemma-hermes) → qwen-coding-fast.
      // Gemma 26B fails on this schema (stops at 144 chars or runs to 15-min cap).
      ollamaModel: req.ollamaModel ?? "qwen-coding-fast:latest",
    },
    req.provider
  );
  const raw = llm.text;
  if (!raw) throw new Error(`${llm.provider} returned no text payload`);
  if (llm.finishReason && llm.finishReason !== "STOP") {
    console.warn(`[design] finishReason=${llm.finishReason}, output length=${raw.length}`);
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed: PresetDesign;
  try {
    parsed = JSON.parse(cleaned) as PresetDesign;
  } catch (parseErr) {
    const head = cleaned.slice(0, 200);
    const tail = cleaned.slice(-200);
    throw new Error(
      `JSON parse failed (provider=${llm.provider} model=${llm.model} finishReason=${llm.finishReason}, length=${cleaned.length}): ` +
      `${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
      `Head: ${head}… Tail: …${tail}`
    );
  }

  // Sanity validation: snapshots present, models resolvable.
  if (!parsed.chain || !Array.isArray(parsed.chain) || parsed.chain.length === 0) {
    throw new Error("design has no chain blocks");
  }
  if (!parsed.snapshots || parsed.snapshots.length !== 8) {
    throw new Error(`expected 8 snapshots, got ${parsed.snapshots?.length}`);
  }
  for (const blk of parsed.chain) {
    if (!getCatalogEntry(blk.model)) {
      console.warn(`[design] unknown model from LLM: ${blk.model}`);
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Post-pass validators
// ---------------------------------------------------------------------------

export type DesignValidation = {
  warnings: string[];
  /** Total DSP usage per path, after summing block costs. */
  dspPerPath: { [pathKey: string]: number };
};

/**
 * Check the LLM's design for the two newly-enforced rules:
 *   - Every chain block must be enabled in ≥1 snapshot (no dead blocks)
 *   - DSP budget per path must stay under DSP_BUDGET_PER_PATH minus headroom
 */
export function validateDesign(design: PresetDesign): DesignValidation {
  const warnings: string[] = [];
  const dspPerPath: { [pathKey: string]: number } = {};

  // ---- coverage check ----
  const usedSlots = new Set<string>();
  for (const snap of design.snapshots ?? []) {
    for (const slot of snap.enabledBlocks ?? []) usedSlots.add(slot);
  }
  for (const blk of design.chain ?? []) {
    if (!usedSlots.has(blk.slot)) {
      warnings.push(
        `Dead block: ${blk.model} at ${blk.dsp}/${blk.slot} is never enabled in any snapshot`
      );
    }
  }

  // ---- DSP budget check ----
  for (const blk of design.chain ?? []) {
    const entry = getCatalogEntry(blk.model);
    const cost = entry?.DSP_Mono ?? 0;
    const key = `${blk.dsp}/path${blk.path}`;
    dspPerPath[key] = (dspPerPath[key] ?? 0) + cost;
  }
  for (const [path, total] of Object.entries(dspPerPath)) {
    const cap = DSP_BUDGET_PER_PATH - DSP_TARGET_HEADROOM;
    if (total > DSP_BUDGET_PER_PATH) {
      warnings.push(`DSP overflow on ${path}: ${total.toFixed(1)}% (budget ${DSP_BUDGET_PER_PATH}%)`);
    } else if (total > cap) {
      warnings.push(
        `DSP near budget on ${path}: ${total.toFixed(1)}% (target ≤${cap}% to leave headroom)`
      );
    }
  }

  return { warnings, dspPerPath };
}
