import { createScreenCanvas } from './platform/canvas-context';
import { pickDDLFile } from './platform/asset-source';
import { runMainMenu, type MainMenuAssets } from './game/main-menu';
import { runCharacterCreation, type CharacterCreationAssets } from './game/character-creation';
import { runDungeonView, type DungeonChromeAssets, type DungeonTextureSet } from './game/dungeon-view';
import type { Direction } from './game/dungeon';
import type { Character } from './game/party';
import { MENU_ITEMS } from './gui/menu-nav';
import { openDDLArchive, type DDLArchive } from './formats/ddl-archive';
import { A_OPEN_CLOSE, parseMapFile, SD_HAS_NICHE, type DungeonMap } from './formats/map-file';
import { decodePcx, flipImageDataHorizontally, flipImageDataVertically, pcxToImageData } from './codecs/pcx';
import { readSave } from './game/save';

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

function decodeIfPresent(archive: DDLArchive, name: string, transparentIndex?: number): ImageData | undefined {
  const raw = archive.extract(name);
  return raw ? pcxToImageData(decodePcx(raw, transparentIndex !== undefined ? { transparentIndex } : {})) : undefined;
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
  // Small sprite-style asset (17x17), same colorkey convention as CHAR*.PCX
  // body sprites — verified by pixel-count survey: index 0 is 29% of the
  // image (a pure red painted into that slot, not the blue CHAR sprites use,
  // but the reserved index is the same).
  const pearl = decodeIfPresent(archive, 'PERLA.PCX', 0);
  if (pearl) assets.pearl = pearl;
  const arch = decodeIfPresent(archive, 'IOBLOUK.PCX');
  if (arch) assets.arch = arch;
  const svitek = decodeIfPresent(archive, 'SVITEK.PCX');
  if (svitek) assets.svitek = svitek;

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
// Some slots in that list point at EMPTY.PCX — a 10x10 solid-white sentinel
// image, not real art — meaning "this side has no texture" (e.g. a
// decoration wall with nothing on its flank). It must be skipped here so
// affected sides fall through to "no texture" rendering instead of a
// stretched white rectangle.
const EMPTY_TEXTURE_NAME = 'EMPTY.PCX';

// A subset of wall/door/decoration PCX assets are authored stored top-to-
// bottom flipped relative to the rest — no map-data flag (oblouk/
// SD_HAS_NICHE), PCX header field, or filename pattern predicts which ones;
// confirmed per-file only by decoding each candidate and visually judging
// raw vs. flipped against physical plausibility (door hinges/handles/
// thresholds, roof-over-wall, canopy-over-roots, archway-curves-up-not-
// down). This replaces an earlier, narrower hypothesis that tied the flip
// to SD_HAS_NICHE (a real map-data bit, but only coincidentally correlated
// — see git history — most of these entries have no niche flag at all,
// and one flagged side, the animated table/candle LES1A21-24A, needed the
// flip anyway). Verified across every non-floor/ceiling texture LESPRED.MAP
// uses (main + left/right banks) via a systematic raw-vs-flipped visual
// survey; a handful of near-symmetric tileable wood-plank textures were
// genuinely ambiguous either way and left unflipped since it makes no
// visible difference. Known-incomplete for other maps — revisit alongside
// the double-colorkey index list (below) once D3 makes them reachable.
//
// Correction (2026-07-19): LES1A03-06* were removed after a user report
// that the sector-15 door (this map's other A_OPEN_CLOSE door, sec=7,
// spanning LES1A01A..08A across its 8-frame swing) looked wrong specifically
// mid-swing. The survey had decoded every candidate with only the single
// wall/decoration colorkey (index 1) — correct for most files, but this
// door's frames also need the SECOND index (0) that
// doubleColorkeyMainTextureIndices already applies for every A_OPEN_CLOSE
// frame at actual render time. Un-punched, that second index left a bright
// red sliver across the top of frames 03A-06A in the survey dump, which
// both a reviewing agent and a first-pass manual check misread as "this
// image is upside down" rather than "this image has an unrelated colorkey
// bug in this dump." Re-decoding with the real double-key applied shows
// all 8 frames (01A-08A) already read as one coherent, consistently-
// oriented door swing (hinges/handle at a fixed natural height, threshold
// always at the bottom) — no flip needed anywhere in this sequence. The
// other door (sec=15, LES1A11A..18A) was re-checked the same way and holds
// up as never needing a flip either. Lesson: any texture covered by
// doubleColorkeyMainTextureIndices (niche or door frames) must be
// re-decoded with that same double-key before judging its orientation —
// a single-key survey dump of one of these can look "wrong" for reasons
// that have nothing to do with orientation.
const VERTICALLY_FLIPPED_TEXTURES = new Set(
  [
    'LES1A21A', 'LES1A22A', 'LES1A23A', 'LES1A24A',
    'LES1W03A',
    'LES1W15A', 'LES1W15B',
    'LES1W16A', 'LES1W16B',
    'LES1W18A', 'LES1W18B',
    'LES1W19A', 'LES1W19B',
    'PRECW07A', 'PRECW07B',
  ].map((name) => `${name}.PCX`),
);

function loadTextureSet(
  archive: DDLArchive,
  names: readonly string[],
  transparentIndex?: number | number[],
  doubleKeyIndices?: ReadonlySet<number>,
): ReadonlyMap<number, ImageData> {
  const textures = new Map<number, ImageData>();
  names.forEach((name, i) => {
    if (name.toUpperCase() === EMPTY_TEXTURE_NAME) return;
    const raw = archive.extract(name);
    if (!raw) return;
    const key = i + 1;
    const options =
      typeof transparentIndex === 'number' && doubleKeyIndices?.has(key)
        ? { transparentIndex: [0, transparentIndex] }
        : transparentIndex !== undefined
          ? { transparentIndex }
          : {};
    let image = pcxToImageData(decodePcx(raw, options));
    if (VERTICALLY_FLIPPED_TEXTURES.has(name.toUpperCase())) image = flipImageDataVertically(image);
    textures.set(key, image);
  });
  return textures;
}

// Wall/decoration textures (main + side sets) reserve palette index 1 as a
// colorkey background — verified across 102 real textures in LESPRED.MAP:
// index 1's share is either exactly 0% (unused, full-bleed art) or >11%
// (clearly the reserved background), never in between. Floor/ceiling strips
// don't use this convention (confirmed full-bleed).
const WALL_TRANSPARENT_INDEX = 1;

// The left/right ("B"/"C") side-wall texture set additionally reserves index
// 0 as a second, always-on background matte — unlike the main bank (where
// a second index is only reserved for specific niche/door textures, see
// below), every side-wall asset checked reserves it, at whatever share it
// happens to need (0% up to ~10%): confirmed solid-color matte via direct
// decode on the forest scene's LES1W01B/C.PCX and LES1W02B/C.PCX (the
// "trees are upside down" report turned out to be this: the raw art is
// correctly oriented, but index 0's un-punched red bled through in gaps
// between trunks) and, independently, on an indoor door's side view
// (LES1A05B.PCX, LES1A01B.PCX) showing the same matte behind the door gap.
// Low-single-digit shares (e.g. LES1A11C.PCX at 0.1%) show no visible red
// at all once punched, so applying this unconditionally across the whole
// bank is safe.
const SIDE_WALL_TRANSPARENT_INDICES = [0, WALL_TRANSPARENT_INDEX];

// A niche-flagged side's own front-wall texture (see
// VERTICALLY_FLIPPED_TEXTURES above for its orientation fix) reserves a
// *second* colorkey index (0) on top of the
// usual wall/decoration one (1) — verified against LES1A23A.PCX, where
// index 0 is a separately-painted red "background" covering 27% of the
// image, distinct from index 1's colorkey. A door's frame sequence needs
// the same treatment — verified against LES1A17A.PCX (the sector 14/15
// door's fully-open frame): its doorway opening is index 0 too, 20% of the
// image, alongside the usual index-1 colorkey around the frame
// (LES1A11A.PCX, the closed frame, only uses index 1 — there's no opening
// to punch out yet). Since the door now animates through every
// intermediate frame (game/animation.ts, Phase A3), every frame in its
// sequence (secAnim's low nibble = frame count) gets the double key, not
// just the two ends. Only the main-texture set needs this: both niches and
// doors only ever render through draw_basic_sector's front-facing branch
// (dirs[1]), never as a left/right side wall.
//
// The niche branch originally only added `prim + (primAnim >> 4)` — the
// single frame that happened to be current at map-load time — instead of
// every frame in the cycle. The start room's table has a genuinely
// animated candle (SD_PRIM_ANIM, 4 frames), so only 1 of its 4 textures
// ever got the second colorkey; the other 3 flashed their un-punched red
// background on screen as the animation cycled through them — this was
// the "occasional red flicker near the candle" report. Fixed by covering
// the whole frame range (primAnim's low nibble = frame count), same as
// the door branch already did.
function doubleColorkeyMainTextureIndices(map: DungeonMap): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const side of map.sides) {
    if ((side.oblouk & SD_HAS_NICHE) !== 0 && side.prim !== 0) {
      const frameCount = side.primAnim & 0xf;
      for (let offset = 0; offset <= frameCount; offset++) indices.add(side.prim + offset);
    }
    if (side.action === A_OPEN_CLOSE && side.sec !== 0) {
      const frameCount = side.secAnim & 0xf;
      for (let offset = 0; offset <= frameCount; offset++) indices.add(side.sec + offset);
    }
  }
  return indices;
}

