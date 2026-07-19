import { describe, expect, it } from 'vitest';
import { MENU_ITEMS, MENU_RECT, clampMenuIndex, hitTestMenu, navigateMenu } from './menu-nav';
import type { HotspotMask } from './hotspot-mask';

// A synthetic mask the size of the real click region, split into 5 equal
// bands (raw index 1..5, top to bottom) — stands in for MENUVOL5.PCX's
// real hand-painted (non-rectangular) shapes, which this test doesn't
// need to reproduce to verify the wiring is correct.
function fiveBandMask(): HotspotMask {
  const { width, height } = MENU_RECT;
  const indices = new Uint8Array(width * height);
  const bandHeight = height / MENU_ITEMS.length;
  for (let y = 0; y < height; y++) {
    const band = Math.floor(y / bandHeight);
    for (let x = 0; x < width; x++) indices[y * width + x] = band + 1;
  }
  return { width, height, indices };
}

describe('clampMenuIndex', () => {
  it('clamps to the 0..4 range', () => {
    expect(clampMenuIndex(-3)).toBe(0);
    expect(clampMenuIndex(0)).toBe(0);
    expect(clampMenuIndex(4)).toBe(4);
    expect(clampMenuIndex(9)).toBe(4);
  });
});

describe('navigateMenu', () => {
  it('moves within bounds and stops at the edges', () => {
    expect(navigateMenu(0, -1)).toBe(0);
    expect(navigateMenu(0, 1)).toBe(1);
    expect(navigateMenu(4, 1)).toBe(4);
    expect(navigateMenu(4, -1)).toBe(3);
  });
});

describe('hitTestMenu', () => {
  it('returns null outside the mask bounds', () => {
    const mask = fiveBandMask();
    expect(hitTestMenu(mask, 0, 0)).toBeNull();
    expect(hitTestMenu(mask, MENU_RECT.x - 1, MENU_RECT.y + 10)).toBeNull();
    expect(hitTestMenu(mask, MENU_RECT.x + 10, MENU_RECT.y + MENU_RECT.height)).toBeNull();
  });

  it('maps each mask band to New Game..Quit top to bottom', () => {
    const mask = fiveBandMask();
    const bandHeight = MENU_RECT.height / MENU_ITEMS.length;
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const y = MENU_RECT.y + Math.floor(i * bandHeight + bandHeight / 2);
      expect(hitTestMenu(mask, MENU_RECT.x + 10, y)).toBe(i);
    }
  });

  it('returns null for a raw index of 0 (un-painted background) even inside the outer rect', () => {
    const { width, height } = MENU_RECT;
    const blank: HotspotMask = { width, height, indices: new Uint8Array(width * height) };
    expect(hitTestMenu(blank, MENU_RECT.x + 10, MENU_RECT.y + 10)).toBeNull();
  });
});
