/**
 * Tone Discovery — free-form vibe → Gemini picks an exemplar song/artist
 * within the rig's capabilities and returns a Match-Song-shaped result so
 * the rest of the pipeline (modal, staging, export) is identical.
 *
 * Differs from Match Song in that the user doesn't specify what to match;
 * the model proposes the song itself + brief justification. Useful when you
 * know the vibe ("late-night jazz", "stoner doom") but not the reference.
 */

import {
  friendlyBlock,
  realWorldName,
  type HelixPreset,
  type BlockNode,
} from "@music-apps/gain-estimator";

import type { MatchSongResult } from "./matchSong";
import { callLlm, type LlmProvider } from "./llm";

export type ToneDiscoveryRequest = {
  vibe: string;                 // "warm late-night jazz vibe", "huge stadium rock"
  targetSnapshotIndex: number;
  provider?: LlmProvider;
};

export type ToneDiscoveryResult = MatchSongResult & {
  /** Why this song/artist was chosen as the exemplar for the requested vibe. */
  whyThisExemplar: string;
};

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

  return `You are a guitar-amp tone designer. The user describes a vibe and you respond by choosing an iconic SONG and ARTIST that exemplifies that vibe within the user's existing rig, then dialing in the chosen target snapshot to match it. You respond with exactly one JSON object.

${rigSummary(preset)}

TARGET SNAPSHOT: ${targetSnapshotIndex} (${targetName})

HARD RULES:
1. JSON only. First char "{", last char "}". No markdown fences, no commentary.
2. STAY WITHIN THIS RIG. Only reference block names from the CHAIN BLOCKS list above. Pick the closest available substitute if the perfect block is missing and explain in gapNote.
3. Single snapshot only. All your settings are scoped to ${targetName}.
4. The chosen song/artist must be REAL and well-known enough that anyone familiar with the genre would recognize it. Prefer iconic tracks over deep cuts.
5. Briefly justify WHY this song exemplifies the vibe ("whyThisExemplar").

OUTPUT SCHEMA:
{
  "song": "<concrete real song you chose>",
  "artist": "<artist>",
  "era": "<album or year>",
  "whyThisExemplar": "<one sentence: why this is the canonical example of the requested vibe>",
  "toneDescriptors": {
    "gainStage": "clean | edge of breakup | crunch | high gain | fuzz",
    "eqShape": "scooped | mid-forward | bright | dark | balanced",
    "compression": "uncompressed | mild | heavy | pumping",
    "spatial": "dry | slapback | room | wash",
    "cabCharacter": "closed-back tight | open 1x12 | warm 4x12 | chimey | dark"
  },
  "enable": ["Amp (US Double)", ...],
  "bypass": ["Amp (JCM800)", ...],
  "params": {
    "Amp (US Double)": { "Drive": 0.3, "Bass": 0.5, "Treble": 0.55, "ChVol": 0.7 }
  },
  "reasoningPerBlock": {
    "Amp (US Double)": "Clean Fender shimmer for the jazz-chord voicings"
  },
  "gapNote": "<one sentence if the rig is missing something key, else omit>"
}`;
}

export async function discoverTone(
  preset: HelixPreset,
  req: ToneDiscoveryRequest
): Promise<ToneDiscoveryResult> {
  const system = systemPrompt(preset, req.targetSnapshotIndex);

  const llm = await callLlm(
    { system, user: `Vibe: ${req.vibe}`, jsonMode: true, temperature: 0.5 },
    req.provider
  );
  if (!llm.text) throw new Error("LLM returned no text payload");
  const cleaned = llm.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as Omit<
    ToneDiscoveryResult,
    "targetSnapshotIndex" | "targetSnapshotName"
  >;

  const targetSnapshotName =
    (preset.data.tone[`snapshot${req.targetSnapshotIndex}` as keyof typeof preset.data.tone] as
      | { "@name"?: string }
      | undefined)?.["@name"] ?? `snapshot${req.targetSnapshotIndex}`;

  return {
    ...parsed,
    targetSnapshotIndex: req.targetSnapshotIndex,
    targetSnapshotName,
  };
}
