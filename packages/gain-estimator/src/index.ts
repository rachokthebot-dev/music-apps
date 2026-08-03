/**
 * Gain estimator package — public API.
 *
 * Two layers:
 *   - estimator: pure functions that read a Helix preset and report dB loudness
 *   - aligner:   deterministic proposals to bring snapshots to target loudness
 *
 * Both are used by the soundpath Next.js app and by the smoke-test scripts.
 */

export type { HelixPreset, BlockNode, SnapshotNode, ParamValue } from "./types";

export {
  estimateSnapshotLoudness,
  predictLoudnessChange,
  estimateAllSnapshots,
  type SnapshotLoudness,
  type ParamOverride,
} from "./estimator";

export {
  alignGain,
  currentMeasuredOffsets,
  DEFAULT_CONFIG,
  targetLiftFor,
  type SoloLiftMode,
  type AlignmentConfig,
  type Proposal,
  type AlignmentResult,
  type Change,
  type StructuralChange,
  type PresetInsertion,
} from "./aligner";

export {
  friendlyName,
  friendlyParam,
  friendlyCategory,
  friendlyBlock,
  realWorldName,
} from "./blockNames";

export {
  getCatalogEntry,
  catalogName,
  catalogBasedOn,
  catalogParamRange,
  type CatalogEntry,
  type CatalogParam,
} from "./catalog";

export {
  applyProposals,
  stringifyHelixPreset,
  type ApplyOptions,
} from "./applyProposals";

export {
  applySnapshotPatch,
  type SnapshotPatch,
  type ApplyReport,
} from "./applySnapshotPatch";

export {
  cloneSkeleton,
  placeBlock,
  setSnapshotName,
  setPresetName,
  clearChainBlocks,
  clearAllSnapshots,
  AVAILABLE_SLOTS,
} from "./presetSkeleton";

export {
  applyPresetDesign,
  type PresetDesign,
  type DesignedBlock,
  type DesignedSnapshot,
  type ApplyDesignReport,
} from "./applyPresetDesign";

export { integratedLufs, type LoudnessResult } from "./loudness/bs1770";
export { decodeWav, type DecodedWav } from "./loudness/wav";
export {
  splitAndMeasure,
  type Segment,
  type SegmentOptions,
} from "./segment";
export {
  buildSetlistFile,
  nameForSong,
  type HlxLike,
} from "./hls";
