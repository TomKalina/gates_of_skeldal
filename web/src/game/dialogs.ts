export const P_STRING = 1;
export const P_SHORT = 2;
export const P_VAR = 3;

export const OPER_EQ = 32;
export const OPER_LOW = 33;
export const OPER_LOWEQ = 34;
export const OPER_BIG = 35;
export const OPER_BIGEQ = 36;
export const OPER_NOEQ = 37;

export interface Paragraph {
  num: number;
  alt: number;
  visited: boolean;
  first: boolean;
  position: number;
}

export interface DialogData {
  paragraphs: Paragraph[];
  code: Uint8Array;
}

export function parseDialogData(buf: Uint8Array): DialogData {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = dv.getInt32(0, true);
  const paragraphs: Paragraph[] = [];
  for (let i = 0; i < count; i++) {
    const off = 8 + i * 8;
    const bits = dv.getUint32(off, true);
    paragraphs.push({
      num: bits & 0x7fff,
      alt: (bits >>> 15) & 0x7fff,
      visited: ((bits >>> 30) & 1) === 1,
      first: ((bits >>> 31) & 1) === 1,
      position: dv.getInt32(off + 4, true),
    });
  }
  return { paragraphs, code: buf.subarray(8 + count * 8) };
}

export function findParagraph(data: DialogData, num: number, localPgf = 0): Paragraph {
  const target = num + localPgf;
  const found = data.paragraphs.find((p) => p.num === target);
  if (!found) throw new Error(`Paragraph ${target} doesn't exists!`);
  return found;
}

export function findPgNum(data: DialogData, pc: number, localPgf = 0): number {
  let lastnum = -1;
  for (const p of data.paragraphs) {
    if (p.position > pc) break;
    lastnum = p.num;
  }
  return lastnum - localPgf;
}

export function gotoParagraph(data: DialogData, prgf: number, localPgf = 0): { pc: number; lastPgf: number } {
  for (;;) {
    const z = findParagraph(data, prgf, localPgf);
    if (z.visited) z.first = true;
    if (z.alt === z.num || !z.visited) {
      z.visited = true;
      return { pc: z.position, lastPgf: prgf };
    }
    prgf = z.alt - localPgf;
  }
}

export function readShort(code: Uint8Array, pc: number): number {
  const v = (code[pc] ?? 0) + 256 * (code[pc + 1] ?? 0);
  return (v << 16) >> 16;
}

export function getShort(code: Uint8Array, pc: number, variables: ArrayLike<number>): { value: number; pc: number } {
  const t = code[pc];
  if (t === P_SHORT) return { value: readShort(code, pc + 1), pc: pc + 3 };
  if (t === P_VAR) return { value: variables[readShort(code, pc + 1)] ?? 0, pc: pc + 3 };
  throw new Error("Expected number");
}

export function operBalance(val1: number, val2: number, oper: number): boolean {
  switch (oper) {
    case OPER_EQ: return val1 === val2;
    case OPER_BIG: return val1 > val2;
    case OPER_LOW: return val1 < val2;
    case OPER_BIGEQ: return val1 >= val2;
    case OPER_LOWEQ: return val1 <= val2;
    case OPER_NOEQ: return val1 !== val2;
    default: throw new Error("Invalid comparison operator");
  }
}

export function testFlag(map: Uint8Array, flag: number): boolean {
  return ((map[flag >> 3] ?? 0) & (1 << (flag & 7))) !== 0;
}

export function changeFlag(map: Uint8Array, flag: number, mode: 0 | 1 | 2): void {
  const i = flag >> 3;
  const bit = 1 << (flag & 7);
  const cur = map[i] ?? 0;
  map[i] = mode === 0 ? cur & ~bit : mode === 1 ? cur | bit : cur ^ bit;
}
