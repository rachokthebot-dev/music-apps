import { test } from "node:test";
import assert from "node:assert/strict";

import { integratedLufs } from "./loudness/bs1770";

/**
 * BS.1770's calibration property: a 1 kHz sine reads, in LUFS, the same number
 * as its dBFS RMS. The K-weighting gain at 1 kHz (~+0.69 dB) exactly cancels
 * the -0.691 dB absolute offset. So a tone at a known RMS is a self-checking
 * fixture — no golden file needed.
 */
function sine(freq: number, dbfsRms: number, fs: number, seconds: number): Float32Array {
  const rms = Math.pow(10, dbfsRms / 20);
  const amp = rms * Math.SQRT2; // sine RMS = amplitude / sqrt(2)
  const out = new Float32Array(Math.round(fs * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return out;
}

for (const fs of [48000, 44100]) {
  test(`1 kHz tone at -20 dBFS reads ~-20 LUFS @ ${fs}Hz`, () => {
    const r = integratedLufs([sine(1000, -20, fs, 3)], fs);
    assert.ok(Math.abs(r.lufs - -20) < 0.4, `got ${r.lufs.toFixed(2)} LUFS`);
    assert.ok(r.gatedBlocks > 0);
  });
}

test("full-scale 1 kHz sine reads ~-3.01 LUFS (mono)", () => {
  const r = integratedLufs([sine(1000, -3.01, 48000, 3)], 48000);
  assert.ok(Math.abs(r.lufs - -3.01) < 0.4, `got ${r.lufs.toFixed(2)} LUFS`);
});

test("stereo is ~3 dB louder than the same tone in one channel", () => {
  const ch = sine(1000, -20, 48000, 3);
  const mono = integratedLufs([ch], 48000).lufs;
  const stereo = integratedLufs([Float32Array.from(ch), Float32Array.from(ch)], 48000).lufs;
  assert.ok(Math.abs(stereo - mono - 3.01) < 0.2, `mono ${mono.toFixed(2)} stereo ${stereo.toFixed(2)}`);
});

test("silence falls below the absolute gate → -Infinity", () => {
  const r = integratedLufs([new Float32Array(48000 * 2)], 48000);
  assert.equal(r.lufs, -Infinity);
});

test("signal shorter than one 400ms block → -Infinity", () => {
  const r = integratedLufs([sine(1000, -20, 48000, 0.1)], 48000);
  assert.equal(r.lufs, -Infinity);
});
