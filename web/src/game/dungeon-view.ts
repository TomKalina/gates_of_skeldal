import { computeViewCells, stepBackward, stepForward, turnLeft, turnRight, type DungeonState, type ViewCell } from './dungeon';
import type { Character } from './party';
import { faceThumbnail } from './portraits';

export interface DungeonTextureSet {
  main: ReadonlyMap<number, ImageData>;
  left: ReadonlyMap<number, ImageData>;
  right: ReadonlyMap<number, ImageData>;
  floor: ReadonlyMap<number, ImageData>;
  ceil: ReadonlyMap<number, ImageData>;
}

// The real dungeon screen's chrome (TOPBAR.PCX, SIPKY.PCX) — all optional
// since the view should still render (with plain fallback fills) if an
// asset is missing, same convention as every other screen in this port.
export interface DungeonChromeAssets {
  topbar?: ImageData;
  // SIPKY.PCX: the base D-pad art, all 4 arrows shown. SIPKY_S/J/Z/V.PCX are
  // the same image with one arrow highlighted, keyed by which screen
  // position they highlight (up/down/left/right) — see the note by
  // DPAD_QUADRANTS for why the Czech compass-letter filenames map this way.
  dpad?: ImageData;
  dpadHoverUp?: ImageData;
  dpadHoverDown?: ImageData;
  dpadHoverLeft?: ImageData;
  dpadHoverRight?: ImageData;
  // POSTAVY.PCX — reused here purely for its baked-in face crops (see
  // portraits.ts), same as the chargen roster box.
  deskPanel?: ImageData;
}

export interface DungeonViewHandle {
  // Resolves once KONEC is clicked and the view should be torn down.
  result: Promise<void>;
  dispose(): void;
}

// engine1.h: VIEW_SIZE_X/Y, minus the real top status bar (TOPBAR.PCX, 16px)
// and bottom bar (matches the chargen action panel's own 102px height).
const TOPBAR_HEIGHT = 16;
const BOTTOM_BAR_HEIGHT = 102;
const VIEWPORT = { x: 0, y: TOPBAR_HEIGHT, width: 640, height: 480 - TOPBAR_HEIGHT - BOTTOM_BAR_HEIGHT };
const BOTTOM_BAR = { x: 0, y: 480 - BOTTOM_BAR_HEIGHT, width: 640, height: BOTTOM_BAR_HEIGHT };

// engine1.c's calc_points() builds its whole perspective grid the same way:
// each depth's x/y is the previous depth's x/y minus x/FACTOR_3D — a
// geometric shrink toward the vanishing point. This is that same recurrence
// collapsed into a closed-form scale factor per depth (the DOS zoom tables
// then resample textures into these rects — see show_cel/show_cel2 — which
// is exactly what drawImage's dest-rect scaling does).
const DEPTH_SCALE = 0.62;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectAtDepth(depth: number): Rect {
  const scale = DEPTH_SCALE ** depth;
  const width = VIEWPORT.width * scale;
  const height = VIEWPORT.height * scale;
  return {
    x: VIEWPORT.x + (VIEWPORT.width - width) / 2,
    y: VIEWPORT.y + (VIEWPORT.height - height) / 2,
    width,
    height,
  };
}

const bitmapCache = new WeakMap<ImageData, HTMLCanvasElement>();
function toDrawable(image: ImageData): HTMLCanvasElement {
  let canvas = bitmapCache.get(image);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D canvas context unavailable');
    c.putImageData(image, 0, 0);
    bitmapCache.set(image, canvas);
  }
  return canvas;
}

function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

// Measured directly off the real TOPBAR.PCX (640x16) by scanning for its
// bevel-highlight seam columns — these are exact, not screenshot estimates.
// The icon cells (fire/book/spell/food) right of OBNOV have no wired
// function yet (no spellbook/rest/inventory system exists), so they're
// intentionally left with no hit rect.
const TOPBAR_BUTTONS = {
  konec: { x: 26, y: 0, width: 59, height: TOPBAR_HEIGHT },
  nastaveni: { x: 85, y: 0, width: 60, height: TOPBAR_HEIGHT },
  uloz: { x: 145, y: 0, width: 60, height: TOPBAR_HEIGHT },
  obnov: { x: 205, y: 0, width: 60, height: TOPBAR_HEIGHT },
} as const;
// The blank strip past the last icon cell where the real game prints the
// party's gold total — always 0 for now, there's no economy/loot system yet.
const GOLD_TEXT_X = 540;

