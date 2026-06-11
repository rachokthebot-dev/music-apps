/**
 * Match Song — call Gemini with the user's master rig + a target song,
 * receive a structured snapshot patch back.
 *
 * The prompt is grounded in the SPECIFIC chain we see in the active master,
 * not the universal 365-block Helix catalog. This keeps the model from
 * proposing blocks the user doesn't have (no Big Muff if no fuzz block).
 */

import {
  friendlyBlock,
  realWorldName,
  type HelixPreset,
  type BlockNode,
} from "@music-apps/gain-estimator";

import { callLlm, type LlmProvider } from "./llm";

export type ToneDescriptors = {
  gainStage: string;
  eqShape: string;
  compression: string;
  spatial: string;
  cabCharacter: string;
};

export type MatchSongRequest = {
  song: string;
  artist: string;
  targetSnapshotIndex: number;
  provider?: LlmProvider;
};

export type MatchSongResult = {
  song: string;
  artist: string;
  era?: string;
  targetSnapshotIndex: number;
  targetSnapshotName: string;
  toneDescriptors: ToneDescriptors;
  /** Friendly block names (e.g. "Amp (JCM800)") the model wants enabled. */
  enable: string[];
  bypass: string[];
  /** Per-block parameter overrides. Block name is friendly form. */
  params: { [blockName: string]: { [param: string]: number } };
  /** Per-change human reasoning, indexed by friendly block name. */
  reasoningPerBlock: { [blockName: string]: string };
  /** "Your rig has no fuzz; using JCM at higher Drive as the closest approximation." */
  gapNote?: string;
};

/**
 * Summarize the master for the prompt — friendly block list + current snapshot
 * names. The model only sees blocks that actually exist in the rig.
 */
function rigSummary(preset: HelixPreset): string {
  const blocks: string[] = [];
  for (const dsp of ["dsp0", "dsp1"] as const) {
    const map = preset.data.tone[dsp];
    if (!map) continue;
    for (const [slot, node] of Object.entries(map)) {
      if (!slot.startsWith("block")) continue;
      if (!node || typeof node !== "object") continue;
      const block = node as BlockNode;
      const model = block["@model"];
      if (typeof model !== "string") continue;
      const label = friendlyBlock(model);
      const rw = realWorldName(model);
      blocks.push(rw ? `- ${label}  — based on ${rw}` : `- ${label}`);
    }
  }

  const snapshots: string[] = [];
  for (let i = 0; i < 8; i++) {
    const snap = preset.data.tone[`snapshot${i}` as keyof typeof preset.data.tone] as
      | { "@name"?: string }
      | undefined;
    if (snap?.["@name"]) snapshots.push(`  ${i}: ${snap["@name"]}`);
  }

  return `CHAIN BLOCKS in this master (use these exact names in your response):\n${blocks.join("\n")}\n\nSNAPSHOT SLOTS:\n${snapshots.join("\n")}`;
}

