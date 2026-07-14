import { computeViewCells, stepBackward, stepForward, turnLeft, turnRight, type DungeonState, type ViewCell } from './dungeon';

export interface DungeonTextureSet {
  main: ReadonlyMap<number, ImageData>;
  floor: ReadonlyMap<number, ImageData>;
  ceil: ReadonlyMap<number, ImageData>;
}

export interface DungeonViewHandle {
  dispose(): void;
}

// engine1.h: VIEW_SIZE_X/Y. The remaining (480 - 360) is left for a status
// bar placeholder — the real bottom bar/compass/spell icons (builder.c) are
// part of the inventory UI (#14), not this first static dungeon view.
const VIEWPORT = { x: 0, y: 0, width: 640, height: 360 };

// Not the original's precomputed zoom tables (those are a DOS-blitter
// technique — see docs/port-graph.md) — just a geometric shrink per depth
// that gives the same "receding corridor" silhouette via drawImage scaling.
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

const colorCache = new WeakMap<ImageData, string>();
function averageColor(image: ImageData): string {
  let cached = colorCache.get(image);
  if (cached) return cached;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const stride = 4 * 7; // sample every 7th pixel — plenty for a flat average
  for (let i = 0; i < image.data.length; i += stride) {
    r += image.data[i] ?? 0;
    g += image.data[i + 1] ?? 0;
    b += image.data[i + 2] ?? 0;
    count++;
  }
  cached = count > 0 ? `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})` : '#333';
  colorCache.set(image, cached);
  return cached;
}

// TS counterpart of the first static view shown by builder.c's render_scene
// when entering a map. Renders the front-facing wall (the actual blocking
// wall at the end of the visible corridor) with its real decoded texture;
// floor, ceiling, and receding side walls are flat-shaded with the real
// average color of their textures rather than fully texture-mapped — see
// docs/port-graph.md for what a faithful engine1.c/engine2.c port would add.
export function runDungeonView(ctx: CanvasRenderingContext2D, initial: DungeonState, textures: DungeonTextureSet): DungeonViewHandle {
  const canvas = ctx.canvas;
  let state = initial;

  function drawFloorAndCeiling(cell: ViewCell, depth: number): void {
    const near = rectAtDepth(depth);
    const far = rectAtDepth(depth + 1);
    const floorImage = textures.floor.get(cell.floorTexture);
    const ceilImage = textures.ceil.get(cell.ceilTexture);

    ctx.fillStyle = floorImage ? averageColor(floorImage) : '#332';
    ctx.beginPath();
    ctx.moveTo(near.x, near.y + near.height);
    ctx.lineTo(near.x + near.width, near.y + near.height);
    ctx.lineTo(far.x + far.width, far.y + far.height);
    ctx.lineTo(far.x, far.y + far.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ceilImage ? averageColor(ceilImage) : '#223';
    ctx.beginPath();
    ctx.moveTo(near.x, near.y);
    ctx.lineTo(near.x + near.width, near.y);
    ctx.lineTo(far.x + far.width, far.y);
    ctx.lineTo(far.x, far.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawSideWall(near: Rect, far: Rect, side: 'left' | 'right', color: string): void {
    ctx.fillStyle = color;
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
    ctx.fill();
  }

  function drawSideWalls(cell: ViewCell, depth: number): void {
    const near = rectAtDepth(depth);
    const far = rectAtDepth(depth + 1);
    if (cell.leftWallTexture !== null) {
      const image = textures.main.get(cell.leftWallTexture);
      drawSideWall(near, far, 'left', image ? averageColor(image) : '#443');
    }
    if (cell.rightWallTexture !== null) {
      const image = textures.main.get(cell.rightWallTexture);
      drawSideWall(near, far, 'right', image ? averageColor(image) : '#443');
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
    for (let i = cells.length - 1; i >= 0; i--) drawFloorAndCeiling(cells[i]!, i);
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