// show_cel2's rev==2 branch always mirrors the OBL2_NUM (right-arch) bank's
// screen-write direction, unconditionally — not a per-file judgment call
// like VERTICALLY_FLIPPED_TEXTURES, a structural rule confirmed straight
// from the source (see codecs/pcx.ts's flipImageDataHorizontally). Applied
// to every entry in the bank once, at load time.
function flipTextureSetHorizontally(textures: ReadonlyMap<number, ImageData>): ReadonlyMap<number, ImageData> {
  const flipped = new Map<number, ImageData>();
  for (const [key, image] of textures) flipped.set(key, flipImageDataHorizontally(image));
  return flipped;
}

function loadDungeonTextures(archive: DDLArchive, map: DungeonMap): DungeonTextureSet {
  const doubleKey = doubleColorkeyMainTextureIndices(map);
  return {
    main: loadTextureSet(archive, map.mainTextures, WALL_TRANSPARENT_INDEX, doubleKey),
    left: loadTextureSet(archive, map.leftTextures, SIDE_WALL_TRANSPARENT_INDICES),
    right: loadTextureSet(archive, map.rightTextures, SIDE_WALL_TRANSPARENT_INDICES),
    floor: loadTextureSet(archive, map.floorTextures),
    ceil: loadTextureSet(archive, map.ceilTextures),
    // OBL_NUM/OBL2_NUM (decorative arch overlay) banks — verified against
    // LES1W06B/C.PCX to reserve the same second colorkey index (0) as the
    // ordinary side-wall bank (SIDE_WALL_TRANSPARENT_INDICES), not the
    // niche/door-only double-key convention.
    archLeft: loadTextureSet(archive, map.archLeftTextures, SIDE_WALL_TRANSPARENT_INDICES),
    archRight: flipTextureSetHorizontally(loadTextureSet(archive, map.archRightTextures, SIDE_WALL_TRANSPARENT_INDICES)),
  };
}

