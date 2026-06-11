/**
 * Per-block gain contribution models.
 *
 * Each function returns the block's contribution to **perceived loudness in dB**
 * relative to a bypass-state baseline. Active = enabled; if a block is bypassed
 * in the current snapshot, its contribution is 0.
 *
 * These are intentionally simple, defensible approximations — Line 6's internal
 * gain curves aren't published, so we model first-order behavior and accept
 * ±1–3 dB error per block. The LLM caller is expected to quote the formula in
 * its reasoning so the user understands what it's claiming.
 *
 * Where parameter values come from:
 *   - The block's default @value (the slot in dsp0/dsp1)
 *   - …overridden by the active snapshot's controllers[dsp][slot][param]["@value"]
 *
 * Effective value = override ?? default.
 */

export type GainContext = {
  paramValue: (paramName: string) => number | undefined;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Compressor — make-up gain plus peak compression.
 * Default: assume well-tuned ratio with ~3 dB make-up; peak reduction is
 * irrelevant to perceived RMS loudness so we count make-up only.
 */
export function compressorDeluxe(_ctx: GainContext): number {
  return 3.0;
}

/**
 * Klon-style boost (HD2_DistMinotaur).
 * Gain knob is roughly clean (transparent) at the low end and clipping at the
 * high end. Real Klons have ~+20 dB headroom on the level knob, but most users
 * dial Gain to taste and Level for output. We model as:
 *   gain_dB ≈ Gain * 8   when Gain < 0.5  (clean-ish boost)
 *           ≈ 4 + (Gain - 0.5) * 6  when Gain >= 0.5  (with clipping compression)
 * Effective range: 0 → 7 dB.
 */
export function klonMinotaur(ctx: GainContext): number {
  const gain = ctx.paramValue("Gain") ?? 0.2;
  if (gain < 0.5) return gain * 8;
  return 4 + (gain - 0.5) * 6;
}

/**
 * Tube amp output stage — ChVol knob is the primary output control.
 * Helix amps roughly follow a perceptual log curve on ChVol; we approximate as:
 *   chvol_dB = 20 * log10(max(0.05, ChVol))
 *
 * That gives:
 *   ChVol 0.05 → -26 dB
 *   ChVol 0.30 → -10 dB
 *   ChVol 0.50 →  -6 dB
 *   ChVol 0.72 →  -3 dB  (user's master)
 *   ChVol 1.00 →   0 dB
 *
 * Drive contributes via saturation compression. As Drive goes up, peaks get
 * squashed against the clipping ceiling and perceived loudness rises:
 *   drive_dB = clamp(Drive * 12 - 1, 0, 7)
 *
 * Cab/IR is treated as a separate ±1 dB constant downstream (cabContribution).
 */
export function tubeAmp(ctx: GainContext): number {
  const chvol = ctx.paramValue("ChVol") ?? 0.7;
  const drive = ctx.paramValue("Drive") ?? 0.5;
  const chvolDb = 20 * Math.log10(Math.max(0.05, chvol));
  const driveDb = clamp(drive * 12 - 1, 0, 7);
  return chvolDb + driveDb;
}

/**
 * Speaker cabinet IR — passive, mostly neutral. Different cabs have small but
 * real baseline-level differences. For v1 we treat them as +0 dB and trust
 * later calibration to lift specific IRs if needed.
 */
export function cab(_ctx: GainContext): number {
  return 0;
}

/**
 * Parametric / Graphic EQ — contribution depends on whether bands are boosted
 * or cut. For v1 we treat as 0 unless the user has specifically dialed bands.
 * If you boost the mid-band by +3 dB, that's +3 dB perceived in the most
 * sensitive part of the spectrum. We approximate by summing all band gains.
 */
export function eq(ctx: GainContext): number {
  // Helix Parametric EQ exposes Low/Mid/High band gain in dB (-12..+12).
  // Their net effect on perceived loudness isn't quite the sum, but it's the
  // closest first-order model that respects boost vs cut symmetry.
  const lo = ctx.paramValue("LowGain") ?? 0;
  const mid = ctx.paramValue("MidGain") ?? 0;
  const hi = ctx.paramValue("HighGain") ?? 0;
  // Mid is most perceptually loud per dB; weight slightly higher.
  return 0.6 * lo + 1.0 * mid + 0.6 * hi;
}

/**
 * Delay (parallel) — Mix knob adds RMS energy without changing peak level.
 * Roughly: at Mix=0.5, +1.5 dB perceived RMS; at Mix=1.0, +3 dB.
 */
export function delay(ctx: GainContext): number {
  const mix = ctx.paramValue("Mix") ?? 0;
  return mix * 3.0;
}

/**
 * Boost block (HD2_VolPanGain) — pure linear gain stage. Param "Gain" is in
 * dB directly (not normalized 0..1). +3.0 means +3 dB.
 */
export function boost(ctx: GainContext): number {
  return ctx.paramValue("Gain") ?? 0;
}

/**
 * Dispatch by Helix @model string. Returns null for unknown models so we know
 * to log a warning rather than silently miss gain.
 */
export function gainForModel(model: string, ctx: GainContext): number | null {
  if (model.startsWith("HD2_Compressor")) return compressorDeluxe(ctx);
  if (model.startsWith("HD2_DistMinotaur")) return klonMinotaur(ctx);
  if (model.startsWith("HD2_Amp")) return tubeAmp(ctx);
  if (model.startsWith("HD2_Cab")) return cab(ctx);
  if (model.startsWith("HD2_EQ")) return eq(ctx);
  if (model.startsWith("HD2_Delay") || model.startsWith("HD2_DL4")) return delay(ctx);
  if (model.startsWith("HD2_VolPan")) return boost(ctx);
  // Generic distortion/fuzz: similar gain curve to Klon but more aggressive.
  if (model.startsWith("HD2_Dist")) return klonMinotaur(ctx);
  return null;
}
