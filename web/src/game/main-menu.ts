import { MENU_ITEMS, MENU_RECT, hitTestMenu, navigateMenu, type MenuChoice } from '../gui/menu-nav';

export interface MainMenuHandle {
  choice: Promise<MenuChoice>;
  dispose(): void;
}

// TS counterpart of menu.c's enter_menu(): renders the 5-entry title menu and
// resolves once a choice is made (mouse click, Enter/Space, or Escape = Quit,
// mirroring E_QUIT_GAME_KEY in klavesnice()). Background art, animation and
// music (LOGO*.PCX, MAINMENU.PCX, TRACK06.MUS) are not wired up yet — this is
// placeholder rendering pending the asset pipeline (#2/#5/#8/#12).
export function runMainMenu(ctx: CanvasRenderingContext2D): MainMenuHandle {
  const canvas = ctx.canvas;
  let selected: MenuChoice = 0;
  let resolveChoice!: (choice: MenuChoice) => void;
  const choice = new Promise<MenuChoice>((resolve) => {
    resolveChoice = resolve;
  });

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ccc';
    ctx.font = '28px monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Gates of Skeldal', 40, 80);

    const bandHeight = MENU_RECT.height / MENU_ITEMS.length;
    ctx.font = '20px monospace';
    ctx.textBaseline = 'middle';
    MENU_ITEMS.forEach((label, i) => {
      const y = MENU_RECT.y + i * bandHeight + bandHeight / 2;
      ctx.fillStyle = i === selected ? '#ffe38c' : '#8899aa';
      ctx.fillText(label, MENU_RECT.x, y);
    });
  }

  function pick(index: MenuChoice): void {
    selected = index;
    draw();
    dispose();
    resolveChoice(index);
  }

  function toCanvasPoint(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
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

  function onClick(e: MouseEvent): void {
    const { x, y } = toCanvasPoint(e);
    const hit = hitTestMenu(x, y);
    if (hit !== null) pick(hit);
  }

  function onMove(e: MouseEvent): void {
    const { x, y } = toCanvasPoint(e);
    const hit = hitTestMenu(x, y);
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
