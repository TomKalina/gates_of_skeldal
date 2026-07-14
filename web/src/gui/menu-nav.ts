export const MENU_ITEMS = ['New Game', 'Load Game', 'Intro', 'Credits', 'Quit'] as const;

export type MenuChoice = 0 | 1 | 2 | 3 | 4;

// Screen-space rect of the button stack in the original 640x480 layout
// (menu.c clk_main_menu: 220,300 .. 220+206,300+177). Sub-region hit-testing
// there reads a per-pixel mask (MENUVOL5.PCX); until that asset pipeline
// lands (#5/#8) we split the rect into 5 equal bands top-to-bottom.
export const MENU_RECT = { x: 220, y: 300, width: 206, height: 177 } as const;

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
