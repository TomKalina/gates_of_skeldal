import type { DungeonTextureSet } from '../game/dungeon-view';
import { calcPoints, floorCeilBand, VIEW_SIZE_X, VIEW_SIZE_Y, VIEW3D_Z, wallCellBounds, type Edge } from '../game/perspective';
import { CEIL_VAULT, DOOR_FRAMES, FLOOR_SLABS, FLOOR_STAIRS, ITEM_GOLD, ITEM_KEY, ITEM_POTION, TEX_DOOR, TEX_GRATE, TEX_LEVER, TEX_MOSS, TEX_STONE } from './map';
import { MOB_SPRITE_CULTIST, MOB_SPRITE_RAT, MOB_SPRITE_SKELETON } from './actors';

const WALL = 128;
type Rgb = readonly [number, number, number];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blank(width: number, height: number): ImageData {
  return new ImageData(width, height);
}

function put(img: ImageData, x: number, y: number, c: Rgb, a = 255): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = a;
}

function brick(u: number, v: number, seed: number, moss: boolean): Rgb {
  const rows = 4;
  const row = Math.floor(v * rows);
  const cols = 2;
  const shifted = u * cols + (row % 2 ? 0.5 : 0);
  const col = Math.floor(shifted);
  const fu = shifted - col;
  const fv = v * rows - row;
  const noise = (hash(Math.floor(u * WALL), Math.floor(v * WALL), seed) - 0.5) * 22;
  if (fu < 0.03 || fv < 0.07) return [34 + noise * 0.3, 31 + noise * 0.3, 28 + noise * 0.3];
  const base = 78 + hash(col, row, seed) * 28;
  const lit = fv < 0.16 ? 16 : fv > 0.9 ? -20 : 0;
  if (moss && v > 0.62 && hash(Math.floor(u * 40), Math.floor(v * 40), seed + 3) < 0.22) return [62 + noise, 92 + noise, 46 + noise];
  return [base + noise + lit, base * 0.93 + noise + lit, base * 0.82 + noise + lit];
}

type Painter = (u: number, v: number) => { c: Rgb; a: number };

function stonePainter(seed: number, moss: boolean): Painter {
  return (u, v) => ({ c: brick(u, v, seed, moss), a: 255 });
}

function gratePainter(frame: number): Painter {
  const stone = stonePainter(4, false);
  const lift = (frame / (DOOR_FRAMES - 1)) * 0.92;
  return (u, v) => {
    if (u > 0.12 && u < 0.88 && v > 0.08) {
      const gv = v + lift;
      if (frame === DOOR_FRAMES - 1 || gv > 1) return { c: [0, 0, 0], a: 0 };
      const bar = (u * 7) % 1 < 0.22 || (gv > 0.3 && gv < 0.36) || (gv > 0.7 && gv < 0.76);
      if (bar) return { c: [52, 52, 60], a: 255 };
      if (u > 0.66 && u < 0.76 && gv > 0.46 && gv < 0.58) return { c: [200, 164, 72], a: 255 };
      return { c: [0, 0, 0], a: 0 };
    }
    return stone(u, v);
  };
}

function leverPainter(): Painter {
  const stone = stonePainter(11, true);
  return (u, v) => {
    if (u > 0.38 && u < 0.62 && v > 0.36 && v < 0.7) {
      if (u > 0.47 && u < 0.53 && v > 0.4 && v < 0.66) return { c: [20, 18, 22], a: 255 };
      return { c: [59, 54, 49], a: 255 };
    }
    if (u > 0.48 && u < 0.52 && v > 0.22 && v <= 0.36) return { c: [139, 139, 147], a: 255 };
    if (Math.hypot(u - 0.5, v - 0.2) < 0.05) return { c: [182, 71, 59], a: 255 };
    return stone(u, v);
  };
}

