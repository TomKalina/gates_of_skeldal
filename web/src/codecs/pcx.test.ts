import { describe, expect, it } from 'vitest';
import { decodePcx } from './pcx';

// Builds a synthetic 2x2 PCX buffer (real header layout, hand-rolled RLE data
// and palette) — no copyrighted game assets involved.
function buildPcx(): Uint8Array {
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);
  view.setUint16(4, 0, true); // xmin
  view.setUint16(6, 0, true); // ymin
  view.setUint16(8, 1, true); // xmax -> width 2
  view.setUint16(10, 1, true); // ymax -> height 2
  header[3] = 8; // bitperpixel
  view.setUint16(66, 2, true); // bytesPerLine

  // row0: RLE run of 2 pixels, palette index 1
  // row1: two literal bytes, palette indices 2 and 3
  const data = new Uint8Array([0xc2, 0x01, 0x02, 0x03]);

  const palette = new Uint8Array(768);
  palette.set([10, 20, 30], 1 * 3);
  palette.set([40, 50, 60], 2 * 3);
  palette.set([70, 80, 90], 3 * 3);

  return new Uint8Array([...header, ...data, ...palette]);
}

describe('decodePcx', () => {
  it('decodes RLE runs and literal bytes through the palette', () => {
    const image = decodePcx(buildPcx());
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);

    const pixel = (x: number, y: number) => {
      const o = (y * image.width + x) * 4;
      return [image.rgba[o], image.rgba[o + 1], image.rgba[o + 2], image.rgba[o + 3]];
    };

    expect(pixel(0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixel(1, 0)).toEqual([10, 20, 30, 255]);
    expect(pixel(0, 1)).toEqual([40, 50, 60, 255]);
    expect(pixel(1, 1)).toEqual([70, 80, 90, 255]);
  });

  it('exposes the raw per-pixel palette index alongside rgba, regardless of transparentIndex', () => {
    // "Hotspot mask" assets (MENUVOL5.PCX, CHARGENM.PCX) reserve this raw
    // byte as a button-ID lookup, not real pixel color — see
    // gui/hotspot-mask.ts. Decoded with no transparentIndex here to prove
    // the index array doesn't depend on that option at all.
    const image = decodePcx(buildPcx());
    expect([...image.indices]).toEqual([1, 1, 2, 3]);
  });

  it('zeroes alpha for the given transparentIndex, leaving other pixels opaque', () => {
    const image = decodePcx(buildPcx(), { transparentIndex: 1 });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];

    expect(alpha(0, 0)).toBe(0);
    expect(alpha(1, 0)).toBe(0);
    expect(alpha(0, 1)).toBe(255);
    expect(alpha(1, 1)).toBe(255);
  });

  it('zeroes alpha for every index in an array of transparentIndex values', () => {
    // Niche prop textures (e.g. LES1A23A.PCX, a table) reserve two separate
    // colorkey indices at once — one is the usual wall/decoration colorkey,
    // the other is a distinct, separately-painted background color.
    const image = decodePcx(buildPcx(), { transparentIndex: [1, 2] });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];

    expect(alpha(0, 0)).toBe(0); // index 1
    expect(alpha(1, 0)).toBe(0); // index 1
    expect(alpha(0, 1)).toBe(0); // index 2
    expect(alpha(1, 1)).toBe(255); // index 3, untouched
  });

  it('leaves every pixel opaque when transparentIndex is not present in the image', () => {
    // The whole point of always passing a fixed transparentIndex for a known
    // asset category: if this particular image doesn't use that index, no
    // pixel matches it, so nothing gets punched out.
    const image = decodePcx(buildPcx(), { transparentIndex: 99 });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(0, 1)).toBe(255);
    expect(alpha(1, 1)).toBe(255);
  });
});
