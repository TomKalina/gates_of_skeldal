import { createScreenCanvas } from './platform/canvas-context';
import { runMainMenu } from './game/main-menu';
import { MENU_ITEMS } from './gui/menu-nav';

const app = document.getElementById('app');
if (!app) throw new Error('#app root missing');

const ctx = createScreenCanvas(app);

function showPlaceholder(message: string): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#ccc';
  ctx.font = '20px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 40, ctx.canvas.height / 2);
}

async function boot(): Promise<void> {
  for (;;) {
    const { choice } = runMainMenu(ctx);
    const selected = await choice;
    showPlaceholder(`${MENU_ITEMS[selected]} — not implemented yet`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

void boot();
