/**
 * Smoke test of the alignment proposer against the user's master preset.
 *
 * Run:  npx tsx src/smoke-align.ts [strict_3db|genre_aware]
 */

import { readFileSync } from "node:fs";

import { type HelixPreset, alignGain, type SoloLiftMode } from "./index";
import { resolveMasterPath } from "./smokeUtil";

// CLI: npx tsx smoke-align.ts [strict_3db|genre_aware] [/path/to/preset.hlx]
const mode = (process.argv[2] as SoloLiftMode) ?? "strict_3db";
// Skip past the mode arg when delegating to the path resolver.
const pathArgIndex = process.argv[3] ? 3 : 2;
const originalArgv = process.argv;
process.argv = [...process.argv.slice(0, 2), process.argv[pathArgIndex] ?? ""];
const MASTER = resolveMasterPath("seed.hlx");
process.argv = originalArgv;

const preset = JSON.parse(readFileSync(MASTER, "utf-8")) as HelixPreset;
const result = alignGain(preset, {
  baselineIndex: 0,
  soloLiftMode: mode,
  toleranceDb: 0.5,
});

console.log(`\nALIGN GAIN — mode: ${mode}`);
console.log(`Baseline: ${result.baselineName}\n`);

console.log("Already aligned (within ±0.5 dB of target):");
if (result.unchanged.length === 0) {
  console.log("  (none)");
} else {
  for (const p of result.unchanged) {
    console.log(
      `  ${p.snapshotName.padEnd(14)} current ${p.currentDb.toFixed(2).padStart(6)} target ${p.targetDb.toFixed(2).padStart(6)}`
    );
  }
}
console.log("");

console.log("Proposed changes:");
for (const p of result.proposals) {
  const tag = p.status === "conflict" ? "⚠ CONFLICT" : "✓ adjusted";
  console.log(
    `  ${tag}  ${p.snapshotName.padEnd(14)} current ${p.currentDb.toFixed(2).padStart(6)} → target ${p.targetDb.toFixed(2).padStart(6)} (Δ ${p.deltaDb >= 0 ? "+" : ""}${p.deltaDb.toFixed(2)} dB)`
  );
  for (const c of p.changes) {
    console.log(`     ${c.dsp}.${c.slot} ${c.param} → ${c.value}`);
  }
  console.log(`     ${p.reasoning}`);
  if (p.conflict) {
    console.log(`     [conflict: ${p.conflict.kind} — ${p.conflict.detail}]`);
  }
  console.log("");
}
