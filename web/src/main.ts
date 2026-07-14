import { createScreenCanvas } from './platform/canvas-context';
import { pickDDLFile } from './platform/asset-source';
import { runMainMenu, type MainMenuAssets } from './game/main-menu';
import { runCharacterCreation, type CharacterCreationAssets } from './game/character-creation';
import { runDungeonView, type DungeonTextureSet } from './game/dungeon-view';
import type { Direction } from './game/dungeon';
import { MENU_ITEMS } from './gui/menu-nav';
import { openDDLArchive, type DDLArchive } from './formats/ddl-archive';
import { parseMapFile, type DungeonMap } from './formats/map-file';
import { decodePcx, pcxToImageData } from './codecs/pcx';

const START_MAP = 'LESPRED.MAP'; // skeldal.c: default_map, the real new-game starting map

function getAppRoot(): HTMLElement {
  const el = document.getElementById('app');
  if (!el) throw new Error('#app root missing');
  return el;
}

const app = getAppRoot();

// Dev convenience: vite.config.ts serves the developer's own local
// data/SKELDAL.DDL at this path (dev server only, never in a production
// build). Falls back to the manual file picker when it's not there.
async function tryAutoLoadDDL(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/dev-data/SKELDAL.DDL');
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// Same dev-only convenience for the starting map — .MAP files live loose
// under data/maps/, not inside SKELDAL.DDL. No production fallback yet (the
// real OPFS-backed intake in #2 will cover maps too); if this 404s we just
// don't offer to enter the dungeon.
async function tryAutoLoadMap(name: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`/dev-data/maps/${name}`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

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

async function getArchive(): Promise<DDLArchive> {
  const auto = await tryAutoLoadDDL();
  if (auto) return openDDLArchive(auto);

  await showLoadPrompt();
  const file = await pickDDLFile();
  return openDDLArchive(await file.arrayBuffer());
}

function decodeIfPresent(archive: DDLArchive, name: string): ImageData | undefined {
  const raw = archive.extract(name);
  return raw ? pcxToImageData(decodePcx(raw)) : undefined;
}

function loadMenuAssets(archive: DDLArchive): MainMenuAssets {
  const assets: MainMenuAssets = {};
  const background = decodeIfPresent(archive, 'MAINMENU.PCX');
  if (background) assets.background = background;
  const logoImage = decodeIfPresent(archive, 'LOGO00.PCX');
  if (logoImage) assets.logo = { image: logoImage, y: 56 };
  return assets;
}

function loadCharacterCreationAssets(archive: DDLArchive): CharacterCreationAssets {
  const assets: CharacterCreationAssets = {};
  const topbar = decodeIfPresent(archive, 'TOPBAR_P.PCX');
  if (topbar) assets.topbar = topbar;
  const deskPanel = decodeIfPresent(archive, 'POSTAVY.PCX');
  if (deskPanel) assets.deskPanel = deskPanel;
  const pearl = decodeIfPresent(archive, 'PERLA.PCX');
  if (pearl) assets.pearl = pearl;
  const arch = decodeIfPresent(archive, 'IOBLOUK.PCX');
  if (arch) assets.arch = arch;

  const bodySprites = new Map<number, ImageData>();
  for (let i = 0; i < 8; i++) {
    const name = `CHAR${i.toString(16).padStart(2, '0').toUpperCase()}.PCX`;
    const raw = archive.extract(name);
    if (raw) bodySprites.set(i, pcxToImageData(decodePcx(raw, { transparentIndex: 0 })));
  }
  if (bodySprites.size > 0) assets.bodySprites = bodySprites;

  return assets;
}

// TSECTOR.floor/ceil and TSTENA.prim are 1-based indices into the map's own
// embedded filename list (realgame.c: prepare_graphics); 0 means "none".
function loadTextureSet(archive: DDLArchive, names: readonly string[]): ReadonlyMap<number, ImageData> {
  const textures = new Map<number, ImageData>();
  names.forEach((name, i) => {
    const raw = archive.extract(name);
    if (raw) textures.set(i + 1, pcxToImageData(decodePcx(raw)));
  });
  return textures;
}

function loadDungeonTextures(archive: DDLArchive, map: DungeonMap): DungeonTextureSet {
  return {
    main: loadTextureSet(archive, map.mainTextures),
    left: loadTextureSet(archive, map.leftTextures),
    right: loadTextureSet(archive, map.rightTextures),
    floor: loadTextureSet(archive, map.floorTextures),
    ceil: loadTextureSet(archive, map.ceilTextures),
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

async function enterDungeon(ctx: CanvasRenderingContext2D, archive: DDLArchive): Promise<boolean> {
  const mapBuffer = await tryAutoLoadMap(START_MAP);
  if (!mapBuffer) return false;

  const map = parseMapFile(mapBuffer);
  const textures = loadDungeonTextures(archive, map);
  runDungeonView(
    ctx,
    { map, sector: map.startSector, direction: map.startDirection as Direction },
    textures,
  );
  return true;
}

async function boot(): Promise<void> {
  const archive = await getArchive();
  const menuAssets = loadMenuAssets(archive);
  const chargenAssets = loadCharacterCreationAssets(archive);
  const ctx = createScreenCanvas(app);

  for (;;) {
    const { choice } = runMainMenu(ctx, menuAssets);
    const selected = await choice;

    if (selected === 0) {
      const { result } = runCharacterCreation(ctx, chargenAssets);
      const party = await result;
      if (party) {
        if (await enterDungeon(ctx, archive)) return; // dungeon view has no exit yet
        const names = party.map((member) => member.name).join(', ');
        showPlaceholder(ctx, `Party created: ${names} — dungeon map unavailable`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      continue;
    }

    showPlaceholder(ctx, `${MENU_ITEMS[selected]} — not implemented yet`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

void boot();
