import { describe, expect, it } from 'vitest';
import { hotspotAt, type HotspotMask } from './hotspot-mask';

// A tiny synthetic 3-wide x 2-tall mask: row0 = [0,1,1], row1 = [2,2,0] —
// mirrors the real assets' shape (0 = no hotspot, N = hotspot N-1).
function mask(): HotspotMask {
  return { width: 3, height: 2, indices: new Uint8Array([0, 1, 1, 2, 2, 0]) };
}

describe('hotspotAt', () => {
  it('returns the 0-based hotspot id for a non-zero raw index', () => {
    expect(hotspotAt(mask(), 100, 200, 101, 200)).toBe(0); // raw index 1 -> hotspot 0
    expect(hotspotAt(mask(), 100, 200, 100, 201)).toBe(1); // raw index 2 -> hotspot 1
  });

  it('returns null for raw index 0 (no hotspot painted there)', () => {
    expect(hotspotAt(mask(), 100, 200, 100, 200)).toBeNull();
    expect(hotspotAt(mask(), 100, 200, 102, 201)).toBeNull();
  });

  it('returns null outside the mask bounds, even inside a loose outer rect', () => {
    // The real T_CLK_MAP rects are deliberately larger than the mask
    // image itself in places — anything past the mask's own width/height
    // must reject, not wrap or throw.
    expect(hotspotAt(mask(), 100, 200, 99, 200)).toBeNull(); // left of region
    expect(hotspotAt(mask(), 100, 200, 103, 200)).toBeNull(); // past mask width
    expect(hotspotAt(mask(), 100, 200, 100, 202)).toBeNull(); // past mask height
  });

  it('is relative to the region origin, not absolute screen coordinates', () => {
    const m = mask();
    expect(hotspotAt(m, 220, 300, 221, 300)).toBe(0);
    expect(hotspotAt(m, 0, 0, 1, 0)).toBe(0);
  });
});