// SIPKY_S/J/Z/V.PCX (142x330) each stack 3 near-identical frames of the
// D-pad with one arrow highlighted — only the first frame is used, there's
// no meaningful animation to port here.
function firstFrame(image: ImageData, frameHeight: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas context unavailable');
  c.putImageData(image, 0, 0);
  return c.getImageData(0, 0, image.width, frameHeight);
}

function loadDungeonChromeAssets(archive: DDLArchive, deskPanel: ImageData | undefined): DungeonChromeAssets {
  const assets: DungeonChromeAssets = {};
  const topbar = decodeIfPresent(archive, 'TOPBAR.PCX');
  if (topbar) assets.topbar = topbar;
  const dpad = decodeIfPresent(archive, 'SIPKY.PCX');
  if (dpad) assets.dpad = dpad;
  // Filenames are Czech compass letters (Sever/Jih/Západ/Východ = N/S/W/E),
  // but the art always draws north-up, so they map to screen position:
  // S(north)=top=forward, J(south)=bottom=back, Z(west)=left=turn-left,
  // V(east)=right=turn-right — see dungeon-view.ts's DPAD_QUADRANTS.
  const hoverUp = decodeIfPresent(archive, 'SIPKY_S.PCX');
  if (hoverUp) assets.dpadHoverUp = firstFrame(hoverUp, dpad?.height ?? 102);
  const hoverDown = decodeIfPresent(archive, 'SIPKY_J.PCX');
  if (hoverDown) assets.dpadHoverDown = firstFrame(hoverDown, dpad?.height ?? 102);
  const hoverLeft = decodeIfPresent(archive, 'SIPKY_Z.PCX');
  if (hoverLeft) assets.dpadHoverLeft = firstFrame(hoverLeft, dpad?.height ?? 102);
  const hoverRight = decodeIfPresent(archive, 'SIPKY_V.PCX');
  if (hoverRight) assets.dpadHoverRight = firstFrame(hoverRight, dpad?.height ?? 102);
  if (deskPanel) assets.deskPanel = deskPanel;
  return assets;
}

