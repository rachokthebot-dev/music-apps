/**
 * Split one song's recording into per-snapshot segments and measure each.
 *
 * The static estimator can't predict perceived loudness — a modeller's chain is
 * non-linear and its level depends on spectrum, not summed block gain. So the
 * numbers come from a real recording: play the same chord on each snapshot of
 * one preset, pause between them, and upload that song's file.
 *
 * This is the WAV entry point. The analysis itself lives in loudness/analyze.ts
 * so live capture in the browser can run it directly on the Float32 channels it
 * already has, instead of a second implementation that would drift from this.
 */

import { decodeWav } from "./loudness/wav";
import { splitAndMeasureChannels, type Segment, type SegmentOptions } from "./loudness/analyze";

export type { Segment, SegmentOptions };

export function splitAndMeasure(wav: Buffer, opts: SegmentOptions): Segment[] {
  const { sampleRate, channels } = decodeWav(wav);
  return splitAndMeasureChannels(channels, sampleRate, opts);
}
