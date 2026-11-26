import { BUTTON_FRAME_MS, MENU_ITEMS, MENU_RECT, hitTestMenu, hitTestMenuBands, navigateMenu, stepButtonFrames, type MenuChoice } from '../gui/menu-nav';
import type { HotspotMask } from '../gui/hotspot-mask';
import { clientToCanvasPoint } from '../platform/canvas-transform';

export interface MainMenuAssets {
  background?: ImageData;
  logo?: { image: ImageData; y: number };
  // MENUVOL5.PCX's raw palette-index data (see gui/hotspot-mask.ts) — the
  // real per-pixel button hit-test. Falls back to hitTestMenuBands' equal-
  // band approximation if this fails to load.
  hotspotMask?: HotspotMask;
  buttonFrames?: readonly ImageData[];
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
  const framePos = [0, 0, 0, 0, 0];
  const selecting = [false, false, false, false, false];
  let picked: MenuChoice | null = null;
  let resolveChoice!: (choice: MenuChoice) => void;
  const choice = new Promise<MenuChoice>((resolve) => {
    resolveChoice = resolve;
  });

  function selectedIndex(): MenuChoice | null {
    const i = selecting.indexOf(true);
    return i === -1 ? null : (i as MenuChoice);
  }

  function select(index: MenuChoice | null): void {
    selecting.fill(false);
    if (index !== null) selecting[index] = true;
    if (!assets.background) draw();
  }

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

  function drawButtons(): void {
    const frames = assets.buttonFrames;
    const mask = assets.hotspotMask;
    if (!frames || !mask || frames.length < 5) return;
    const width = Math.min(mask.width, frames[0]!.width);
    const height = Math.min(mask.height, frames[0]!.height);
    const out = ctx.getImageData(MENU_RECT.x, MENU_RECT.y, width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const button = mask.indices[y * mask.width + x]!;
        if (button === 0 || button > 5) continue;
        const frame = frames[framePos[button - 1]!]!;
        const src = (y * frame.width + x) * 4;
        const dst = (y * width + x) * 4;
        out.data[dst] = frame.data[src]!;
        out.data[dst + 1] = frame.data[src + 1]!;
        out.data[dst + 2] = frame.data[src + 2]!;
        out.data[dst + 3] = 255;
      }
    }
    ctx.putImageData(out, MENU_RECT.x, MENU_RECT.y);
  }

  function draw(): void {
    drawBackground();
    if (assets.background) {
      drawButtons();
      return;
    }
    const bandHeight = MENU_RECT.height / MENU_ITEMS.length;
    const current = selectedIndex();
    ctx.font = '20px monospace';
    ctx.textBaseline = 'middle';
    MENU_ITEMS.forEach((label, i) => {
      const y = MENU_RECT.y + i * bandHeight + bandHeight / 2;
      ctx.fillStyle = i === current ? '#ffe38c' : '#8899aa';
      ctx.fillText(label, MENU_RECT.x, y);
    });
  }

  function tick(): void {
    if (stepButtonFrames(framePos, selecting)) drawButtons();
    if (picked !== null && framePos[picked] === 0) {
      const done = picked;
      dispose();
      resolveChoice(done);
    }
  }

  function pick(index: MenuChoice): void {
    if (picked !== null) return;
    detachInput();
    picked = index;
    selecting.fill(false);
    if (!assets.background || !assets.buttonFrames) {
      dispose();
      resolveChoice(index);
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    const current = selectedIndex();
    switch (e.code) {
      case 'ArrowUp':
        select(current === null ? 0 : navigateMenu(current, -1));
        break;
      case 'ArrowDown':
        select(current === null ? 0 : navigateMenu(current, 1));
        break;
      case 'Enter':
      case 'Space':
        if (current !== null) pick(current);
        break;
      case 'Escape':
        pick(4);
        break;
    }
  }

  function hitTest(x: number, y: number): MenuChoice | null {
    return assets.hotspotMask ? hitTestMenu(assets.hotspotMask, x, y) : hitTestMenuBands(x, y);
  }

  function insideRegion(x: number, y: number): boolean {
    return x >= MENU_RECT.x && x <= MENU_RECT.x + MENU_RECT.width && y >= MENU_RECT.y && y <= MENU_RECT.y + MENU_RECT.height;
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);
    select(insideRegion(x, y) ? hitTest(x, y) : null);
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);
    const current = selectedIndex();
    if (insideRegion(x, y) && current !== null) pick(current);
  }

  const timer = window.setInterval(tick, BUTTON_FRAME_MS);

  function detachInput(): void {
    window.removeEventListener('keydown', onKeydown);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mouseup', onMouseUp);
  }

  function dispose(): void {
    detachInput();
    window.clearInterval(timer);
  }

  window.addEventListener('keydown', onKeydown);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  draw();

  return { choice, dispose };
}
