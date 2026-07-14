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

  it('zeroes alpha for the given transparentIndex, leaving other pixels opaque', () => {
    const image = decodePcx(buildPcx(), { transparentIndex: 1 });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];

    expect(alpha(0, 0)).toBe(0);
    expect(alpha(1, 0)).toBe(0);
    expect(alpha(0, 1)).toBe(255);
    expect(alpha(1, 1)).toBe(255);
  });

  it('"corner" mode treats the top-left pixel index as transparent when it dominates the image', () => {
    // buildPcx's corner index (1) covers half the 2x2 image — well past the
    // dominance threshold.
    const image = decodePcx(buildPcx(), { transparentIndex: 'corner' });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];

    expect(alpha(0, 0)).toBe(0);
    expect(alpha(1, 0)).toBe(0);
    expect(alpha(0, 1)).toBe(255);
  });

  it('"corner" mode leaves the image untouched when the corner index is not dominant', () => {
    // A 4x4 image where the corner pixel (index 1) appears only once —
    // should NOT be treated as a colorkey background (avoids punching holes
    // in full-bleed art whose corner happens to land on real content).
    const header = new Uint8Array(128);
    const view = new DataView(header.buffer);
    view.setUint16(8, 3, true); // xmax -> width 4
    view.setUint16(10, 3, true); // ymax -> height 4
    header[3] = 8;
    view.setUint16(66, 4, true); // bytesPerLine

    // 4 rows x 4 literal bytes; only position (0,0) is index 1, rest are index 2.
    const data = new Uint8Array([1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    const palette = new Uint8Array(768);
    palette.set([10, 20, 30], 1 * 3);
    palette.set([40, 50, 60], 2 * 3);
    const pcx = new Uint8Array([...header, ...data, ...palette]);

    const image = decodePcx(pcx, { transparentIndex: 'corner' });
    const alpha = (x: number, y: number) => image.rgba[(y * image.width + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(255);
    expect(alpha(1, 0)).toBe(255);
  });
});
