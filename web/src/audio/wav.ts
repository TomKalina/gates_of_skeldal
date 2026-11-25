export interface WaveFormat {
  wavMode: number;
  chans: number;
  freq: number;
  bps: number;
}

export interface WavDecoded {
  format: WaveFormat;
  data: Uint8Array;
}

const tag = (buf: Uint8Array, at: number): string =>
  String.fromCharCode(buf[at] ?? 0, buf[at + 1] ?? 0, buf[at + 2] ?? 0, buf[at + 3] ?? 0);

export function findChunk(buf: Uint8Array, name: string): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 12;
  while (pos + 8 <= buf.length) {
    if (tag(buf, pos) === name) return pos + 4;
    const next = dv.getInt32(pos + 4, true);
    pos += 8 + next;
  }
  return -1;
}

export function decodeWav(buf: Uint8Array): WavDecoded {
  if (tag(buf, 0) !== 'RIFF' || tag(buf, 8) !== 'WAVE') throw new Error('WAV: not RIFF/WAVE');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fmt = findChunk(buf, 'fmt ');
  const data = findChunk(buf, 'data');
  if (fmt < 0 || data < 0) throw new Error('WAV: missing chunk');
  const format: WaveFormat = {
    wavMode: dv.getUint16(fmt + 4, true),
    chans: dv.getUint16(fmt + 6, true),
    freq: dv.getInt32(fmt + 8, true),
    bps: dv.getInt32(fmt + 12, true),
  };
  const size = dv.getInt32(data, true);
  return { format, data: buf.subarray(data + 4, data + 4 + size) };
}