function doorPainter(frame: number): Painter {
  const lift = frame / (DOOR_FRAMES - 1);
  return (u, v) => {
    const frameWidth = 0.1;
    if (u < frameWidth || u > 1 - frameWidth || v < 0.08) {
      const c = brick(u, v, 3, false);
      return { c: [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], a: 255 };
    }
    const doorTop = 0.08 - lift * 0.92;
    const dv = v - doorTop;
    if (frame === DOOR_FRAMES - 1 || dv < 0) return { c: [0, 0, 0], a: 0 };
    const local = dv / 0.92;
    if (local > 1) return { c: [0, 0, 0], a: 0 };
    const plank = Math.floor((u - frameWidth) / ((1 - 2 * frameWidth) / 4));
    const fu = ((u - frameWidth) / ((1 - 2 * frameWidth) / 4)) % 1;
    const grain = (hash(Math.floor(u * 96), Math.floor(local * 24), 7) - 0.5) * 16;
    const b = 92 + hash(plank, 1, 7) * 26 + grain;
    if (fu > 0.92) return { c: [b * 0.5, b * 0.32, b * 0.18], a: 255 };
    if ((local > 0.18 && local < 0.24) || (local > 0.74 && local < 0.8)) return { c: [58, 54, 50], a: 255 };
    if (Math.abs(Math.hypot((u - 0.72) * 1.4, local - 0.5) - 0.04) < 0.012) return { c: [201, 164, 71], a: 255 };
    return { c: [b, b * 0.62, b * 0.36], a: 255 };
  };
}

function paintFront(painter: Painter): ImageData {
  const img = blank(WALL, WALL);
  for (let y = 0; y < WALL; y++) {
    for (let x = 0; x < WALL; x++) {
      const p = painter((x + 0.5) / WALL, (y + 0.5) / WALL);
      put(img, x, y, p.c, p.a);
    }
  }
  return img;
}

interface SideShape {
  topSlope: number;
  heightRatio: number;
}

function sideShape(): SideShape {
  const geometry = calcPoints();
  const near = wallCellBounds(geometry, 1, -1);
  const far = wallCellBounds(geometry, 2, -1);
  const nearHeight = near.yBottom - near.yTop;
  return { topSlope: (far.yTop - near.yTop) / nearHeight, heightRatio: (far.yBottom - far.yTop) / nearHeight };
}

function paintSide(painter: Painter, shape: SideShape, mirrored: boolean): ImageData {
  const img = blank(WALL, WALL);
  const z0 = 1;
  const z1 = 1 / shape.heightRatio;
  for (let x = 0; x < WALL; x++) {
    const t = (x + 0.5) / WALL;
    const z = 1 / ((1 - t) / z0 + t / z1);
    const u = (z - z0) / (z1 - z0);
    const top = t * shape.topSlope * WALL;
    const height = WALL * (1 - t + t * shape.heightRatio);
    for (let y = 0; y < WALL; y++) {
      const v = (y + 0.5 - top) / height;
      if (v < 0 || v > 1) continue;
      const p = painter(u, v);
      put(img, mirrored ? WALL - 1 - x : x, y, p.c, p.a);
    }
  }
  return img;
}

function slab(u: number, v: number, cellX: number, cellZ: number): Rgb {
  const grid = 2;
  const gu = u * grid;
  const gv = v * grid;
  const iu = Math.floor(gu);
  const iv = Math.floor(gv);
  const fu = gu - iu;
  const fv = gv - iv;
  const noise = (hash(Math.floor(u * 64), Math.floor(v * 64), cellX * 31 + cellZ) - 0.5) * 18;
  if (fu < 0.05 || fv < 0.05) return [28 + noise * 0.3, 25 + noise * 0.3, 22 + noise * 0.3];
  const base = 62 + hash(iu + cellX * 3, iv + cellZ * 5, 2) * 16;
  return [base + noise, base * 0.9 + noise, base * 0.78 + noise];
}

function stairs(u: number, v: number, cellX: number, cellZ: number): Rgb {
  if (u > 0.14 && u < 0.86 && v > 0.12 && v < 0.88) {
    const step = Math.floor(((v - 0.12) / 0.76) * 4);
    const fv = (((v - 0.12) / 0.76) * 4) % 1;
    if (fv < 0.12) return [180 - step * 35, 120 - step * 26, 55 - step * 12];
    const d = 26 - step * 6;
    return [d, d * 0.9, d * 0.85];
  }
  return slab(u, v, cellX, cellZ);
}

