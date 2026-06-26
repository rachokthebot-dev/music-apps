/**
 * Minimal WAV decoder for server-side loudness measurement.
 *
 * Browsers have AudioContext.decodeAudioData; Node does not, and the measure
 * route runs in Node. We only need what a Helix / DAW capture produces:
 * uncompressed PCM (16/24/32-bit int or 32-bit float), mono or stereo.
 *
 * Returns de-interleaved channels as Float32Array in [-1, 1], the natural
 * input shape for integratedLufs().
 */

export type DecodedWav = {
  sampleRate: number;
  channels: Float32Array[];
};

export function decodeWav(buf: Buffer): DecodedWav {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file (missing RIFF/WAVE header).");
  }

  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;

  // Walk chunks: each is a 4-byte id + 4-byte LE size + payload (word-aligned).
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, buf.length - body);
    }
    pos = body + size + (size % 2); // pad byte for odd-sized chunks
  }

  if (!fmt) throw new Error("WAV missing fmt chunk.");
  if (dataOffset < 0) throw new Error("WAV missing data chunk.");

  // WAVE_FORMAT_EXTENSIBLE (0xFFFE) carries the real format later, but for the
  // 16/24/32 PCM and 32-float cases we handle, bitsPerSample is enough.
  const { channels, sampleRate, bitsPerSample, audioFormat } = fmt;
  const isFloat = audioFormat === 3;
  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * channels;
  const frames = Math.floor(dataLength / frameSize);

  const out: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(frames));

  const readSample = (off: number): number => {
    if (isFloat) {
      if (bitsPerSample === 32) return buf.readFloatLE(off);
      if (bitsPerSample === 64) return buf.readDoubleLE(off);
      throw new Error(`Unsupported float bit depth: ${bitsPerSample}`);
    }
    switch (bitsPerSample) {
      case 16:
        return buf.readInt16LE(off) / 32768;
      case 24: {
        const v = buf.readUIntLE(off, 3);
        return (v >= 0x800000 ? v - 0x1000000 : v) / 0x800000;
      }
      case 32:
        return buf.readInt32LE(off) / 2147483648;
      default:
        throw new Error(`Unsupported PCM bit depth: ${bitsPerSample}`);
    }
  };

  for (let f = 0; f < frames; f++) {
    const frameOff = dataOffset + f * frameSize;
    for (let c = 0; c < channels; c++) {
      out[c][f] = readSample(frameOff + c * bytesPerSample);
    }
  }

  return { sampleRate, channels: out };
}
