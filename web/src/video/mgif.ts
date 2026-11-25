export const MGIF_EMPTY = 0;
export const MGIF_LZW = 1;
export const MGIF_DELTA = 2;
export const MGIF_PAL = 3;
export const MGIF_SOUND = 4;
export const MGIF_TEXT = 5;
export const MGIF_COPY = 6;
export const MGIF_SINIT = 7;

export const MGIF_HEADER_SIZE = 595;

export interface MgifHeader {
  year: string;
  eof: number;
  ver: number;
  frames: number;
  sndChans: number;
  sndFreq: number;
  amplTable: Int16Array;
}

export interface MgifChunk {
  type: number;
  data: Uint8Array;
}

export interface MgifFile {
  header: MgifHeader;
  frames: MgifChunk[][];
}

function u24(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
}

export function parseMgifHeader(buf: Uint8Array): MgifHeader | null {
  if (buf.length < MGIF_HEADER_SIZE) return null;
  const sign = String.fromCharCode(buf[0] ?? 0, buf[1] ?? 0, buf[2] ?? 0, buf[3] ?? 0);
  if (sign !== "MGIF") return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const amplTable = new Int16Array(256);
  for (let i = 0; i < 256; i++) amplTable[i] = dv.getInt16(19 + i * 2, true);
  return {
    year: String.fromCharCode(buf[4] ?? 0, buf[5] ?? 0),
    eof: buf[6] ?? 0,
    ver: dv.getUint16(7, true),
    frames: dv.getInt32(9, true),
    sndChans: dv.getUint16(13, true),
    sndFreq: dv.getInt32(15, true),
    amplTable,
  };
}

export function parseMgif(buf: Uint8Array): MgifFile | null {
  const header = parseMgifHeader(buf);
  if (!header) return null;
  const frames: MgifChunk[][] = [];
  let pf = MGIF_HEADER_SIZE;
  for (let f = 0; f < header.frames && pf + 4 <= buf.length; f++) {
    const count = buf[pf] ?? 0;
    const size = u24(buf, pf + 1);
    let pc = pf + 4;
    pf = pc + size;
    const chunks: MgifChunk[] = [];
    for (let i = 0; i < count; i++) {
      const type = buf[pc] ?? 0;
      const csize = u24(buf, pc + 1);
      pc += 4;
      chunks.push({ type, data: buf.subarray(pc, pc + csize) });
      pc += csize;
    }
    frames.push(chunks);
  }
  return { header, frames };
}