function vault(u: number, v: number, cellX: number, cellZ: number): Rgb {
  const noise = (hash(Math.floor(u * 64), Math.floor(v * 64), cellX * 17 + cellZ + 9) - 0.5) * 14;
  const rib = Math.abs(u - 0.5) < 0.05 || v < 0.06;
  if (rib) return [60 + noise, 57 + noise, 52 + noise];
  const arch = 1 - Math.abs(u - 0.5) * 1.2;
  const base = 34 + arch * 12;
  return [base + noise, base + noise, base * 1.08 + noise];
}

type FlatPainter = (u: number, v: number, cellX: number, cellZ: number) => Rgb;

function paintPlane(edge: Edge, painter: FlatPainter): ImageData {
  const geometry = calcPoints();
  const bands: { depth: number; lateral: number; band: ReturnType<typeof floorCeilBand> }[] = [];
  for (let depth = 0; depth < VIEW3D_Z; depth++) {
    for (let lateral = -3; lateral <= 3; lateral++) {
      try {
        const band = floorCeilBand(geometry, depth, lateral, edge);
        if ([band.rowNear, band.rowFar, band.xlNear, band.xrNear, band.xlFar, band.xrFar].every(Number.isFinite)) bands.push({ depth, lateral, band });
      } catch {
        continue;
      }
    }
  }
  const rows = bands.map((b) => b.band.rowFar);
  const height = edge === 0 ? Math.ceil(VIEW_SIZE_Y - Math.min(...rows)) : Math.ceil(Math.max(...rows));
  const width = VIEW_SIZE_X;
  const img = blank(width, Math.max(1, height));
  const random = rng(edge + 5);
  for (let y = 0; y < img.height; y++) {
    const viewRow = edge === 0 ? VIEW_SIZE_Y - img.height + y + 0.5 : y + 0.5;
    for (let x = 0; x < width; x++) {
      const vx = x + 0.5;
      let color: Rgb = [0, 0, 0];
      let depthFraction = 1;
      for (const { depth, lateral, band } of bands) {
        const lo = Math.min(band.rowNear, band.rowFar);
        const hi = Math.max(band.rowNear, band.rowFar);
        if (viewRow < lo || viewRow >= hi) continue;
        const t = Math.abs(viewRow - band.rowNear) / (hi - lo);
        const xl = band.xlNear + (band.xlFar - band.xlNear) * t;
        const xr = band.xrNear + (band.xrFar - band.xrNear) * t;
        if (vx < xl || vx >= xr) continue;
        color = painter((vx - xl) / (xr - xl), 1 - t, lateral, depth);
        depthFraction = (depth + t) / VIEW3D_Z;
        break;
      }
      const k = Math.max(0, 1 - depthFraction * 0.92) * (0.97 + random() * 0.03);
      put(img, x, y, [color[0] * k, color[1] * k, color[2] * k]);
    }
  }
  return img;
}

export function createKryptaTextures(): DungeonTextureSet {
  const shape = sideShape();
  const painters = new Map<number, Painter>([
    [TEX_STONE, stonePainter(1, false)],
    [TEX_MOSS, stonePainter(5, true)],
    [TEX_LEVER, leverPainter()],
  ]);
  for (let f = 0; f < DOOR_FRAMES; f++) {
    painters.set(TEX_DOOR + f, doorPainter(f));
    painters.set(TEX_GRATE + f, gratePainter(f));
  }

  const main = new Map<number, ImageData>();
  const left = new Map<number, ImageData>();
  const right = new Map<number, ImageData>();
  for (const [id, painter] of painters) {
    main.set(id, paintFront(painter));
    left.set(id, paintSide(painter, shape, false));
    right.set(id, paintSide(painter, shape, true));
  }

  return {
    main,
    left,
    right,
    floor: new Map([
      [FLOOR_SLABS, paintPlane(0, slab)],
      [FLOOR_STAIRS, paintPlane(0, stairs)],
    ]),
    ceil: new Map([[CEIL_VAULT, paintPlane(1, vault)]]),
    archLeft: new Map(),
    archRight: new Map(),
    item: createItemSprites(),
    mob: createMobSprites(),
  };
}

