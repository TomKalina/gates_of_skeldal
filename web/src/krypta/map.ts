import { A_OPEN_CLOSE, SD_APPLY_2ND, SD_PLAY_IMPS, SD_PRIM_VIS, SD_SEC_VIS, SD_TRANSPARENT, type DungeonMap, type MapSector, type MapSide } from '../formats/map-file';

export const KRYPTA_LAYOUT: readonly string[] = [
  '################',
  '#S...#....s...k#',
  '#.##.#.####.####',
  '#.#..D....#....#',
  '#.#.####.##.##.#',
  '#...#p.#..c..#.#',
  '###.#..###.###.#',
  '#g..D...s...#..#',
  '#.######.####.##',
  '#...r..#..c.H.##',
  '#p####V#.####LX#',
  '################',
];

export const TEX_STONE = 1;
export const TEX_MOSS = 2;
export const TEX_GRATE = 3;
export const TEX_LEVER = 4;
export const TEX_DOOR = 5;
export const DOOR_FRAMES = 4;

export const FLOOR_SLABS = 1;
export const FLOOR_STAIRS = 2;
export const CEIL_VAULT = 1;

export const MAIN_TEXTURE_NAMES: readonly string[] = ['STONE', 'MOSS', 'GRATE', 'LEVER', 'DOOR0', 'DOOR1', 'DOOR2', 'DOOR3'];

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const WALKABLE = new Set(['.', 'S', 'X', 'D', 'k', 'p', 'g', 'r', 's', 'c']);

export interface KryptaText {
  x: number;
  y: number;
  direction: number;
  text: string;
}

export const KRYPTA_TEXTS: readonly KryptaText[] = [
  { x: 1, y: 1, direction: 1, text: 'Krypta páchne hnilobou a voskem. Z hloubky zní šoupání kostí.' },
  { x: 4, y: 3, direction: 1, text: 'Na dveřích je vyškrábaný znak Bellphegorů.' },
  { x: 3, y: 7, direction: 1, text: 'Za dveřmi někdo šeptá modlitbu k temným.' },
  { x: 8, y: 8, direction: 2, text: 'Na zemi leží rozbitá svíce kultu. Vosk je ještě teplý.' },
];

export interface KryptaMap {
  map: DungeonMap;
  levelTexts: ReadonlyMap<number, string>;
  sectorAt: (x: number, y: number) => number | undefined;
}

function wallTexture(ch: string, x: number, y: number): number {
  if (ch === 'L') return TEX_GRATE;
  if (ch === 'V') return TEX_LEVER;
  return (x * 7 + y * 13) % 5 === 0 ? TEX_MOSS : TEX_STONE;
}

function solidSide(texture: number): MapSide {
  return { prim: texture, sec: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0, oblouk: 0, action: 0, sectorTag: 0, sideTag: 0 };
}

function openSide(): MapSide {
  return { prim: 0, sec: 0, flags: SD_TRANSPARENT, primAnim: 0, secAnim: 0, oblouk: 0, action: 0, sectorTag: 0, sideTag: 0 };
}

function doorSide(sector: number, direction: number): MapSide {
  return {
    prim: 0,
    sec: TEX_DOOR,
    flags: SD_PLAY_IMPS | SD_SEC_VIS | SD_TRANSPARENT | SD_APPLY_2ND,
    primAnim: 0,
    secAnim: DOOR_FRAMES - 1,
    oblouk: 0,
    action: A_OPEN_CLOSE,
    sectorTag: sector,
    sideTag: direction,
  };
}

export function buildKryptaMap(layout: readonly string[] = KRYPTA_LAYOUT): KryptaMap {
  const ids = new Map<string, number>();
  const cells: { x: number; y: number; ch: string }[] = [];
  layout.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (!WALKABLE.has(ch)) return;
      ids.set(`${x},${y}`, cells.length + 1);
      cells.push({ x, y, ch });
    });
  });
  const sectorAt = (x: number, y: number) => ids.get(`${x},${y}`);
  const charAt = (x: number, y: number) => layout[y]?.[x] ?? '#';

  const sectors: MapSector[] = [{ floor: 0, ceil: 0, sectorType: 0, stepNext: [0, 0, 0, 0], shaded: false }];
  const sides: MapSide[] = [solidSide(0), solidSide(0), solidSide(0), solidSide(0)];

  let startSector = 1;
  for (const cell of cells) {
    const id = sectorAt(cell.x, cell.y)!;
    if (cell.ch === 'S') startSector = id;
    const stepNext = [0, 1, 2, 3].map((d) => sectorAt(cell.x + DX[d]!, cell.y + DY[d]!) ?? 0) as [number, number, number, number];
    sectors.push({ floor: cell.ch === 'X' ? FLOOR_STAIRS : FLOOR_SLABS, ceil: CEIL_VAULT, sectorType: 0, stepNext, shaded: false });
    for (let d = 0; d < 4; d++) {
      const nx = cell.x + DX[d]!;
      const ny = cell.y + DY[d]!;
      const next = stepNext[d]!;
      if (next === 0) {
        sides.push(solidSide(wallTexture(charAt(nx, ny), nx, ny)));
        continue;
      }
      const isDoorBoundary = (charAt(nx, ny) === 'D' && (d === 1 || d === 2)) || (cell.ch === 'D' && (d === 3 || d === 0));
      const doorAxisOk = isDoorBoundary && isDoorAxis(layout, cell.ch === 'D' ? cell.x : nx, cell.ch === 'D' ? cell.y : ny, d);
      sides.push(doorAxisOk ? doorSide(id, d) : openSide());
    }
  }

  const levelTexts = new Map<number, string>();
  const textTriggers = new Map<number, number>();
  KRYPTA_TEXTS.forEach((t, i) => {
    const sector = sectorAt(t.x, t.y);
    if (sector === undefined) return;
    levelTexts.set(i + 1, t.text);
    textTriggers.set(sector * 4 + t.direction, i + 1);
  });

  const map: DungeonMap = {
    mapName: 'KRYPTA',
    startSector,
    startDirection: 1,
    fadeColor: { r: 0, g: 0, b: 0 },
    sectors,
    sides,
    mainTextures: MAIN_TEXTURE_NAMES,
    leftTextures: MAIN_TEXTURE_NAMES,
    rightTextures: MAIN_TEXTURE_NAMES,
    ceilTextures: ['VAULT'],
    floorTextures: ['SLABS', 'STAIRS'],
    archLeftTextures: [],
    archRightTextures: [],
    placedItems: new Map(),
    mapTransitions: new Map(),
    textTriggers,
    touchTextTriggers: new Map(),
  };
  return { map, levelTexts, sectorAt };
}

function isDoorAxis(layout: readonly string[], x: number, y: number, direction: number): boolean {
  const horizontal = direction === 1 || direction === 3;
  const a = horizontal ? layout[y]?.[x - 1] : layout[y - 1]?.[x];
  const b = horizontal ? layout[y]?.[x + 1] : layout[y + 1]?.[x];
  return a !== undefined && b !== undefined && WALKABLE.has(a) && WALKABLE.has(b);
}
