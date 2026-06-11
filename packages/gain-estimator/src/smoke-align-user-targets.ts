import { readFileSync } from "node:fs";
import { alignGain, currentMeasuredOffsets, type HelixPreset } from "./index";
import { resolveMasterPath } from "./smokeUtil";

const MASTER = resolveMasterPath("seed.hlx");
const preset = JSON.parse(readFileSync(MASTER, "utf-8")) as HelixPreset;

// Pick JAZZ (index 1) as baseline; set custom dB targets for the rest.
const baselineIndex = 1;
const targets: Record<number, number> = {
  0: -3,   // CLEAN quieter
  2: 0,    // ROCK RHY equal to JAZZ
  3: 0,    // HEAVY RHY equal to JAZZ
  4: 2,    // CLEAN SOLO +2
  5: 3,    // JAZZ SOLO +3
  6: 4,    // ROCK SOLO +4
  7: 5,    // HEAVY SOLO +5
};

console.log("Measured offsets if baseline=JAZZ:", currentMeasuredOffsets(preset, baselineIndex));
console.log("\nWith user targets:", targets);

const result = alignGain(preset, {
  baselineIndex,
  soloLiftMode: "strict_3db",
  toleranceDb: 0.5,
  targets,
  allowBoostInsertion: true,
});

console.log(`\nBaseline: ${result.baselineName} (raw ${result.baselineRawDb.toFixed(2)} dB)`);
console.log(`Insertion: ${result.insertion ? JSON.stringify(result.insertion) : "(none)"}\n`);
for (const p of [...result.proposals, ...result.unchanged].sort((a,b)=>a.snapshotIndex-b.snapshotIndex)) {
  const tag = p.status === "conflict" ? "⚠ CONFLICT" : p.status === "no_change" ? "= unchanged" : "✓ adjusted";
  console.log(`${tag} [${p.snapshotIndex}] ${p.snapshotName.padEnd(14)} current ${p.currentDb.toFixed(2).padStart(6)} → target ${p.targetDb.toFixed(2).padStart(6)} (Δ ${p.deltaDb >= 0 ? "+" : ""}${p.deltaDb.toFixed(2)})`);
  for (const c of p.changes) console.log(`    ${c.dsp}.${c.slot} ${c.param} → ${c.value}`);
  for (const s of p.structuralChanges ?? []) console.log(`    [structural] ${s.kind} ${s.dsp}.${s.slot} (${s.block})`);
  if (p.conflict) console.log(`    [conflict: ${p.conflict.kind} — ${p.conflict.detail}]`);
}
