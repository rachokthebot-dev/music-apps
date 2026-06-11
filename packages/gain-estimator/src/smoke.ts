/**
 * Smoke test against the user's actual master preset.
 *
 * Run:  npx tsx packages/gain-estimator/src/smoke.ts
 * Or:   cd packages/gain-estimator && npx tsx src/smoke.ts
 */

import { readFileSync } from "node:fs";

import { estimateAllSnapshots, type HelixPreset } from "./index";
import { resolveMasterPath } from "./smokeUtil";

const MASTER = resolveMasterPath("seed.hlx");

const preset = JSON.parse(readFileSync(MASTER, "utf-8")) as HelixPreset;
const results = estimateAllSnapshots(preset);

const ref = results[0].loudnessDb; // CLEAN as 0 dB baseline

console.log(`\nMaster: ${MASTER.split("/").pop()}`);
console.log(`Baseline (CLEAN snapshot[0]): ${ref.toFixed(2)} dB raw → 0 dB normalized`);
console.log("");
console.log("snapshot           raw      vs CLEAN");
console.log("--------------------------------------");
for (const r of results) {
  const rel = r.loudnessDb - ref;
  const arrow = rel > 0 ? "+" : "";
  console.log(
    `${r.snapshotName.padEnd(16)}  ${r.loudnessDb.toFixed(2).padStart(6)}   ${arrow}${rel.toFixed(2)} dB`
  );
}

console.log("\nDetailed contribution per enabled block, ROCK RHY (snapshot 2):");
const rock = results[2];
for (const c of rock.contributions) {
  if (!c.enabled) continue;
  const dbStr = c.db === null ? "  ?  " : c.db.toFixed(2).padStart(6);
  console.log(`  ${c.dsp}.${c.slot.padEnd(7)} ${dbStr}  ${c.model}`);
}
