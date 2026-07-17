export const MENU_ITEMS = ['New Game', 'Load Game', 'Intro', 'Credits', 'Quit'] as const;

export type MenuChoice = 0 | 1 | 2 | 3 | 4;

// Screen-space rect of the button stack. Y/height corrected by measuring
// MAINMENU.PCX directly (scanning for the button-label text color's row
// density): the 5 items' text-row centers are evenly spaced ~30px apart
// starting around y=317, not the originally-guessed y=300/height=177 —
// the old rect's highlight box rendered visibly above and outside the
// real "NOVÁ HRA" text. X/width unchanged (no clean evidence they're off;
// a text-color scan in that row range picks up the title logo art above
// the buttons too, so it isn't a reliable horizontal measurement here).
// Sub-region hit-testing still reads a per-pixel mask (MENUVOL5.PCX) in
// the original; until that asset pipeline lands (#5/#8) we split the rect
// into 5 equal bands top-to-bottom.
export const MENU_RECT = { x: 220, y: 317, width: 206, height: 151 } as const;

export function clampMenuIndex(index: number): MenuChoice {
  if (index <= 0) return 0;
  if (index >= 4) return 4;
  return index as MenuChoice;
}

export function navigateMenu(current: MenuChoice, direction: -1 | 1): MenuChoice {
  return clampMenuIndex(current + direction);
}

export function hitTestMenu(x: number, y: number): MenuChoice | null {
  const { x: rx, y: ry, width, height } = MENU_RECT;
  if (x < rx || x >= rx + width || y < ry || y >= ry + height) return null;
  const bandHeight = height / MENU_ITEMS.length;
  return clampMenuIndex(Math.floor((y - ry) / bandHeight));
}
