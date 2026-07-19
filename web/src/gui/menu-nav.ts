import { hotspotAt, type HotspotMask } from './hotspot-mask';

export const MENU_ITEMS = ['New Game', 'Load Game', 'Intro', 'Credits', 'Quit'] as const;

export type MenuChoice = 0 | 1 | 2 | 3 | 4;

// game/menu.c's real click region for the button stack (T_CLK_MAP entry
// `{-1,220,300,220+206,300+177,promacknuti,1,-1}`) — deliberately loose;
// the real engine relies on MENUVOL5.PCX's per-pixel mask (see
// hitTestMenu) to reject the dead space inside it, not on a tightened
// rect. An earlier version of this port narrowed y/height by eyeballing
// MAINMENU.PCX's button-label text density, compensating for the mask
// pipeline not existing yet — reverted now that the real mask is wired
// up (see docs/port-graph.md's Phase C entry).
export const MENU_RECT = { x: 220, y: 300, width: 206, height: 177 } as const;

export function clampMenuIndex(index: number): MenuChoice {
  if (index <= 0) return 0;
  if (index >= 4) return 4;
  return index as MenuChoice;
}

export function navigateMenu(current: MenuChoice, direction: -1 | 1): MenuChoice {
  return clampMenuIndex(current + direction);
}

// Mirrors game/menu.c's promacknuti(): looks up MENUVOL5.PCX's raw
// palette index at the click position (relative to MENU_RECT) and
// returns the button it encodes; null for the mask's un-painted
// background (raw index 0) or anywhere outside the mask image itself.
export function hitTestMenu(mask: HotspotMask, x: number, y: number): MenuChoice | null {
  const hit = hotspotAt(mask, MENU_RECT.x, MENU_RECT.y, x, y);
  return hit === null ? null : clampMenuIndex(hit);
}

// Fallback for the (should-never-happen-in-practice) case MENUVOL5.PCX
// fails to load from the archive — an equal 5-way band split, the whole-
// rect approximation this port used before the real mask was wired up.
// Deliberately kept as a graceful degradation, matching this codebase's
// convention of falling back to a plain rendering when an asset is
// missing, rather than breaking menu interaction entirely.
export function hitTestMenuBands(x: number, y: number): MenuChoice | null {
  const { x: rx, y: ry, width, height } = MENU_RECT;
  if (x < rx || x >= rx + width || y < ry || y >= ry + height) return null;
  const bandHeight = height / MENU_ITEMS.length;
  return clampMenuIndex(Math.floor((y - ry) / bandHeight));
}
