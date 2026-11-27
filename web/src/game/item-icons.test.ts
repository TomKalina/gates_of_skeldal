import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeIcon, ICON_BYTES, iconLibName } from './item-icons';

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

describe('item icons', () => {
  const original = (globalThis as { ImageData?: unknown }).ImageData;
  beforeAll(() => {
    (globalThis as { ImageData?: unknown }).ImageData = FakeImageData;
  });
  afterAll(() => {
    (globalThis as { ImageData?: unknown }).ImageData = original;
  });

  it('maps an icon number to its 18-icon IKONY library', () => {
    expect(iconLibName(0)).toBe('IKONY00.LIB');
    expect(iconLibName(17)).toBe('IKONY00.LIB');
    expect(iconLibName(18)).toBe('IKONY01.LIB');
  });

  it('decodes the icon at its slot with index 0 transparent and a RGB555 palette', () => {
    const lib = new Uint8Array(ICON_BYTES * 2);
    const view = new DataView(lib.buffer);
    const base = ICON_BYTES;
    view.setUint16(base, 45, true);
    view.setUint16(base + 2, 55, true);
    view.setUint16(base + 6 + 2 * 3, (31 << 10) | (16 << 5) | 1, true);
    lib[base + 518] = 0;
    lib[base + 519] = 3;
    const icon = decodeIcon(lib, 19)!;
    expect(icon.width).toBe(45);
    expect(icon.height).toBe(55);
    expect(Array.from(icon.data.slice(0, 8))).toEqual([0, 0, 0, 0, 255, 132, 8, 255]);
  });
});
