import { computeVisibleGrid, stepBackward, stepForward, turnLeft, turnRight, type DungeonState, type FloorItem, type ViewCell } from './dungeon';
import { toggleDoor } from '../formats/map-file';
import { readSave, writeSave } from './save';
import type { Character } from './party';
import { faceThumbnail } from './portraits';
import { stepAllAnimations } from './animation';
import { pumpTick } from '../platform/events';
import { calcPoints, floorCeilBand, mapPos, wallCellBounds, VIEW_SIZE_X, VIEW_SIZE_Y, type Edge } from './perspective';

export interface DungeonTextureSet {
  main: ReadonlyMap<number, ImageData>;
  left: ReadonlyMap<number, ImageData>;
  right: ReadonlyMap<number, ImageData>;
  floor: ReadonlyMap<number, ImageData>;
  ceil: ReadonlyMap<number, ImageData>;
  // OBL_NUM/OBL2_NUM decorative arch overlay banks (see dungeon.ts's
  // archTextureIndex). archRight is pre-flipped horizontally at load time
  // (main.ts) to match show_cel2's rev==2 mirrored-write behavior.
  archLeft: ReadonlyMap<number, ImageData>;
  archRight: ReadonlyMap<number, ImageData>;
  // A_MAPITEM floor items (game/builder.c: draw_placed_items_normal), keyed
  // by the raw 1-based item number (see dungeon.ts's FloorItem) — resolved
  // from ITEMS.DAT's TITEM.vzhled via items-file.ts.
  item: ReadonlyMap<number, ImageData>;
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

// Phase B2: real wall geometry (perspective.ts's calcPoints/wallCellBounds,
// ported from engine1.c's calc_points + create_tables' x_table/z_table)
// replacing the earlier DEPTH_SCALE closed-form approximation. Computed
// once at module load — geometry is a pure constant, no map/state
// dependency, same as floor/ceiling's viewportGeometry (Phase B1). Floor/
// ceiling and walls now derive from the identical source table instead of
// two independently-approximated shapes that merely looked close, so they
// meet at the same pixel by construction.
const viewportGeometry = calcPoints();
const perspectiveScaleX = VIEWPORT.width / VIEW_SIZE_X;
const perspectiveScaleY = VIEWPORT.height / VIEW_SIZE_Y;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// `lateral` is VIEW3D_X's signed cell index (0 = straight ahead), not a
// boundary index. Kept as a Rect-returning function (same shape as the old
// DEPTH_SCALE version) so every existing call site — side-wall trapezoid
// corners, the front-wall rect, the door hit-test rect, the floor/ceiling
// fallback split — carries over unchanged, now backed by real geometry.
function rectAtDepthLateral(depth: number, lateral: number): Rect {
  const bounds = wallCellBounds(viewportGeometry, depth, lateral);
  const x = VIEWPORT.x + bounds.xl * perspectiveScaleX;
  const y = VIEWPORT.y + bounds.yTop * perspectiveScaleY;
  return {
    x,
    y,
    width: (bounds.xr - bounds.xl) * perspectiveScaleX,
    height: (bounds.yBottom - bounds.yTop) * perspectiveScaleY,
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
  // Cached from the last draw() for click hit-testing — doors are the only
  // clickable thing in the 3D viewport, and their screen rects depend on
  // the current view (depth/lateral), so a fresh grid computed on every
  // draw is the only source of truth for "what's at this pixel".
  let lastDoorCells: ViewCell[] = [];

  let resolveResult!: () => void;
  const result = new Promise<void>((resolve) => {
    resolveResult = resolve;
  });

  // Phase B1: real per-cell floor/ceiling geometry (perspective.ts's
  // calcPoints/floorCeilBand, ported from engine1.c's calc_points +
  // create_tables) replacing the single stretched-image approximation.
  // Floor/ceiling textures are pre-baked, screen-sized perspective art
  // (640x199 floor, 640x93-ish ceiling — see perspective.ts's header) drawn
  // at *native scale*, always anchored the same way (floor to the
  // viewport's bottom edge, ceiling to its top) — what differs per visible
  // cell is only the clip trapezoid, exactly mirroring how drawSideWall
  // already clips wall textures. geometry is a pure constant (no map/state
  // dependency), computed once and reused for every draw() call.
  //
  // Known gap: computeVisibleGrid only produces a cell where the traversal
  // reaches it through a *transparent* side (dungeon.ts's isTransparent) —
  // a solid wall simply stops the recursion, so no cell (and thus no
  // floor/ceiling draw) exists beyond it. The real engine's minimap grid
  // has no such gate: it always fills the full lateral extent bounded only
  // by view geometry, using whatever sector occupies each slot, letting a
  // nearer solid wall simply paint over the ceiling/floor behind it later.
  // Rebuilding that (a wall-visibility-independent floor/ceiling traversal)
  // is B2-adjacent scope, not attempted here. Instead this draws the old
  // single-stretched-image approximation as a base layer first (using the
  // nearest center-column cell's own texture, full viewport width — this
  // is exactly what this function did before B1), then layers the new
  // accurate per-cell trapezoids on top wherever a real cell exists — so a
  // room wider than the transparent-reachable grid never regresses to a
  // black gap, it just falls back to the old (still correct-looking,
  // if less precise at sector boundaries) approximation at the fringes.
  function drawFloorCeilBase(nearestCell: ViewCell, centerColumnDepth: number): void {
    const horizon = rectAtDepthLateral(centerColumnDepth, 0);

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

  function drawFloorCeilCell(cell: ViewCell, edge: Edge): void {
    // builder.c's draw_floor/draw_ceil macros only call draw_floor_ceil at
    // all `if (s->floor)`/`if (s->ceil)` — texture id 0 means "genuinely no
    // floor/ceiling here" (e.g. an outdoor sector seen through a window),
    // not "texture failed to load", so it must draw nothing at all rather
    // than a fallback fill (a flat-fill here would paint over the whole
    // cell's trapezoid, including wherever a wall/window texture drawn
    // afterward doesn't happen to cover).
    const textureId = edge === 0 ? cell.floorTexture : cell.ceilTexture;
    if (textureId === 0) return;
    const image = (edge === 0 ? textures.floor : textures.ceil).get(textureId);
    const band = floorCeilBand(viewportGeometry, cell.depth, cell.lateral, edge);
    const rowNear = VIEWPORT.y + band.rowNear * perspectiveScaleY;
    const rowFar = VIEWPORT.y + band.rowFar * perspectiveScaleY;
    if (Math.abs(rowNear - rowFar) < 0.5) return;
    const xlNear = VIEWPORT.x + band.xlNear * perspectiveScaleX;
    const xrNear = VIEWPORT.x + band.xrNear * perspectiveScaleX;
    const xlFar = VIEWPORT.x + band.xlFar * perspectiveScaleX;
    const xrFar = VIEWPORT.x + band.xrFar * perspectiveScaleX;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xlNear, rowNear);
    ctx.lineTo(xrNear, rowNear);
    ctx.lineTo(xrFar, rowFar);
    ctx.lineTo(xlFar, rowFar);
    ctx.closePath();
    ctx.clip();

    if (image) {
      const height = image.height * perspectiveScaleY;
      const y = edge === 0 ? VIEWPORT.y + VIEWPORT.height - height : VIEWPORT.y;
      ctx.drawImage(toDrawable(image), VIEWPORT.x, y, VIEWPORT.width, height);
    } else {
      ctx.fillStyle = edge === 0 ? '#332' : '#223';
      ctx.fillRect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, VIEWPORT.height);
    }
    ctx.restore();
  }

  // Every wall/door/arch texture bank (MAIN_NUM/LEFT_NUM/RIGHT_NUM/OBL_NUM/
  // OBL2_NUM) is loaded via A_FADE_PAL in the real engine (game/skeldal.c's
  // pcx_fade_decomp), which bakes 5 depth-indexed palette variants into
  // every texture at load time — a per-map ambient/fog color the wall
  // fades toward as depth increases (real, per-map-authored art direction,
  // e.g. LESPRED.MAP's pale forest-cyan-green vs. dungeon maps' black —
  // see DungeonMap.fadeColor), or, for MC_SHADING-flagged sectors (a real,
  // per-sector override — up to 29% of sectors in some shipped maps),
  // straight fade-to-black instead. Floor/ceiling are excluded — they use
  // a wholly different, palette-shadow-unrelated mechanism.
  //
  // Ratios below are derived directly from palette_shadow's blend formula
  // (libs/pcx.c) at SHADE_STEPS=5, which is exactly VIEW3D_Z (5 depth
  // levels, one bucket per level, no interpolation): fraction of original
  // color retained at depth d is (14-3d)/14 for the fade-to-map-color half,
  // (5-d)/5 for the fade-to-black half — so alpha (fraction of the *target*
  // color mixed in) is 3d/14 or d/5 respectively. Applying this as ONE flat
  // overlay after every layer (arch+main+sec, or the side-wall image) has
  // been drawn onto a cell's rect is mathematically identical to shading
  // each texture independently before compositing them (same alpha/target
  // for every layer at a given depth — alpha-over composition distributes
  // over blending), not merely a visual approximation.
  function applyDepthShade(cell: ViewCell, x: number, y: number, width: number, height: number): void {
    const shaded = state.map.sectors[cell.sector]?.shaded ?? false;
    const alpha = shaded ? cell.depth / 5 : (3 * cell.depth) / 14;
    if (alpha <= 0) return;
    const { r, g, b } = state.map.fadeColor;
    ctx.fillStyle = shaded ? '#000000' : `rgb(${r}, ${g}, ${b})`;
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1;
  }

  function drawSideWall(cell: ViewCell, near: Rect, far: Rect, side: 'left' | 'right', image: ImageData | undefined): void {
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
    applyDepthShade(cell, near.x, near.y, near.width, near.height);
    ctx.restore();
  }

  // draw_basic_sector only draws a cell's LEFT wall `if (celx<=0)` and its
  // RIGHT wall `if (celx>=0)` — a cell strictly right of center never draws
  // the wall facing back toward the center column (and vice versa), since
  // that face isn't meant to be visible from this viewing angle.
  function drawSideWalls(cell: ViewCell): void {
    const near = rectAtDepthLateral(cell.depth, cell.lateral);
    const far = rectAtDepthLateral(cell.depth + 1, cell.lateral);
    if (cell.lateral <= 0 && cell.leftWallTexture !== null) {
      drawSideWall(cell, near, far, 'left', textures.left.get(cell.leftWallTexture));
    }
    if (cell.lateral >= 0 && cell.rightWallTexture !== null) {
      drawSideWall(cell, near, far, 'right', textures.right.get(cell.rightWallTexture));
    }
  }

  // Drawn for every cell that has one, not just the last of a chain — a
  // side can render a wall image while still being SD_TRANSPARENT (e.g.
  // this map's start sector: a decorative bracket sprite that's 61%
  // colorkey-punched), in which case farther geometry was already painted
  // behind it by the time this runs and shows through the gaps.
  function drawFrontWall(cell: ViewCell): void {
    const rect = rectAtDepthLateral(cell.depth + 1, cell.lateral);
    // draw_basic_sector draws the arch overlay(s) *before* the main/sec
    // wall texture — a decorative frame painted behind whatever art
    // (door, window, plain wall) sits in front of it, at the exact same
    // cell rect (xofs=0, yofs=0, no SD_POSITION shift — the C source never
    // applies plac to these two calls).
    if (cell.frontArchLeftTexture !== null) {
      const image = textures.archLeft.get(cell.frontArchLeftTexture);
      if (image) ctx.drawImage(toDrawable(image), rect.x, rect.y, rect.width, rect.height);
    }
    if (cell.frontArchRightTexture !== null) {
      const image = textures.archRight.get(cell.frontArchRightTexture);
      if (image) ctx.drawImage(toDrawable(image), rect.x, rect.y, rect.width, rect.height);
    }
    if (cell.frontWallTexture !== null) {
      const image = textures.main.get(cell.frontWallTexture);
      if (image) {
        ctx.drawImage(toDrawable(image), rect.x, rect.y, rect.width, rect.height);
      } else {
        ctx.fillStyle = '#553';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
    // Secondary slot (sec/secAnim) is a fully independent texture from prim
    // — verified against this map's sector 14/15 door, which has no prim
    // texture at all (prim=0) and shows entirely through sec.
    if (cell.frontSecTexture !== null) {
      const image = textures.main.get(cell.frontSecTexture);
      if (image) ctx.drawImage(toDrawable(image), rect.x, rect.y, rect.width, rect.height);
    }
    // One overlay covering every layer just drawn (arch/main/sec) — see
    // applyDepthShade's own comment for why this is exact, not approximate.
    applyDepthShade(cell, rect.x, rect.y, rect.width, rect.height);
  }

  // engine1.c: `static int items_indextab[][2]={{0,0},{-1,3},{1,7},{-1,7},
  // {1,10},{-1,10},{0,10},{-2,15}};` — a small per-slot pixel jitter so
  // items sharing a floor corner (jitterIndex 0..7, wrapping via `&7`)
  // don't draw exactly on top of each other.
  const ITEMS_INDEX_TAB: readonly (readonly [number, number])[] = [
    [0, 0], [-1, 3], [1, 7], [-1, 7], [1, 10], [-1, 10], [0, 10], [-2, 15],
  ];

  // engine1.c's draw_item(): anchors a floor item's sprite at a sub-cell
  // point (via mapPos) and draws it upward from there, scaled by mapPos's
  // `scale`/320 — the same ratio enemy_draw's xtable/ytable prep uses for
  // both dimensions uniformly (verified in game/engine2.c). Manual clipl/
  // clipr clipping in the source exists only because the DOS blitter had no
  // native clipping — Canvas2D's drawImage already clips off-canvas draws,
  // so it isn't replicated here (same "port the visible result" convention
  // as the rest of this renderer).
  function drawFloorItem(cell: ViewCell, item: FloorItem): void {
    const image = textures.item.get(item.itemNumber);
    if (!image) return;
    const [randx, randy] = ITEMS_INDEX_TAB[7 - (item.jitterIndex & 7)]!;
    const pos = mapPos(viewportGeometry, cell.lateral, cell.depth, 42 * item.posx + 42 + randx, 72 * item.posy + randy, 0);
    const rawWidth = (image.width * pos.scale) / 320;
    const rawHeight = (image.height * pos.scale) / 320;
    const rawX = pos.x - rawWidth / 2;

    const x = VIEWPORT.x + rawX * perspectiveScaleX;
    const yBottom = VIEWPORT.y + pos.y * perspectiveScaleY;
    const width = rawWidth * perspectiveScaleX;
    const height = rawHeight * perspectiveScaleY;

    ctx.drawImage(toDrawable(image), x, yBottom - height, width, height);
    applyDepthShade(cell, x, yBottom - height, width, height);
  }

  function drawFloorItems(cell: ViewCell): void {
    for (const item of cell.floorItems) drawFloorItem(cell, item);
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
    // Sky-colored, not black: drawFloorCeilBase's single fallback split (see
    // its own comment) is derived from the *nearest* center-column cell, so
    // a farther no-ceiling cell newly exposed through an opened passage
    // (e.g. looking through the open forest door into the ceiling-less
    // sector beyond) isn't covered by it and falls through to this base
    // fill — matches the same '#223' used for an ordinary missing-ceiling
    // fallback instead of reading as a stark rendering hole.
    ctx.fillStyle = '#223';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const grid = computeVisibleGrid(state.map, state.sector, state.direction);
    lastDoorCells = grid.filter((cell) => cell.frontIsDoor);

    const centerColumn = grid.filter((cell) => cell.lateral === 0).sort((a, b) => a.depth - b.depth);
    const nearestCell = centerColumn[0];
    if (nearestCell) drawFloorCeilBase(nearestCell, centerColumn.length);

    // Farthest first, so a nearer transparent wall's colorkey-punched gaps
    // reveal whatever farther geometry was already painted behind it.
    const byDepthDescending = [...grid].sort((a, b) => b.depth - a.depth);
    for (const cell of byDepthDescending) {
      drawFloorCeilCell(cell, 0);
      drawFloorCeilCell(cell, 1);
    }
    for (const cell of byDepthDescending) {
      drawSideWalls(cell);
      drawFrontWall(cell);
    }
    for (const cell of byDepthDescending) {
      drawFloorItems(cell);
    }

    drawTopBar();
    drawBottomBar();
  }

  function saveGame(): void {
    writeSave({ mapName: state.map.mapName, sector: state.sector, direction: state.direction, party });
    statusText = 'Uloženo.';
    draw();
  }

  function loadGame(): void {
    const save = readSave();
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

    // Nearest door first, in case rects ever overlap.
    const clickedDoor = [...lastDoorCells].sort((a, b) => a.depth - b.depth).find((cell) => {
      const doorRect = rectAtDepthLateral(cell.depth + 1, cell.lateral);
      return rectContains(doorRect, x, y);
    });
    if (clickedDoor) {
      toggleDoor(state.map, clickedDoor.sector, state.direction);
      draw();
      return;
    }

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

  // realgame.c's calc_animations() runs once per game tick, driven by the
  // real DOS timer interrupt; this port doesn't have that exact frequency
  // on hand, so TICK_MS is an approximation picked for a natural-looking
  // door swing (7 frames over ~0.7s), not a measured constant. Drives the
  // event kernel's own per-tick broadcast (platform/events.ts's pumpTick,
  // Phase A1) alongside the animation step, per EXECUTION-PLAN.md's A3.
  const TICK_MS = 100;
  let animationFrameId = 0;
  let lastTickAt = 0;
  function tickLoop(now: number): void {
    animationFrameId = requestAnimationFrame(tickLoop);
    if (now - lastTickAt < TICK_MS) return;
    lastTickAt = now;
    pumpTick();
    if (stepAllAnimations(state.map)) draw();
  }

  function dispose(): void {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeydown);
    cancelAnimationFrame(animationFrameId);
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeydown);
  draw();
  animationFrameId = requestAnimationFrame(tickLoop);

  return { result, dispose };
}
