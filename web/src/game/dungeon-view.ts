import { computeViewCells, stepBackward, stepForward, turnLeft, turnRight, type DungeonState, type ViewCell } from './dungeon';

export interface DungeonTextureSet {
  main: ReadonlyMap<number, ImageData>;
  left: ReadonlyMap<number, ImageData>;
  right: ReadonlyMap<number, ImageData>;
  floor: ReadonlyMap<number, ImageData>;
  ceil: ReadonlyMap<number, ImageData>;
}

export interface DungeonViewHandle {
  dispose(): void;
}

// engine1.h: VIEW_SIZE_X/Y. The remaining (480 - 360) is left for a status
// bar placeholder — the real bottom bar/compass/spell icons (builder.c) are
// part of the inventory UI (#14), not this first dungeon view.
const VIEWPORT = { x: 0, y: 0, width: 640, height: 360 };

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

// TS counterpart of the first static view shown by builder.c's render_scene
// when entering a map — every surface (front wall, receding side walls,
// floor, ceiling) is drawn with its real decoded texture, matching what
// show_cel/show_cel2/fcdraw actually do (scale a texture into a
// perspective-shaped destination), just using Canvas2D's built-in image
// scaling and clip paths instead of the original's hand-rolled DOS
// scanline/zoom-table blitters. See docs/port-graph.md for the remaining
// gaps — floor/ceiling in particular are a single stretched image using the
// nearest cell's texture, not fcdraw's true per-scanline per-cell mapping.
export function runDungeonView(ctx: CanvasRenderingContext2D, initial: DungeonState, textures: DungeonTextureSet): DungeonViewHandle {
  const canvas = ctx.canvas;
  let state = initial;

  // Floor/ceiling art (e.g. LES1F06A.PCX, LES1C01A.PCX) turned out to be a
  // small REPEATING tile pattern, not a tall perspective-encoded strip — an
  // earlier version of this function sliced it into depth bands, which had
  // no sound basis once that assumption fell through (see port-graph.md).
  // Much simpler and correct: stretch the nearest cell's whole texture over
  // the entire visible floor/ceiling region, same as a repeating background.
  function drawFloorAndCeiling(nearestCell: ViewCell, totalDepths: number): void {
    const horizon = rectAtDepth(totalDepths);

    const ceilImage = textures.ceil.get(nearestCell.ceilTexture);
    const ceilHeight = horizon.y;
    if (ceilImage) {
      ctx.drawImage(toDrawable(ceilImage), 0, 0, VIEWPORT.width, ceilHeight);
    } else {
      ctx.fillStyle = '#223';
      ctx.fillRect(0, 0, VIEWPORT.width, ceilHeight);
    }

    const floorImage = textures.floor.get(nearestCell.floorTexture);
    const floorY = horizon.y + horizon.height;
    const floorHeight = VIEWPORT.height - floorY;
    if (floorImage) {
      ctx.drawImage(toDrawable(floorImage), 0, floorY, VIEWPORT.width, floorHeight);
    } else {
      ctx.fillStyle = '#332';
      ctx.fillRect(0, floorY, VIEWPORT.width, floorHeight);
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

  function drawStatusBar(): void {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, VIEWPORT.height, canvas.width, canvas.height - VIEWPORT.height);
    ctx.fillStyle = '#ccc';
    ctx.font = '13px monospace';
    ctx.textBaseline = 'top';
    const dirName = ['North', 'East', 'South', 'West'][state.direction];
    ctx.fillText(`Sector ${state.sector} — facing ${dirName}`, 16, VIEWPORT.height + 16);
    ctx.fillText('Arrow keys: move / turn', 16, VIEWPORT.height + 36);
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

    drawStatusBar();
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
    draw();
  }

  function dispose(): void {
    window.removeEventListener('keydown', onKeydown);
  }

  window.addEventListener('keydown', onKeydown);
  draw();

  return { dispose };
}
