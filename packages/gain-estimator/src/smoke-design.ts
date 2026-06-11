/**
 * Smoke test the design applier with a hand-written spec — equivalent of
 * what the LLM will produce. Verifies round-trip: design → HelixPreset →
 * JSON → re-parse → estimate loudness across all 8 snapshots.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

import {
  applyPresetDesign,
  stringifyHelixPreset,
  estimateAllSnapshots,
  type PresetDesign,
} from "./index";

/** Where smoke-design writes its generated test preset. Override with env. */
function resolveOutPath(): string {
  const envDir = process.env.SOUNDPATH_PRESET_DIR?.trim();
  const dir = envDir
    ? envDir.startsWith("~/")
      ? join(homedir(), envDir.slice(2))
      : envDir
    : join(homedir(), "Documents", "helix-presets");
  return join(dir, "design-test.hlx");
}

const design: PresetDesign = {
  presetName: "DESIGN TEST",
  chain: [
    { dsp: "dsp0", slot: "block0", path: 0, position: 0, model: "HD2_CompressorDeluxeComp" },
    { dsp: "dsp0", slot: "block1", path: 0, position: 1, model: "HD2_DistMinotaur" },
    { dsp: "dsp0", slot: "block2", path: 0, position: 2, model: "HD2_AmpUSDoubleNrm", cab: "cab0" },
    { dsp: "dsp0", slot: "cab0",   path: 0, position: 2, model: "HD2_CabMicIr_2x12DoubleC12N" },
    { dsp: "dsp0", slot: "block3", path: 1, position: 2, model: "HD2_AmpBritPlexiNrm", cab: "cab1" },
    { dsp: "dsp0", slot: "cab1",   path: 1, position: 2, model: "HD2_CabMicIr_4x12Greenback25" },
    { dsp: "dsp0", slot: "block4", path: 0, position: 4, model: "HD2_EQParametric" },
  ],
  snapshots: [
    // 0 CLEAN — Fender only, no drive
    { index: 0, name: "Clean", enabledBlocks: ["block0", "block2", "cab0", "block4"], params: { block2: { ChVol: 0.75, Drive: 0.25 } } },
    // 1 JAZZ — same as clean, a touch warmer EQ
    { index: 1, name: "Jazz",  enabledBlocks: ["block0", "block2", "cab0", "block4"], params: { block2: { Drive: 0.3, Bass: 0.55 } } },
    // 2 ROCK — Plexi side engaged with Klon boost
    { index: 2, name: "Rock",  enabledBlocks: ["block0", "block1", "block3", "cab1", "block4"], params: { block1: { Gain: 0.4 }, block3: { Drive: 0.6 } } },
    // 3 METAL — Plexi maxed
    { index: 3, name: "Metal", enabledBlocks: ["block0", "block1", "block3", "cab1", "block4"], params: { block1: { Gain: 0.55 }, block3: { Drive: 0.85 } } },
    // Solo variants — same chain + nudges
    { index: 4, name: "Clean Solo", enabledBlocks: ["block0", "block1", "block2", "cab0", "block4"], params: { block1: { Gain: 0.3 } } },
    { index: 5, name: "Jazz Solo",  enabledBlocks: ["block0", "block2", "cab0", "block4"], params: { block2: { ChVol: 0.85 } } },
    { index: 6, name: "Rock Solo",  enabledBlocks: ["block0", "block1", "block3", "cab1", "block4"], params: { block1: { Gain: 0.5 }, block3: { Drive: 0.7 } } },
    { index: 7, name: "Metal Solo", enabledBlocks: ["block0", "block1", "block3", "cab1", "block4"], params: { block1: { Gain: 0.7 }, block3: { Drive: 0.95 } } },
  ],
  designNotes: "Dual-amp parallel: US Double clean path + Plexi dirty path. Klon boost stacks for crunch.",
};

const { preset, report } = applyPresetDesign(design);

const out = resolveOutPath();
if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, stringifyHelixPreset(preset), "utf-8");

console.log("apply report:", report);
console.log("file written:", out);
console.log("");

const all = estimateAllSnapshots(preset);
const ref = all[0].loudnessDb;
console.log("Loudness landscape (CLEAN normalized to 0 dB):");
for (const s of all) {
  const rel = s.loudnessDb - ref;
  console.log(`  ${s.snapshotName.padEnd(12)} ${(rel > 0 ? "+" : "") + rel.toFixed(2)} dB`);
}
