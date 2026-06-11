/** Offline test of designPreset.validateDesign — does it catch the rules? */

import { getCatalogEntry, type PresetDesign } from "./index";

// Re-import the validator directly since it lives in the soundpath app
// (this smoke is in the gain-estimator package, so we replicate the logic):
function validate(design: PresetDesign): { warnings: string[]; dspPerPath: Record<string, number> } {
  const warnings: string[] = [];
  const dspPerPath: Record<string, number> = {};

  const used = new Set<string>();
  for (const s of design.snapshots ?? []) for (const slot of s.enabledBlocks ?? []) used.add(slot);
  for (const b of design.chain ?? []) {
    if (!used.has(b.slot)) warnings.push(`Dead block: ${b.model} at ${b.dsp}/${b.slot}`);
    const cost = getCatalogEntry(b.model)?.DSP_Mono ?? 0;
    const k = `${b.dsp}/path${b.path}`;
    dspPerPath[k] = (dspPerPath[k] ?? 0) + cost;
  }
  for (const [p, t] of Object.entries(dspPerPath)) {
    if (t > 100) warnings.push(`DSP overflow on ${p}: ${t.toFixed(1)}%`);
    else if (t > 95) warnings.push(`DSP near budget on ${p}: ${t.toFixed(1)}%`);
  }
  return { warnings, dspPerPath };
}

// CASE A — clean design (no dead blocks, under budget)
const ok: PresetDesign = {
  presetName: "OK",
  chain: [
    { dsp: "dsp0", slot: "block0", path: 0, position: 0, model: "HD2_CompressorDeluxeComp" },
    { dsp: "dsp0", slot: "block1", path: 0, position: 1, model: "HD2_DistMinotaur" },
  ],
  snapshots: [
    { index: 0, name: "C", enabledBlocks: ["block0"], params: {} },
    { index: 1, name: "X", enabledBlocks: ["block0", "block1"], params: {} },
    { index: 2, name: "Y", enabledBlocks: ["block0", "block1"], params: {} },
    { index: 3, name: "Z", enabledBlocks: ["block0", "block1"], params: {} },
    { index: 4, name: "C2", enabledBlocks: ["block0"], params: {} },
    { index: 5, name: "X2", enabledBlocks: ["block0", "block1"], params: {} },
    { index: 6, name: "Y2", enabledBlocks: ["block0", "block1"], params: {} },
    { index: 7, name: "Z2", enabledBlocks: ["block0", "block1"], params: {} },
  ],
};

// CASE B — dead block (block2 placed but never enabled in any snapshot)
const dead: PresetDesign = {
  ...ok,
  presetName: "DEAD",
  chain: [
    ...ok.chain,
    { dsp: "dsp0", slot: "block2", path: 0, position: 2, model: "HD2_ReverbPlate" },
  ],
};

// CASE C — DSP overflow (stack heavy amps on same path)
const overflow: PresetDesign = {
  presetName: "OVER",
  chain: [
    { dsp: "dsp0", slot: "block0", path: 0, position: 0, model: "HD2_AmpRevvGenRed" },
    { dsp: "dsp0", slot: "block1", path: 0, position: 1, model: "HD2_AmpRevvGenPurple" },
    { dsp: "dsp0", slot: "block2", path: 0, position: 2, model: "HD2_AmpRevvGenRed" },
    { dsp: "dsp0", slot: "block3", path: 0, position: 3, model: "HD2_AmpRevvGenPurple" },
  ],
  snapshots: ok.snapshots.map((s) => ({
    ...s,
    enabledBlocks: ["block0", "block1", "block2", "block3"],
  })),
};

for (const [label, d] of [["A clean", ok], ["B dead", dead], ["C overflow", overflow]] as const) {
  const v = validate(d);
  console.log(`\n[${label}] dspPerPath = ${JSON.stringify(v.dspPerPath)}`);
  if (v.warnings.length === 0) console.log("  ✓ no warnings");
  else for (const w of v.warnings) console.log(`  ⚠ ${w}`);
}
