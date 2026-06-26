/**
 * Client-side WAV encoder for live capture.
 *
 * Live capture records raw PCM off the Helix via an AudioWorklet, then encodes
 * it here into a 32-bit-float WAV Blob and POSTs it to /api/measure — the exact
 * same endpoint the file-upload path uses. So both paths converge on one server
 * route, one decoder (wav.ts), one BS.1770 measurement.
 *
 * Float32 (WAVE format 3) is lossless, sidestepping any quantization argument
 * about whether 16-bit affects a loudness reading.
 */

export function encodeWavFloat32(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 4;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = numFrames * blockAlign;

  const buf = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 3, true); // WAVE_FORMAT_IEEE_FLOAT
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 32, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  let off = 44;
  for (let f = 0; f < numFrames; f++) {
    for (let c = 0; c < numChannels; c++) {
      view.setFloat32(off, channels[c][f], true);
      off += 4;
    }
  }

  return new Blob([buf], { type: "audio/wav" });
}
