/**
 * Type definitions for a Helix preset, narrowed to what the gain estimator reads.
 *
 * Source of truth is the .hlx JSON the user exports from HX Edit. We type only
 * the fields we actually inspect, leaving the rest as unknown.
 */

export type ParamValue = {
  "@value": number;
  "@fs_enabled"?: boolean;
};

export type BlockNode = {
  "@model": string;
  "@enabled": boolean;
  "@path"?: number;
  "@position"?: number;
  "@cab"?: string;
  // Per-block default parameter values (e.g. Drive, ChVol, Mix, Bass, Treble, Gain).
  // Keyed by parameter name. Value is either a number, a string, or a ParamValue.
  [paramName: string]: unknown;
};

export type DspMap = {
  [slot: string]: BlockNode | unknown;
};

export type SnapshotNode = {
  "@name"?: string;
  "@tempo"?: number;
  "@valid"?: boolean;
  blocks?: {
    [dsp: string]: { [slot: string]: boolean };
  };
  controllers?: {
    [dsp: string]: { [slot: string]: { [param: string]: ParamValue } };
  };
};

export type HelixPreset = {
  data: {
    meta: { name: string; [k: string]: unknown };
    tone: {
      dsp0: DspMap;
      dsp1?: DspMap;
      snapshot0?: SnapshotNode;
      snapshot1?: SnapshotNode;
      snapshot2?: SnapshotNode;
      snapshot3?: SnapshotNode;
      snapshot4?: SnapshotNode;
      snapshot5?: SnapshotNode;
      snapshot6?: SnapshotNode;
      snapshot7?: SnapshotNode;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
};