function systemPrompt(preset: HelixPreset, targetSnapshotIndex: number): string {
  const targetName =
    (preset.data.tone[`snapshot${targetSnapshotIndex}` as keyof typeof preset.data.tone] as
      | { "@name"?: string }
      | undefined)?.["@name"] ?? `snapshot${targetSnapshotIndex}`;

  return `You are a guitar-amp tone designer translating a recorded artist's sound into Helix LT snapshot settings. You will be told a song and artist; you respond with one JSON object describing how to set the target snapshot.

${rigSummary(preset)}

TARGET SNAPSHOT: ${targetSnapshotIndex} (${targetName})

HARD RULES:
1. JSON only. First char "{", last char "}". No markdown fences, no commentary.
2. STAY WITHIN THIS RIG. Only reference block names from the CHAIN BLOCKS list above. Never invent a block that isn't in this rig. If the artist's signature tone needs a block that's missing (e.g. fuzz, chorus, etc.), pick the closest available substitute and explain in gapNote.
3. Single snapshot only. All your changes are scoped to ${targetName}.
4. Use 0–1 normalized values for amp/drive/EQ knobs. Use literal dB for Boost Gain (e.g. 3.0 means +3 dB). Use 0–1 for Delay Mix.
5. Always reason in TONE DESCRIPTORS first, then map to settings.

OUTPUT SCHEMA:
{
  "song": "<echo back>",
  "artist": "<echo back>",
  "era": "<album or year, optional>",
  "toneDescriptors": {
    "gainStage": "clean | edge of breakup | crunch | high gain | fuzz",
    "eqShape": "scooped | mid-forward | bright | dark | balanced",
    "compression": "uncompressed | mild | heavy | pumping",
    "spatial": "dry | slapback | room | wash",
    "cabCharacter": "closed-back tight | open 1x12 | warm 4x12 | chimey | dark"
  },
  "enable": ["Amp (JCM800)", "Drive (Klon)", ...],
  "bypass": ["Amp (US Double)", "Volume (Boost)", ...],
  "params": {
    "Amp (JCM800)": { "Drive": 0.65, "Bass": 0.55, "Treble": 0.6 },
    "Delay": { "Mix": 0.08 }
  },
  "reasoningPerBlock": {
    "Amp (JCM800)": "Plexi-style 100W Marshall — Drive at noon for chorus crunch",
    "Delay": "Verse is fairly dry, just a hint to glue the room"
  },
  "gapNote": "<one sentence if the rig is missing something key, else omit>"
}

GUIDELINES:
- For most songs you should choose ONE amp (Amp (JCM800) or Amp (US Double)) and bypass the other. Enable its matching cab.
- For each amp you enable, set Drive, Bass, Mid (if applicable), Treble, ChVol explicitly so the snapshot is reproducible.
- Klon (Minotaur) is a Klon-style clean boost; engage it for crunch and lead snapshots, bypass for pure clean.
- Boost is a +dB clean lift; engage for solo snapshots (Gain in dB, e.g. 3.0).
- The Delay is a Simple Delay; Mix range 0.05–0.4.
- Compression block stays on always (it's the user's permanent compressor).
- Parametric EQ stays on always; you can tweak LowGain/MidGain/HighGain in dB (-12..+12).
- Reasoning per block: 1 short sentence each.
- gapNote only when your rig genuinely can't produce a defining characteristic of the target tone.

EXAMPLE INPUT: { "song": "Smells Like Teen Spirit", "artist": "Nirvana" }
EXAMPLE OUTPUT (showing format only; pick real values for the actual request):
{
  "song": "Smells Like Teen Spirit", "artist": "Nirvana", "era": "Nevermind (1991)",
  "toneDescriptors": { "gainStage": "crunch", "eqShape": "scooped", "compression": "mild", "spatial": "dry", "cabCharacter": "closed-back tight" },
  "enable": ["Comp", "Drive (Klon)", "Amp (JCM800)", "Cab (4x12 Greenback)", "EQ", "Delay"],
  "bypass": ["Amp (US Double)", "Cab (2x12 Cab)", "Volume (Boost)"],
  "params": {
    "Drive (Klon)": { "Gain": 0.35 },
    "Amp (JCM800)": { "Drive": 0.68, "Bass": 0.62, "Treble": 0.55, "ChVol": 0.55 },
    "EQ": { "MidGain": -2 },
    "Delay": { "Mix": 0.08 }
  },
  "reasoningPerBlock": {
    "Drive (Klon)": "Light boost into the front end, not for clipping",
    "Amp (JCM800)": "Chorus crunch saturation, Marshall mids tamed by scooped EQ",
    "EQ": "Scoop the mids slightly to evoke Nirvana's bias toward Big Muff scoop",
    "Delay": "Verse is mostly dry, just a hint"
  },
  "gapNote": "Your rig has no fuzz; the DS-1 character is approximated by JCM crunch + scooped EQ — closer to Soundgarden than literal Nirvana in attack."
}`;
}

export async function callGemini(
  preset: HelixPreset,
  req: MatchSongRequest
): Promise<MatchSongResult> {
  const system = systemPrompt(preset, req.targetSnapshotIndex);
  const userMsg = JSON.stringify({ song: req.song, artist: req.artist }, null, 2);

  const llm = await callLlm(
    { system, user: userMsg, jsonMode: true, temperature: 0.3 },
    req.provider
  );
  if (!llm.text) throw new Error("LLM returned no text payload");
  const cleaned = llm.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as Omit<MatchSongResult, "targetSnapshotIndex" | "targetSnapshotName">;

  const targetSnapshotName =
    (preset.data.tone[`snapshot${req.targetSnapshotIndex}` as keyof typeof preset.data.tone] as
      | { "@name"?: string }
      | undefined)?.["@name"] ?? `snapshot${req.targetSnapshotIndex}`;
  return { ...parsed, targetSnapshotIndex: req.targetSnapshotIndex, targetSnapshotName };
}
