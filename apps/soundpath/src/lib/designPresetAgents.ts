/**
 * Two-agent preset design (HelAIx-style).
 *
 *   designerCall(req)  → RigDescription with real-world gear names
 *                        ("Tube Screamer", "Marshall JCM800", "4x12 Greenback")
 *                        and per-snapshot intent. Focused on TONE THINKING.
 *
 *   engineerCall(rig)  → PresetDesign with concrete HD2_ block ids, slot
 *                        layout, snapshot enable-bits, and per-snapshot params.
 *                        Focused on TRANSLATION.
 *
 * Why split: HelAIx observed that LLMs hallucinate fewer HD2_ ids when they
 * first commit to real-world gear, then translate. Each agent has a tighter
 * focus — the Designer can be creative, the Engineer's prompt is shorter and
 * more constrained (catalog filtered to relevant categories).
 *
 * Cost: two LLM calls. Latency roughly 2× the single-call path.
 */

import {
  getCatalogEntry,
  type PresetDesign,
} from "@music-apps/gain-estimator";
import helaixCatalog from "@music-apps/gain-estimator/data/helaix-catalog.json";

import { callLlm, type LlmProvider } from "./llm";
import { validateDesign, type DesignValidation } from "./designPreset";

type CatalogEntry = {
  InternalName: string;
  Name: string;
  BasedOn?: string;
  DSP_Mono?: number;
};

const CATEGORIES = [
  "Comp", "Drive", "Amp", "Cab", "EQ", "Mod", "Delay", "Reverb", "Volume", "Wah",
] as const;
export type ChainCategory = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export type RigDescription = {
  presetName: string;
  designNotes: string;
  /** Real-world gear list, ordered front-to-back through the signal chain. */
  chain: Array<{
    category: ChainCategory;
    realWorldName: string;       // "Tube Screamer", "Marshall JCM800", "4x12 Greenback"
    role: string;                // "front-end boost for mids", "main crunch amp"
  }>;
  /** What each of the 8 snapshots is for + which categories it uses. */
  snapshots: Array<{
    index: number;
    name: string;                // short footswitch label, ≤12 chars
    intent: string;              // human description of the tone
    activeCategories: ChainCategory[];
  }>;
};

// ---------------------------------------------------------------------------
// Designer agent — real-world gear + tone intent
// ---------------------------------------------------------------------------

const DESIGNER_SYSTEM = `You are a guitar tone designer. Given 3 rhythm tones the user wants, you sketch a guitar rig in REAL-WORLD GEAR TERMS — Marshall amps, Tube Screamers, 4x12 cabs, Memory Man delays, etc. You do NOT yet think about specific Helix block IDs; you describe the rig and intent.

CONTEXT:
- The target rig is a Helix LT (modeling amp). It can host up to ~7 chain blocks total, split across two DSP paths if needed.
- You design for 8 snapshots: CLEAN (0), tone1 (1), tone2 (2), tone3 (3), CLEAN SOLO (4), tone1 SOLO (5), tone2 SOLO (6), tone3 SOLO (7). Solos add a Volume boost (+3 dB) on top of the rhythm.
- Solos can also engage an extra drive for edge-of-breakup if the rhythm is clean.

OUTPUT JSON SCHEMA:
{
  "presetName": "<=16 chars label, e.g. 'JAZZ • ROCK • DJENT'",
  "designNotes": "<one paragraph: signal flow + rationale + how snapshots share blocks>",
  "chain": [
    {"category": "Comp",   "realWorldName": "studio bus compressor",      "role": "...gentle dynamic glue"},
    {"category": "Drive",  "realWorldName": "Tube Screamer",              "role": "..."},
    {"category": "Amp",    "realWorldName": "Marshall JCM800",            "role": "..."},
    {"category": "Cab",    "realWorldName": "4x12 Greenback 25",          "role": "..."},
    {"category": "EQ",     "realWorldName": "Parametric EQ",              "role": "..."},
    {"category": "Delay",  "realWorldName": "tape echo",                  "role": "..."},
    {"category": "Volume", "realWorldName": "clean boost",                "role": "..."}
  ],
  "snapshots": [
    {"index": 0, "name": "CLEAN", "intent": "warm Fender clean...", "activeCategories": ["Comp","Amp","Cab","EQ"]},
    // ... × 8
  ]
}

HARD RULES:
1. JSON only. First char "{", last "}". No markdown fences.
2. Use REAL-WORLD names, not Helix block IDs. "Marshall JCM800" not "HD2_AmpBrit2203".
3. Categories must be one of: Comp, Drive, Amp, Cab, EQ, Mod, Delay, Reverb, Volume, Wah.
4. Each chain entry must be in at least one snapshot's activeCategories.
5. CLEAN snapshot 0 should not engage any Drive.
6. Solo snapshots (4-7) must include Volume in activeCategories.
7. Order chain front-to-back: drives → amp → cab → EQ → mod → delay → reverb → volume.
8. If two tones genuinely need different amps, propose a parallel split (still in 'chain' but use category 'Amp' twice with different role notes). The Engineer agent will route the topology.
9. Max 8 chain entries. Helix LT DSP is limited.`;

