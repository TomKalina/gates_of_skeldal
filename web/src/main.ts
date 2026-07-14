import { createScreenCanvas } from './platform/canvas-context';
import { pickDDLFile } from './platform/asset-source';
import { runMainMenu, type MainMenuAssets } from './game/main-menu';
import { MENU_ITEMS } from './gui/menu-nav';
import { openDDLArchive } from './formats/ddl-archive';
import { decodePcx, pcxToImageData } from './codecs/pcx';

function getAppRoot(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) throw new Error('#app root missing');
  return el;
}

const app = getAppRoot();

function showLoadPrompt(): Promise<void> {
  return new Promise((resolve) => {
    app.replaceChildren();
    const button = document.createElement('button');
    button.textContent = 'Load SKELDAL.DDL…';
    button.addEventListener(
      'click',
      () => {
        resolve();
      },
      { once: true },
    );
    app.appendChild(button);
  });
}

async function loadMenuAssets(): Promise<MainMenuAssets> {
  await showLoadPrompt();
  const file = await pickDDLFile();
  const archive = openDDLArchive(await file.arrayBuffer());

  const backgroundRaw = archive.extract('MAINMENU.PCX');
  const logoRaw = archive.extract('LOGO00.PCX');
  return {
    ...(backgroundRaw ? { background: pcxToImageData(decodePcx(backgroundRaw)) } : {}),
    ...(logoRaw ? { logo: { image: pcxToImageData(decodePcx(logoRaw)), y: 56 } } : {}),
  };
}

function showPlaceholder(ctx: CanvasRenderingContext2D, message: string): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#ccc';
  ctx.font = '20px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 40, ctx.canvas.height / 2);
}

async function boot(): Promise<void> {
  const assets = await loadMenuAssets();
  const ctx = createScreenCanvas(app);

  for (;;) {
    const { choice } = runMainMenu(ctx, assets);
    const selected = await choice;
    showPlaceholder(ctx, `${MENU_ITEMS[selected]} — not implemented yet`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

void boot();
