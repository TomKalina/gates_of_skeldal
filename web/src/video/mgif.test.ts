import { describe, expect, it } from "vitest";
import { MGIF_COPY, MGIF_HEADER_SIZE, MGIF_PAL, parseMgif } from "./mgif";

function build(): Uint8Array {
  const hdr = new Uint8Array(MGIF_HEADER_SIZE);
  hdr.set([77, 71, 73, 70, 57, 55, 26], 0);
  const dv = new DataView(hdr.buffer);
  dv.setUint16(7, 0x100, true);
  dv.setInt32(9, 2, true);
  dv.setUint16(13, 1, true);
  dv.setInt32(15, 22050, true);
  dv.setInt16(19 + 2, -5, true);
  const f1 = [2, 10, 0, 0, MGIF_PAL, 2, 0, 0, 9, 8, MGIF_COPY, 0, 0, 0];
  const f2 = [1, 5, 0, 0, MGIF_COPY, 1, 0, 0, 7];
  const out = new Uint8Array(hdr.length + f1.length + f2.length);
  out.set(hdr, 0);
  out.set(f1, hdr.length);
  out.set(f2, hdr.length + f1.length);
  return out;
}

describe("parseMgif", () => {
  it("parses header and frame chunks", () => {
    const m = parseMgif(build());
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.header.year).toBe("97");
    expect(m.header.ver).toBe(0x100);
    expect(m.header.frames).toBe(2);
    expect(m.header.sndFreq).toBe(22050);
    expect(m.header.amplTable[1]).toBe(-5);
    expect(m.frames).toHaveLength(2);
    expect(m.frames[0]?.map((c) => c.type)).toEqual([MGIF_PAL, MGIF_COPY]);
    expect(Array.from(m.frames[0]?.[0]?.data ?? [])).toEqual([9, 8]);
    expect(Array.from(m.frames[1]?.[0]?.data ?? [])).toEqual([7]);
  });

  it("rejects bad signature", () => {
    const b = build();
    b[0] = 0;
    expect(parseMgif(b)).toBeNull();
  });
});
