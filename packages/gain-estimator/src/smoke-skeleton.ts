/** Quick smoke for presetSkeleton helpers. Run: npx tsx src/smoke-skeleton.ts */

import {
  cloneSkeleton,
  placeBlock,
  setSnapshotName,
  setPresetName,
  clearChainBlocks,
  clearAllSnapshots,
} from "./index";

const preset = cloneSkeleton();
console.log("--- before edits ---");
console.log("name:", preset.data.meta.name);
console.log("dsp0 slots:", Object.keys(preset.data.tone.dsp0));

clearChainBlocks(preset, "dsp0");
clearChainBlocks(preset, "dsp1");
clearAllSnapshots(preset);

const ok1 = placeBlock(preset, "dsp0", "block0", "HD2_CompressorDeluxeComp", { path: 0, position: 0 });
const ok2 = placeBlock(preset, "dsp0", "block1", "HD2_DistMinotaur", { path: 0, position: 1 });
const ok3 = placeBlock(preset, "dsp0", "block2", "HD2_AmpBritPlexiNrm", { path: 0, position: 2, cab: "cab0" });
const ok4 = placeBlock(preset, "dsp0", "cab0", "HD2_CabMicIr_4x12Greenback25", { path: 0, position: 2 });

setPresetName(preset, "Skeleton Test");
setSnapshotName(preset, 0, "Clean");
setSnapshotName(preset, 1, "Crunch");

console.log("\n--- after edits ---");
console.log("name:", preset.data.meta.name);
console.log("placement ok flags:", { ok1, ok2, ok3, ok4 });
console.log("dsp0 slots after rebuild:", Object.keys(preset.data.tone.dsp0));
const dsp0 = preset.data.tone.dsp0 as Record<string, { "@model"?: string; "@cab"?: string }>;
console.log("block0 model:", dsp0.block0?.["@model"]);
console.log("block2 (amp) model + @cab:", dsp0.block2?.["@model"], dsp0.block2?.["@cab"]);
console.log("cab0 model:", dsp0.cab0?.["@model"]);
console.log("snapshot0 @name:", (preset.data.tone.snapshot0 as { "@name"?: string })?.["@name"]);
console.log("snapshot1 @name:", (preset.data.tone.snapshot1 as { "@name"?: string })?.["@name"]);