// ---------------------------------------------------------------------------
// Engineer agent — translate RigDescription to PresetDesign
// ---------------------------------------------------------------------------

function relevantCatalog(rig: RigDescription): string {
  // Show ~6 candidate IDs per category the rig uses, prioritizing entries whose
  // BasedOn or Name resembles a real-world name the designer chose.
  const usedCategories = new Set(rig.chain.map((c) => c.category));
  const targets = rig.chain.map((c) => c.realWorldName.toLowerCase());

  const isInCategory = (model: string, cat: ChainCategory): boolean => {
    if (cat === "Amp") return model.startsWith("HD2_Amp");
    if (cat === "Cab") return model.startsWith("HD2_Cab");
    if (cat === "Drive") return model.startsWith("HD2_Dist");
    if (cat === "Comp") return model.startsWith("HD2_Compressor") || model.startsWith("HD2_DM4");
    if (cat === "EQ") return model.startsWith("HD2_EQ") || model.startsWith("HD2_CaliQ");
    if (cat === "Delay") return model.startsWith("HD2_Delay") || model.startsWith("HD2_DL4");
    if (cat === "Reverb") return model.startsWith("HD2_Reverb");
    if (cat === "Mod")
      return /^HD2_(Chorus|Flanger|Phaser|Tremolo|Vibrato|Rotary|MM4)/.test(model);
    if (cat === "Volume") return model.startsWith("HD2_VolPan");
    if (cat === "Wah") return model.startsWith("HD2_Wah");
    return false;
  };

  const score = (e: CatalogEntry): number => {
    const haystack = `${e.Name} ${e.BasedOn ?? ""}`.toLowerCase();
    let s = 0;
    for (const t of targets) {
      const tokens = t.split(/\s+/).filter((tok) => tok.length > 2);
      for (const tok of tokens) if (haystack.includes(tok)) s += 1;
    }
    return s;
  };

  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    if (!usedCategories.has(cat)) continue;
    const candidates = (helaixCatalog as CatalogEntry[])
      .filter((e) => isInCategory(e.InternalName, cat))
      .map((e) => ({ e, s: score(e) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.e);
    lines.push(`\n## ${cat}`);
    for (const e of candidates) {
      const based = e.BasedOn && e.BasedOn !== "Line 6 Original" && e.BasedOn !== "Unknown"
        ? ` — based on ${e.BasedOn}`
        : "";
      const dsp = typeof e.DSP_Mono === "number" ? ` [DSP ${e.DSP_Mono.toFixed(1)}%]` : "";
      lines.push(`- ${e.InternalName}: ${e.Name}${based}${dsp}`);
    }
  }
  return lines.join("\n");
}

const ENGINEER_SYSTEM = `You translate a tone designer's rig description into a concrete Helix LT preset configuration. You pick specific HD2_ block IDs that best match the designer's real-world gear choices, assign each to a slot, and configure all 8 snapshots with enabled-block lists and parameter values.

SKELETON LAYOUT:
- Each DSP has 5 main slots: block0..block4. Cabs use separate cab0/cab1 slots paired to their amp.
- Path 0 = main spine. Path 1 = parallel path (for a second amp). Position = order within path.

HARD RULES:
1. JSON only. First char "{", last "}". No markdown fences.
2. Every "model" must be an HD2_ id from the catalog below. Pick the one whose BasedOn most closely matches the designer's realWorldName.
3. Every block in the chain MUST be enabled in at least one snapshot.
4. Cabs do NOT count toward snapshots' enabledBlocks — they're routed via the amp's @cab pointer.
5. Stay under 95% total DSP per path (sum of [DSP X%] in catalog).
6. Solo snapshots must include the Volume block enabled, with Gain ~3.0 dB.
7. Keep designer's snapshot names and intents — they're already correct.

OUTPUT SCHEMA:
{
  "presetName": "<echo designer>",
  "designNotes": "<echo or add Helix-specific notes>",
  "chain": [
    {"dsp": "dsp0", "slot": "block0", "path": 0, "position": 0, "model": "HD2_..."},
    {"dsp": "dsp0", "slot": "cab0",   "path": 0, "position": 2, "model": "HD2_Cab..."},
    {"dsp": "dsp0", "slot": "block2", "path": 0, "position": 2, "model": "HD2_Amp...", "cab": "cab0"}
  ],
  "snapshots": [
    {
      "index": 0, "name": "CLEAN",
      "enabledBlocks": ["block0", "block2"],
      "params": {"block2": {"Drive": 0.2, "ChVol": 0.75}}
    }
    // × 8
  ]
}

PARAM CONVENTIONS:
- Amp/drive params 0..1 normalized.
- Volume(Boost) Gain in dB directly (e.g. 3.0 = +3 dB).
- Delay Mix 0..1 (0.05 subtle, 0.4 lush).`;

// ---------------------------------------------------------------------------
// Public entry — two-agent designPreset
// ---------------------------------------------------------------------------

export type DesignAgentsResult = {
  rig: RigDescription;
  design: PresetDesign;
  validation: DesignValidation;
  durations: { designerMs: number; engineerMs: number; totalMs: number };
};

export async function designPresetTwoAgents(
  tones: [string, string, string],
  provider?: LlmProvider
): Promise<DesignAgentsResult> {
  const tStart = Date.now();

  // ---- Designer ----
  const userMsg =
    `Design a rig for these 3 tones:\n` +
    `  Tone 1 (snapshot 1): ${tones[0]}\n` +
    `  Tone 2 (snapshot 2): ${tones[1]}\n` +
    `  Tone 3 (snapshot 3): ${tones[2]}\n\nReturn ONLY the JSON.`;

  const designerLlm = await callLlm(
    {
      system: DESIGNER_SYSTEM,
      user: userMsg,
      jsonMode: true,
      temperature: 0.5,
      maxOutputTokens: 8192,
    },
    provider
  );
  const designerMs = designerLlm.durationMs;
  let rig: RigDescription;
  try {
    rig = JSON.parse(stripFences(designerLlm.text)) as RigDescription;
  } catch (e) {
    throw new Error(
      `Designer JSON parse failed (finishReason=${designerLlm.finishReason} length=${designerLlm.text.length}): ` +
      `${e instanceof Error ? e.message : String(e)}. Text tail: …${designerLlm.text.slice(-200)}`
    );
  }
  if (!rig.chain || !rig.snapshots) {
    throw new Error("designer returned malformed rig description");
  }

  // ---- Engineer ----
  const catalog = relevantCatalog(rig);
  const engineerLlm = await callLlm(
    {
      system: ENGINEER_SYSTEM + `\n\nCATALOG (pick from these only):\n${catalog}`,
      user:
        `Translate this rig description into a Helix LT preset:\n` +
        `${JSON.stringify(rig, null, 2)}\n\nReturn ONLY the JSON.`,
      jsonMode: true,
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
    provider
  );
  const engineerMs = engineerLlm.durationMs;
  let design: PresetDesign;
  try {
    design = JSON.parse(stripFences(engineerLlm.text)) as PresetDesign;
  } catch (e) {
    throw new Error(
      `Engineer JSON parse failed (finishReason=${engineerLlm.finishReason} length=${engineerLlm.text.length}): ` +
      `${e instanceof Error ? e.message : String(e)}. Text tail: …${engineerLlm.text.slice(-200)}`
    );
  }

  // Validation
  const validation = validateDesign(design);
  // Make sure every block has a catalog entry; record a warning if not
  for (const blk of design.chain ?? []) {
    if (!getCatalogEntry(blk.model)) {
      validation.warnings.push(`Unknown model from engineer: ${blk.model}`);
    }
  }

  return {
    rig,
    design,
    validation,
    durations: { designerMs, engineerMs, totalMs: Date.now() - tStart },
  };
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}
