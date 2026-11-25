import type { DungeonTextureSet } from '../game/dungeon-view';
import { calcPoints, floorCeilBand, VIEW_SIZE_X, VIEW_SIZE_Y, VIEW3D_Z, wallCellBounds, type Edge } from '../game/perspective';
import { CEIL_VAULT, DOOR_FRAMES, FLOOR_SLABS, FLOOR_STAIRS, TEX_DOOR, TEX_GRATE, TEX_LEVER, TEX_MOSS, TEX_STONE } from './map';

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

function gratePainter(): Painter {
  const stone = stonePainter(4, false);
  return (u, v) => {
    if (u > 0.12 && u < 0.88 && v > 0.08) {
      const bar = (u * 7) % 1 < 0.22 || (v > 0.3 && v < 0.36) || (v > 0.7 && v < 0.76);
      if (bar) return { c: [52, 52, 60], a: 255 };
      if (u > 0.66 && u < 0.76 && v > 0.46 && v < 0.58) return { c: [200, 164, 72], a: 255 };
      return { c: [6, 6, 8], a: 255 };
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
    [TEX_GRATE, gratePainter()],
    [TEX_LEVER, leverPainter()],
  ]);
  for (let f = 0; f < DOOR_FRAMES; f++) painters.set(TEX_DOOR + f, doorPainter(f));

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
    item: new Map(),
  };
}
