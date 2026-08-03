/**
 * ITU-R BS.1770 integrated loudness (LUFS).
 *
 * This is the ground-truth counterpart to the static gain estimator: the
 * estimator *predicts* loudness from a preset's JSON, this *measures* it from
 * real captured audio (the patch played through the Helix's USB / line out).
 * The two are compared per snapshot to surface where the estimator's per-block
 * models are wrong (see the soundpath /api/measure route).
 *
 * Pure functions, no deps — same ethos as estimator.ts.
 *
 * Pipeline (per the spec):
 *   1. K-weighting filter per channel (high-shelf + RLB high-pass biquads)
 *   2. 400 ms blocks, 75% overlap (100 ms hop), mean-square per block
 *   3. Channel-weighted block loudness, -0.691 dB absolute offset
 *   4. Two-stage gating: -70 LUFS absolute, then -10 LU relative
 *   5. Integrated loudness over surviving blocks
 *
 * Coefficients are derived from the RBJ cookbook at the signal's own sample
 * rate (via biquad params from pyloudnorm), so 44.1k / 48k / etc. all work —
 * at 48 kHz they reproduce the canonical BS.1770 reference coefficients.
 */

const ABSOLUTE_OFFSET = -0.691; // dB, BS.1770 calibration constant
const ABSOLUTE_GATE = -70; // LUFS
const RELATIVE_GATE = -10; // LU below the absolute-gated loudness

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** RBJ high-shelf biquad, normalized by a0. */
function highShelf(fc: number, q: number, gainDb: number, fs: number): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const sqrtA = Math.sqrt(A);

  const b0 = A * (A + 1 + (A - 1) * cos + 2 * sqrtA * alpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cos);
  const b2 = A * (A + 1 + (A - 1) * cos - 2 * sqrtA * alpha);
  const a0 = A + 1 - (A - 1) * cos + 2 * sqrtA * alpha;
  const a1 = 2 * (A - 1 - (A + 1) * cos);
  const a2 = A + 1 - (A - 1) * cos - 2 * sqrtA * alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** RBJ high-pass biquad, normalized by a0. */
function highPass(fc: number, q: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);

  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Apply a biquad in place over a channel (direct form I). */
function applyBiquad(x: Float32Array, f: Biquad): void {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = f.b0 * x0 + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

/** K-weight a channel: high-shelf (~+4 dB) then RLB high-pass. Returns a copy. */
function kWeight(channel: Float32Array, fs: number): Float32Array {
  const out = Float32Array.from(channel);
  // Params from pyloudnorm; at 48 kHz these match the BS.1770 reference coeffs.
  applyBiquad(out, highShelf(1681.9744509555319, 0.7071752369554193, 3.99984385397, fs));
  applyBiquad(out, highPass(38.13547087602444, 0.5003270373253953, fs));
  return out;
}

/** G_c is 1.0 for every channel in mono/stereo; surround would lift the rears. */
function blockLoudness(z: number[]): number {
  let s = 0;
  for (const v of z) s += v;
  return s > 0 ? ABSOLUTE_OFFSET + 10 * Math.log10(s) : -Infinity;
}

/** Mean square per channel for each 400 ms K-weighted block, 100 ms hop. */
function kWeightedBlocks(channels: Float32Array[], sampleRate: number): number[][] {
  const weighted = channels.map((c) => kWeight(c, sampleRate));
  const blockLen = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const n = weighted[0].length;
  if (n < blockLen) return [];

  const blocks: number[][] = [];
  for (let start = 0; start + blockLen <= n; start += hop) {
    const z: number[] = [];
    for (let c = 0; c < weighted.length; c++) {
      let sum = 0;
      const ch = weighted[c];
      for (let i = start; i < start + blockLen; i++) sum += ch[i] * ch[i];
      z.push(sum / blockLen);
    }
    blocks.push(z);
  }
  return blocks;
}

/** Seconds between consecutive momentaryTrace values. */
export const MOMENTARY_HOP_SEC = 0.1;

/**
 * Momentary loudness — one 400 ms block every 100 ms, ungated.
 *
 * The integrated figure deliberately throws shape away; this keeps it. Two
 * takes can share a LUFS number and be completely different events, and the
 * difference is diagnostic: a guitar chord decays smoothly into a flat noise
 * floor, so a floor that *climbs* after the note dies is an input path adding
 * gain of its own. That's the only way to catch automatic gain control on a
 * browser that won't admit to applying it.
 */
export function momentaryTrace(channels: Float32Array[], sampleRate: number): Float32Array {
  return Float32Array.from(kWeightedBlocks(channels, sampleRate).map(blockLoudness));
}

export type LoudnessResult = {
  /** Integrated loudness in LUFS, or -Infinity if the signal is too short/quiet. */
  lufs: number;
  /** Channels analyzed. */
  channels: number;
  /** Number of 400 ms blocks that passed both gates. */
  gatedBlocks: number;
};

/**
 * Integrated loudness (LUFS) of a multi-channel signal.
 *
 * @param channels  one Float32Array per channel, samples in [-1, 1]
 * @param sampleRate  Hz
 */
export function integratedLufs(channels: Float32Array[], sampleRate: number): LoudnessResult {
  if (channels.length === 0) return { lufs: -Infinity, channels: 0, gatedBlocks: 0 };

  const blocks = kWeightedBlocks(channels, sampleRate);
  if (blocks.length === 0) return { lufs: -Infinity, channels: channels.length, gatedBlocks: 0 };

  // Stage 1: absolute gate at -70 LUFS.
  const absKept = blocks.filter((z) => blockLoudness(z) > ABSOLUTE_GATE);
  if (absKept.length === 0)
    return { lufs: -Infinity, channels: channels.length, gatedBlocks: 0 };

  // Mean square per channel over absolute-gated blocks → reference loudness.
  const meanZ = (set: number[][]): number[] => {
    const m = new Array(channels.length).fill(0);
    for (const z of set) for (let c = 0; c < z.length; c++) m[c] += z[c];
    return m.map((v) => v / set.length);
  };
  const relThreshold = blockLoudness(meanZ(absKept)) + RELATIVE_GATE;

  // Stage 2: relative gate.
  const relKept = absKept.filter((z) => blockLoudness(z) > relThreshold);
  if (relKept.length === 0)
    return { lufs: -Infinity, channels: channels.length, gatedBlocks: 0 };

  return {
    lufs: blockLoudness(meanZ(relKept)),
    channels: channels.length,
    gatedBlocks: relKept.length,
  };
}