// SIPKY.PCX (142x102): a diamond D-pad — up/down/left/right triangular
// arrows around a center skull medallion. Quadrant boxes are generous
// hand-measured rects (not per-pixel masks), same convention as every other
// hotspot in this port. Screen-position keys, not compass directions —
// SIPKY_S/J/Z/V.PCX's names are Czech compass letters (Sever/Jih/Západ/
// Východ = N/S/W/E) but the artwork always draws north-up, so "S" highlights
// the TOP arrow, "J" the bottom, "Z" the left, "V" the right; wired to
// forward/back/turn-left/turn-right the same as the arrow keys.
const DPAD_SIZE = { width: 142, height: 102 };
const DPAD_QUADRANTS = {
  up: { x: 40, y: 0, width: 55, height: 35 },
  down: { x: 40, y: 65, width: 55, height: 37 },
  left: { x: 0, y: 28, width: 42, height: 46 },
  right: { x: 100, y: 28, width: 42, height: 46 },
} as const;
type DpadDirection = keyof typeof DPAD_QUADRANTS;

const PARTY_BOX_GAP = 4;
const PARTY_BOX_HEIGHT = BOTTOM_BAR_HEIGHT;
const PARTY_PORTRAIT_HEIGHT = 86;
const PARTY_NAME_STRIP_GAP = 2;
const PARTY_BAR_WIDTH = 5;
const PARTY_BAR_GAP = 2;
const PARTY_PORTRAIT_WIDTH = 58;
const PARTY_BOX_WIDTH = PARTY_PORTRAIT_WIDTH + (PARTY_BAR_WIDTH + PARTY_BAR_GAP) * 3 + 4;
// Left margin reserved for the reference's decorative chain-and-skull
// column — no asset hook for that art exists yet (same gap as the chargen
// panel), so it stays a flat fill.
const PARTY_ROW_X = 24;

const SAVE_KEY = 'skeldal:dungeon-save';
interface DungeonSave {
  mapName: string;
  sector: number;
  direction: number;
}