function showPlaceholder(ctx: CanvasRenderingContext2D, message: string): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#ccc';
  ctx.font = '20px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 40, ctx.canvas.height / 2);
}

async function enterDungeon(
  ctx: CanvasRenderingContext2D,
  archive: DDLArchive,
  party: readonly Character[],
  chrome: DungeonChromeAssets,
  start?: { sector: number; direction: Direction },
): Promise<boolean> {
  const mapBuffer = await tryAutoLoadMap(START_MAP);
  if (!mapBuffer) return false;

  const map = parseMapFile(mapBuffer);
  const textures = loadDungeonTextures(archive, map);
  const { result } = runDungeonView(
    ctx,
    { map, sector: start?.sector ?? map.startSector, direction: start?.direction ?? (map.startDirection as Direction) },
    textures,
    party,
    chrome,
  );
  await result; // resolves when KONEC is clicked
  return true;
}

// Obnova pozice (main menu): unlike ULOŽ/OBNOV inside an active session
// (which only reposition the current live party), this reconstructs a
// whole session from scratch — there's no party in memory yet, so the
// save's own party (plain chargen-rolled stats, no equipment/combat state
// to worry about) becomes the new active one, skipping character creation
// entirely.
async function loadSavedGame(ctx: CanvasRenderingContext2D, archive: DDLArchive, chrome: DungeonChromeAssets): Promise<boolean> {
  const save = readSave();
  if (!save || save.party.length === 0) return false;
  return enterDungeon(ctx, archive, save.party, chrome, { sector: save.sector, direction: save.direction as Direction });
}

async function boot(): Promise<void> {
  const archive = await getArchive();
  const menuAssets = loadMenuAssets(archive);
  const chargenAssets = loadCharacterCreationAssets(archive);
  const dungeonChrome = loadDungeonChromeAssets(archive, chargenAssets.deskPanel);
  const ctx = createScreenCanvas(app);

  for (;;) {
    const { choice } = runMainMenu(ctx, menuAssets);
    const selected = await choice;

    if (selected === 0) {
      const { result } = runCharacterCreation(ctx, chargenAssets);
      const party = await result;
      if (party) {
        if (!(await enterDungeon(ctx, archive, party, dungeonChrome))) {
          const names = party.map((member) => member.name).join(', ');
          showPlaceholder(ctx, `Party created: ${names} — dungeon map unavailable`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      continue;
    }

    if (selected === 1) {
      if (!(await loadSavedGame(ctx, archive, dungeonChrome))) {
        showPlaceholder(ctx, 'Nic k obnovení.');
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      continue;
    }

    showPlaceholder(ctx, `${MENU_ITEMS[selected]} — not implemented yet`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

void boot();
