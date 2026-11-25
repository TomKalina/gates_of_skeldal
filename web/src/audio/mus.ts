export interface MusInfo {
  channels: number;
  freq: number;
  blocks: number;
}

export interface MusDecoded extends MusInfo {
  samples: Int16Array[];
}

const HEADER_SIZE = 22 + 512;

const toShort = (v: number): number => (v << 16) >> 16;

export function readMusInfo(buf: Uint8Array): MusInfo {
  if (buf.length < HEADER_SIZE) throw new Error('MUS: truncated header');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    channels: dv.getInt16(0, true),
    freq: dv.getInt32(2, true),
    blocks: dv.getInt32(10, true),
  };
}

export function decodeMus(buf: Uint8Array): MusDecoded {
  const info = readMusInfo(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const btable = new Int16Array(256);
  for (let i = 0; i < 256; i++) btable[i] = dv.getInt16(22 + i * 2, true);
  let pos = HEADER_SIZE;
  const samples: Int16Array[] = [];
  const chans = info.channels;
  for (let b = 0; b < info.blocks; b++) {
    if (pos + 8 > buf.length) throw new Error('MUS: truncated block header');
    const p = dv.getInt32(pos, true);
    pos += 8;
    if (pos + p > buf.length) throw new Error('MUS: truncated block data');
    const out = new Int16Array(p);
    const accum = [0, 0];
    let c = 0;
    for (let i = 0; i < p; i++) {
      const code = buf[pos++] ?? 0;
      let val = toShort((accum[c] ?? 0) + (btable[code] ?? 0));
      accum[c] = val;
      if (code === 0) val = toShort(val - 31767);
      c = (c + 1) % chans;
      out[i] = val;
    }
    samples.push(out);
  }
  return { ...info, samples };
}