// TS counterpart of the first static view shown by builder.c's render_scene
// when entering a map — every surface (front wall, receding side walls,
// floor, ceiling) is drawn with its real decoded texture, matching what
// show_cel/show_cel2/fcdraw actually do (scale a texture into a
// perspective-shaped destination), just using Canvas2D's built-in image
// scaling and clip paths instead of the original's hand-rolled DOS
// scanline/zoom-table blitters. See docs/port-graph.md for the remaining
// gaps — floor/ceiling in particular are a single stretched image using the
// nearest cell's texture, not fcdraw's true per-scanline per-cell mapping.
// Save/load (ULOŽ/OBNOV) is a single implicit localStorage slot holding
// just the current sector/direction — there's no save-slot picker UI, and
// no inventory/combat state exists yet to persist beyond position.
export function runDungeonView(
  ctx: CanvasRenderingContext2D,
  initial: DungeonState,
  textures: DungeonTextureSet,
  party: readonly Character[],
  chrome: DungeonChromeAssets = {},
): DungeonViewHandle {
  const canvas = ctx.canvas;
  let state = initial;
  let hoverDpad: DpadDirection | null = null;
  let statusText = '';

  let resolveResult!: () => void;
  const result = new Promise<void>((resolve) => {
    resolveResult = resolve;
  });

  function drawFloorAndCeiling(nearestCell: ViewCell, totalDepths: number): void {
    const horizon = rectAtDepth(totalDepths);

    const ceilImage = textures.ceil.get(nearestCell.ceilTexture);
    const ceilHeight = horizon.y - VIEWPORT.y;
    if (ceilImage) {
      ctx.drawImage(toDrawable(ceilImage), VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, ceilHeight);
    } else {
      ctx.fillStyle = '#223';
      ctx.fillRect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, ceilHeight);
    }

    const floorImage = textures.floor.get(nearestCell.floorTexture);
    const floorY = horizon.y + horizon.height;
    const floorHeight = VIEWPORT.y + VIEWPORT.height - floorY;
    if (floorImage) {
      ctx.drawImage(toDrawable(floorImage), VIEWPORT.x, floorY, VIEWPORT.width, floorHeight);
    } else {
      ctx.fillStyle = '#332';
      ctx.fillRect(VIEWPORT.x, floorY, VIEWPORT.width, floorHeight);
    }
  }

  function drawSideWall(near: Rect, far: Rect, side: 'left' | 'right', image: ImageData | undefined): void {
    ctx.save();
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
      ctx.lineTo(far.x, far.y + far.height);
      ctx.lineTo(near.x, near.y + near.height);
    } else {
      ctx.moveTo(near.x + near.width, near.y);
      ctx.lineTo(far.x + far.width, far.y);
      ctx.lineTo(far.x + far.width, far.y + far.height);
      ctx.lineTo(near.x + near.width, near.y + near.height);
    }
    ctx.closePath();
    ctx.clip();

    if (image) {
      const boundX = side === 'left' ? near.x : far.x + far.width;
      const boundWidth = side === 'left' ? far.x - near.x : near.x + near.width - (far.x + far.width);
      ctx.drawImage(toDrawable(image), boundX, near.y, boundWidth, near.height);
    } else {
      ctx.fillStyle = '#443';
      ctx.fillRect(near.x, near.y, near.width, near.height);
    }
    ctx.restore();
  }

  function drawSideWalls(cell: ViewCell, depth: number): void {
    const near = rectAtDepth(depth);
    const far = rectAtDepth(depth + 1);
    if (cell.leftWallTexture !== null) {
      drawSideWall(near, far, 'left', textures.left.get(cell.leftWallTexture));
    }
    if (cell.rightWallTexture !== null) {
      drawSideWall(near, far, 'right', textures.right.get(cell.rightWallTexture));
    }
  }

  function drawTopBar(): void {
    if (chrome.topbar) ctx.putImageData(chrome.topbar, 0, 0);
    else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, TOPBAR_HEIGHT);
    }
    // Gold count — always 0, there's no economy/loot system yet.
    ctx.font = '11px monospace';
    ctx.fillStyle = '#d9c88a';
    ctx.textBaseline = 'top';
    ctx.fillText('0', GOLD_TEXT_X, 2);
  }

  function drawPartyBox(member: Character, x: number): void {
    const y = BOTTOM_BAR.y;
    ctx.strokeStyle = '#555';
    ctx.strokeRect(x + 0.5, y + 0.5, PARTY_PORTRAIT_WIDTH, PARTY_PORTRAIT_HEIGHT);
    const face = faceThumbnail(chrome.deskPanel, member.portraitIndex);
    if (face) ctx.drawImage(face, x, y, PARTY_PORTRAIT_WIDTH, PARTY_PORTRAIT_HEIGHT);
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, PARTY_PORTRAIT_WIDTH, PARTY_PORTRAIT_HEIGHT);
    }

    ctx.fillStyle = '#eee';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(String(member.level), x + 3, y + PARTY_PORTRAIT_HEIGHT - 13);

    // Three vertical resource bars right of the portrait — there's no
    // combat/damage system yet, so every bar always reads full (matches a
    // freshly rolled, undamaged party).
    let barX = x + PARTY_PORTRAIT_WIDTH + PARTY_BAR_GAP;
    for (const color of ['#c96a2e', '#5aa552', '#3f7fc9']) {
      ctx.fillStyle = color;
      ctx.fillRect(barX, y, PARTY_BAR_WIDTH, PARTY_PORTRAIT_HEIGHT);
      barX += PARTY_BAR_WIDTH + PARTY_BAR_GAP;
    }

    const stripY = y + PARTY_PORTRAIT_HEIGHT + PARTY_NAME_STRIP_GAP;
    const stripHeight = PARTY_BOX_HEIGHT - PARTY_PORTRAIT_HEIGHT - PARTY_NAME_STRIP_GAP;
    ctx.fillStyle = '#322d26';
    ctx.fillRect(x, stripY, PARTY_BOX_WIDTH, stripHeight);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(x + 0.5, stripY + 0.5, PARTY_BOX_WIDTH, stripHeight);
    ctx.fillStyle = '#ccc';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(member.name.slice(0, 12), x + PARTY_BOX_WIDTH / 2, stripY + 2);
    ctx.textAlign = 'left';
  }

  function dpadImage(): ImageData | undefined {
    if (hoverDpad === 'up') return chrome.dpadHoverUp ?? chrome.dpad;
    if (hoverDpad === 'down') return chrome.dpadHoverDown ?? chrome.dpad;
    if (hoverDpad === 'left') return chrome.dpadHoverLeft ?? chrome.dpad;
    if (hoverDpad === 'right') return chrome.dpadHoverRight ?? chrome.dpad;
    return chrome.dpad;
  }

  function dpadOrigin(): { x: number; y: number } {
    return { x: BOTTOM_BAR.x + BOTTOM_BAR.width - DPAD_SIZE.width - 12, y: BOTTOM_BAR.y };
  }

  function drawBottomBar(): void {
    ctx.fillStyle = '#111';
    ctx.fillRect(BOTTOM_BAR.x, BOTTOM_BAR.y, BOTTOM_BAR.width, BOTTOM_BAR.height);

    const dpadOrig = dpadOrigin();
    // Party boxes shrink to fit if they'd otherwise run into the D-pad —
    // no evidence for how the real game lays out a full 6-member party here,
    // so this is a reasonable fit-to-space choice, not a measured fact.
    const availableWidth = dpadOrig.x - PARTY_ROW_X - 12;
    const naturalWidth = party.length * PARTY_BOX_WIDTH + Math.max(0, party.length - 1) * PARTY_BOX_GAP;
    const shrink = naturalWidth > availableWidth && party.length > 0 ? availableWidth / naturalWidth : 1;
    let x = PARTY_ROW_X;
    for (const member of party) {
      drawPartyBox(member, x);
      x += (PARTY_BOX_WIDTH + PARTY_BOX_GAP) * shrink;
    }

    const image = dpadImage();
    if (image) ctx.drawImage(toDrawable(image), dpadOrig.x, dpadOrig.y);
    else {
      ctx.strokeStyle = '#555';
      ctx.strokeRect(dpadOrig.x + 0.5, dpadOrig.y + 0.5, DPAD_SIZE.width, DPAD_SIZE.height);
    }

    if (statusText) {
      ctx.fillStyle = '#ff8080';
      ctx.font = '11px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(statusText, PARTY_ROW_X, BOTTOM_BAR.y - 14);
    }
  }

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cells = computeViewCells(state.map, state.sector, state.direction);
    const nearestCell = cells[0];
    if (nearestCell) drawFloorAndCeiling(nearestCell, cells.length);
    for (let i = cells.length - 1; i >= 0; i--) drawSideWalls(cells[i]!, i);

    const lastCell = cells[cells.length - 1];
    if (lastCell && lastCell.frontWallTexture !== null) {
      const rect = rectAtDepth(cells.length);
      const image = textures.main.get(lastCell.frontWallTexture);
      if (image) {
        ctx.drawImage(toDrawable(image), rect.x, rect.y, rect.width, rect.height);
      } else {
        ctx.fillStyle = '#553';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }

    drawTopBar();
    drawBottomBar();
  }

  function saveGame(): void {
    const save: DungeonSave = { mapName: state.map.mapName, sector: state.sector, direction: state.direction };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    statusText = 'Uloženo.';
    draw();
  }

  function loadGame(): void {
    const raw = localStorage.getItem(SAVE_KEY);
    const save = raw ? (JSON.parse(raw) as DungeonSave) : null;
    if (!save || save.mapName !== state.map.mapName) {
      statusText = 'Nic k obnovení.';
      draw();
      return;
    }
    state = { ...state, sector: save.sector, direction: save.direction as DungeonState['direction'] };
    statusText = 'Obnoveno.';
    draw();
  }

  function onMouseDown(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offX = rect.left + (rect.width - canvas.width * scale) / 2;
    const offY = rect.top + (rect.height - canvas.height * scale) / 2;
    const x = (e.clientX - offX) / scale;
    const y = (e.clientY - offY) / scale;

    if (rectContains(TOPBAR_BUTTONS.konec, x, y)) {
      dispose();
      resolveResult();
      return;
    }
    if (rectContains(TOPBAR_BUTTONS.uloz, x, y)) {
      saveGame();
      return;
    }
    if (rectContains(TOPBAR_BUTTONS.obnov, x, y)) {
      loadGame();
      return;
    }
    // Nastavení and the icon cells have no system to open yet.

    const dpadOrig = dpadOrigin();
    const localX = x - dpadOrig.x;
    const localY = y - dpadOrig.y;
    for (const [dir, quad] of Object.entries(DPAD_QUADRANTS) as [DpadDirection, Rect][]) {
      if (rectContains(quad, localX, localY)) {
        applyDpadDirection(dir);
        return;
      }
    }
  }

  function applyDpadDirection(dir: DpadDirection): void {
    statusText = '';
    if (dir === 'up') state = stepForward(state);
    else if (dir === 'down') state = stepBackward(state);
    else if (dir === 'left') state = { ...state, direction: turnLeft(state.direction) };
    else state = { ...state, direction: turnRight(state.direction) };
    draw();
  }

  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offX = rect.left + (rect.width - canvas.width * scale) / 2;
    const offY = rect.top + (rect.height - canvas.height * scale) / 2;
    const x = (e.clientX - offX) / scale;
    const y = (e.clientY - offY) / scale;

    const dpadOrig = dpadOrigin();
    const localX = x - dpadOrig.x;
    const localY = y - dpadOrig.y;
    let next: DpadDirection | null = null;
    for (const [dir, quad] of Object.entries(DPAD_QUADRANTS) as [DpadDirection, Rect][]) {
      if (rectContains(quad, localX, localY)) {
        next = dir;
        break;
      }
    }
    if (next !== hoverDpad) {
      hoverDpad = next;
      draw();
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowUp':
        state = stepForward(state);
        break;
      case 'ArrowDown':
        state = stepBackward(state);
        break;
      case 'ArrowLeft':
        state = { ...state, direction: turnLeft(state.direction) };
        break;
      case 'ArrowRight':
        state = { ...state, direction: turnRight(state.direction) };
        break;
      default:
        return;
    }
    statusText = '';
    draw();
  }

  function dispose(): void {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeydown);
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeydown);
  draw();

  return { result, dispose };
}