type Sketch = (c: CanvasRenderingContext2D) => void;

function sketch(width: number, height: number, draw: Sketch): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas context unavailable');
  draw(c);
  return c.getImageData(0, 0, width, height);
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

function createItemSprites(): Map<number, ImageData> {
  return new Map([
    [ITEM_KEY, sketch(48, 24, (c) => {
      c.strokeStyle = '#d8b04a';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(10, 12, 7, 0, Math.PI * 2);
      c.moveTo(17, 12);
      c.lineTo(44, 12);
      c.moveTo(36, 12);
      c.lineTo(36, 20);
      c.moveTo(42, 12);
      c.lineTo(42, 19);
      c.stroke();
    })],
    [ITEM_POTION, sketch(28, 40, (c) => {
      ellipse(c, 14, 27, 12, 12, '#7d2a3a');
      ellipse(c, 10, 23, 3, 3, '#d26a7a');
      c.fillStyle = '#b8b8c0';
      c.fillRect(10, 4, 8, 12);
      c.fillStyle = '#6b4a2a';
      c.fillRect(9, 0, 10, 5);
    })],
    [ITEM_GOLD, sketch(40, 24, (c) => {
      for (const [x, y] of [[10, 16], [22, 17], [30, 15], [16, 10], [26, 9]] as const) {
        ellipse(c, x, y, 8, 5, '#a8841e');
        ellipse(c, x, y - 1, 7, 4, '#e8c84a');
      }
    })],
  ]);
}

function createMobSprites(): Map<number, ImageData> {
  return new Map([
    [MOB_SPRITE_RAT, sketch(120, 64, (c) => {
      c.strokeStyle = '#8a6a6a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(18, 52);
      c.quadraticCurveTo(0, 40, 6, 22);
      c.stroke();
      ellipse(c, 56, 46, 38, 18, '#4a3f38');
      ellipse(c, 94, 42, 18, 13, '#544840');
      ellipse(c, 86, 28, 7, 8, '#6a5a50');
      ellipse(c, 104, 40, 3, 3, '#ff4030');
      ellipse(c, 112, 46, 3, 2, '#c08080');
      c.fillStyle = '#3a302a';
      c.fillRect(36, 58, 8, 6);
      c.fillRect(72, 58, 8, 6);
    })],
    [MOB_SPRITE_SKELETON, sketch(110, 230, (c) => {
      c.fillStyle = '#d8d0b8';
      ellipse(c, 55, 26, 20, 23, '#d8d0b8');
      ellipse(c, 47, 24, 5, 6, '#201810');
      ellipse(c, 63, 24, 5, 6, '#201810');
      c.fillRect(52, 49, 6, 80);
      for (let i = 0; i < 5; i++) c.fillRect(34, 62 + i * 11, 42, 4);
      c.fillRect(30, 58, 6, 70);
      c.fillRect(74, 58, 6, 70);
      c.fillRect(36, 128, 38, 8);
      c.fillRect(38, 136, 7, 92);
      c.fillRect(65, 136, 7, 92);
      c.fillStyle = '#7a7a84';
      c.fillRect(82, 40, 5, 110);
      c.fillRect(74, 120, 21, 5);
    })],
    [MOB_SPRITE_CULTIST, sketch(120, 240, (c) => {
      c.fillStyle = '#2a1830';
      c.beginPath();
      c.moveTo(60, 8);
      c.lineTo(100, 70);
      c.lineTo(112, 240);
      c.lineTo(8, 240);
      c.lineTo(20, 70);
      c.closePath();
      c.fill();
      ellipse(c, 60, 46, 17, 20, '#0c0810');
      ellipse(c, 53, 46, 3, 2, '#e0c040');
      ellipse(c, 67, 46, 3, 2, '#e0c040');
      c.fillStyle = '#6a1a1a';
      c.fillRect(56, 90, 8, 120);
      c.fillRect(40, 120, 40, 8);
      ellipse(c, 100, 120, 7, 9, '#f0d070');
      c.fillStyle = '#e8e0c8';
      c.fillRect(97, 128, 6, 26);
    })],
  ]);
}
