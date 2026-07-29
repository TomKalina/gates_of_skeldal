import { MENU_ITEMS, MENU_RECT, hitTestMenu, hitTestMenuBands, navigateMenu, type MenuChoice } from '../gui/menu-nav';
import type { HotspotMask } from '../gui/hotspot-mask';
import { clientToCanvasPoint } from '../platform/canvas-transform';

export interface MainMenuAssets {
  background?: ImageData;
  logo?: { image: ImageData; y: number };
  // MENUVOL5.PCX's raw palette-index data (see gui/hotspot-mask.ts) — the
  // real per-pixel button hit-test. Falls back to hitTestMenuBands' equal-
  // band approximation if this fails to load.
  hotspotMask?: HotspotMask;
}

export interface MainMenuHandle {
  choice: Promise<MenuChoice>;
  dispose(): void;
}

// TS counterpart of menu.c's enter_menu(): renders the 5-entry title menu and
// resolves once a choice is made (mouse click, Enter/Space, or Escape = Quit,
// mirroring E_QUIT_GAME_KEY in klavesnice()). When real MAINMENU.PCX/LOGO00.PCX
// art is supplied it's drawn as-is (the button labels are baked into the art);
// otherwise falls back to a plain text menu. Button hit-testing uses the real
// per-pixel MENUVOL5.PCX mask (see gui/hotspot-mask.ts), falling back to an
// equal 5-way band split only if that asset fails to load.
export function runMainMenu(ctx: CanvasRenderingContext2D, assets: MainMenuAssets = {}): MainMenuHandle {
  const canvas = ctx.canvas;
  let selected: MenuChoice = 0;
  let resolveChoice!: (choice: MenuChoice) => void;
  const choice = new Promise<MenuChoice>((resolve) => {
    resolveChoice = resolve;
  });

  function drawBackground(): void {
    if (assets.background) {
      ctx.putImageData(assets.background, 0, 0);
      if (assets.logo) ctx.putImageData(assets.logo.image, 0, assets.logo.y);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ccc';
      ctx.font = '28px monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Gates of Skeldal', 40, 80);
    }
  }

  function draw(): void {
    drawBackground();

    const bandHeight = MENU_RECT.height / MENU_ITEMS.length;
    if (!assets.background) {
      ctx.font = '20px monospace';
      ctx.textBaseline = 'middle';
      MENU_ITEMS.forEach((label, i) => {
        const y = MENU_RECT.y + i * bandHeight + bandHeight / 2;
        ctx.fillStyle = i === selected ? '#ffe38c' : '#8899aa';
        ctx.fillText(label, MENU_RECT.x, y);
      });
    } else {
      // Real art already renders the labels; just outline the highlighted band.
      const y = MENU_RECT.y + selected * bandHeight;
      ctx.strokeStyle = '#ffe38c';
      ctx.lineWidth = 2;
      ctx.strokeRect(MENU_RECT.x + 1, y + 1, MENU_RECT.width - 2, bandHeight - 2);
    }
  }

  function pick(index: MenuChoice): void {
    selected = index;
    draw();
    dispose();
    resolveChoice(index);
  }

  function onKeydown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowUp':
        selected = navigateMenu(selected, -1);
        draw();
        break;
      case 'ArrowDown':
        selected = navigateMenu(selected, 1);
        draw();
        break;
      case 'Enter':
      case 'Space':
        pick(selected);
        break;
      case 'Escape':
        pick(4);
        break;
    }
  }

  function hitTest(x: number, y: number): MenuChoice | null {
    return assets.hotspotMask ? hitTestMenu(assets.hotspotMask, x, y) : hitTestMenuBands(x, y);
  }

  function onClick(e: MouseEvent): void {
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit !== null) pick(hit);
  }

  function onMove(e: MouseEvent): void {
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit !== null && hit !== selected) {
      selected = hit;
      draw();
    }
  }

  function dispose(): void {
    window.removeEventListener('keydown', onKeydown);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('mousemove', onMove);
  }

  window.addEventListener('keydown', onKeydown);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);
  draw();

  return { choice, dispose };
}
