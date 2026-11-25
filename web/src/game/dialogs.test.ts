import { describe, expect, it } from "vitest";
import { changeFlag, findPgNum, getShort, gotoParagraph, operBalance, OPER_BIGEQ, OPER_NOEQ, P_SHORT, P_VAR, parseDialogData, testFlag } from "./dialogs";

function build(paras: { num: number; alt: number; visited?: boolean; position: number }[], code: number[]): Uint8Array {
  const buf = new Uint8Array(8 + paras.length * 8 + code.length);
  const dv = new DataView(buf.buffer);
  dv.setInt32(0, paras.length, true);
  paras.forEach((p, i) => {
    const bits = (p.num & 0x7fff) | ((p.alt & 0x7fff) << 15) | ((p.visited ? 1 : 0) << 30);
    dv.setUint32(8 + i * 8, bits >>> 0, true);
    dv.setInt32(12 + i * 8, p.position, true);
  });
  buf.set(code, 8 + paras.length * 8);
  return buf;
}

describe("dialogs", () => {
  it("parses paragraph table and bitfields", () => {
    const d = parseDialogData(build([{ num: 5, alt: 7, visited: true, position: 3 }], [9, 9, 9]));
    expect(d.paragraphs[0]).toEqual({ num: 5, alt: 7, visited: true, first: false, position: 3 });
    expect(d.code.length).toBe(3);
  });

  it("goto follows alt once visited", () => {
    const d = parseDialogData(build([{ num: 1, alt: 2, position: 0 }, { num: 2, alt: 2, position: 4 }], [0, 0, 0, 0, 0]));
    expect(gotoParagraph(d, 1).pc).toBe(0);
    const r = gotoParagraph(d, 1);
    expect(r).toEqual({ pc: 4, lastPgf: 2 });
    expect(d.paragraphs[0]?.first).toBe(true);
    expect(findPgNum(d, 4)).toBe(2);
  });

  it("reads shorts and vars", () => {
    const code = new Uint8Array([P_SHORT, 0xff, 0xff, P_VAR, 1, 0]);
    expect(getShort(code, 0, [])).toEqual({ value: -1, pc: 3 });
    expect(getShort(code, 3, [0, 42]).value).toBe(42);
  });

  it("compares and handles flags", () => {
    expect(operBalance(3, 3, OPER_BIGEQ)).toBe(true);
    expect(operBalance(3, 3, OPER_NOEQ)).toBe(false);
    const map = new Uint8Array(4);
    changeFlag(map, 10, 1);
    expect(testFlag(map, 10)).toBe(true);
    changeFlag(map, 10, 2);
    expect(testFlag(map, 10)).toBe(false);
  });
});
