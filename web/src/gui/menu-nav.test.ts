import { describe, expect, it } from 'vitest';
import { MENU_ITEMS, MENU_RECT, clampMenuIndex, hitTestMenu, navigateMenu } from './menu-nav';

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
  it('returns null outside the button rect', () => {
    expect(hitTestMenu(0, 0)).toBeNull();
    expect(hitTestMenu(MENU_RECT.x - 1, MENU_RECT.y + 10)).toBeNull();
    expect(hitTestMenu(MENU_RECT.x + 10, MENU_RECT.y + MENU_RECT.height)).toBeNull();
  });

  it('maps each of the 5 equal bands to New Game..Quit top to bottom', () => {
    const bandHeight = MENU_RECT.height / MENU_ITEMS.length;
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const y = MENU_RECT.y + i * bandHeight + bandHeight / 2;
      expect(hitTestMenu(MENU_RECT.x + 10, y)).toBe(i);
    }
  });
});
