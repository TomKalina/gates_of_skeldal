import { A_OPEN_CLOSE, SD_APPLY_2ND, SD_PLAY_IMPS, SD_PRIM_VIS, SD_SEC_VIS, SD_TRANSPARENT, type DungeonMap, type MapSector, type MapSide } from '../formats/map-file';
import { MA, MC, readMacroItem, type MacroAction, type MacroTable } from '../game/macros';

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
export const TEX_LEVER = 3;
export const TEX_DOOR = 4;
export const DOOR_FRAMES = 4;
export const TEX_GRATE = TEX_DOOR + DOOR_FRAMES;

export const FLOOR_SLABS = 1;
export const FLOOR_STAIRS = 2;
export const CEIL_VAULT = 1;

export const MAIN_TEXTURE_NAMES: readonly string[] = ['STONE', 'MOSS', 'LEVER', 'DOOR0', 'DOOR1', 'DOOR2', 'DOOR3', 'GRATE0', 'GRATE1', 'GRATE2', 'GRATE3'];

export const ITEM_KEY = 1;
export const ITEM_POTION = 2;
export const ITEM_GOLD = 3;

export type MobKind = 'r' | 's' | 'c';

export interface MobSpawn {
  kind: MobKind;
  sector: number;
}

const DX = [0, 1, 0, -1] as const;
const DY = [-1, 0, 1, 0] as const;
const WALKABLE = new Set(['.', 'S', 'X', 'D', 'L', 'k', 'p', 'g', 'r', 's', 'c']);
const MOB_KINDS = new Set<string>(['r', 's', 'c']);

const FLOOR_ITEMS: readonly { x: number; y: number; side: number; item: number }[] = [
  { x: 14, y: 1, side: 1, item: ITEM_KEY },
  { x: 5, y: 5, side: 0, item: ITEM_POTION },
  { x: 1, y: 10, side: 2, item: ITEM_POTION },
  { x: 1, y: 7, side: 3, item: ITEM_GOLD },
];

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

export const TEXT_GRATE_LOCKED = 5;
export const TEXT_GRATE_OPENED = 6;

const MACRO_TEXTS: ReadonlyMap<number, string> = new Map([
  [TEXT_GRATE_LOCKED, 'Mříž je zamčená. Chce to klíč.'],
  [TEXT_GRATE_OPENED, 'Klíč zaskřípe v zámku a mříž se zvedá.'],
]);

export const VICTORY_TEXT = 'Družina vyšla z krypty Rovenska.';
export const DEFEAT_TEXT = 'Družina padla v kryptě Rovenska.';

export interface KryptaMap {
  map: DungeonMap;
  levelTexts: ReadonlyMap<number, string>;
  sectorAt: (x: number, y: number) => number | undefined;
  macros: MacroTable;
  mobSpawns: readonly MobSpawn[];
}

function wallTexture(ch: string, x: number, y: number): number {
  if (ch === 'V') return TEX_LEVER;
  return (x * 7 + y * 13) % 5 === 0 ? TEX_MOSS : TEX_STONE;
}

function solidSide(texture: number): MapSide {
  return { prim: texture, sec: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0, oblouk: 0, action: 0, sectorTag: 0, sideTag: 0 };
}

function openSide(): MapSide {
  return { prim: 0, sec: 0, flags: SD_TRANSPARENT, primAnim: 0, secAnim: 0, oblouk: 0, action: 0, sectorTag: 0, sideTag: 0 };
}

function doorSide(sector: number, direction: number, texture: number): MapSide {
  return {
    prim: 0,
    sec: texture,
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
  const mobSpawns: MobSpawn[] = [];
  for (const cell of cells) {
    const id = sectorAt(cell.x, cell.y)!;
    if (cell.ch === 'S') startSector = id;
    if (MOB_KINDS.has(cell.ch)) mobSpawns.push({ kind: cell.ch as MobKind, sector: id });
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
      const isGrateBoundary = (charAt(nx, ny) === 'L' && d === 2) || (cell.ch === 'L' && d === 0);
      if (isGrateBoundary) sides.push(doorSide(id, d, TEX_GRATE));
      else sides.push(doorAxisOk ? doorSide(id, d, TEX_DOOR) : openSide());
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
  for (const [index, text] of MACRO_TEXTS) levelTexts.set(index, text);

  const placedItems = new Map<number, number[]>();
  for (const placed of FLOOR_ITEMS) {
    const sector = sectorAt(placed.x, placed.y);
    if (sector !== undefined) placedItems.set(sector * 4 + placed.side, [placed.item]);
  }

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
    placedItems,
    mapTransitions: new Map(),
    textTriggers,
    touchTextTriggers: new Map(),
  };
  return { map, levelTexts, sectorAt, macros: buildKryptaMacros(layout, sectorAt), mobSpawns };
}

function macroItem(action: number, flags: number, payload: readonly number[], index: number, cancel = false): MacroAction {
  const head = action | (cancel ? 0x40 : 0);
  return readMacroItem(new Uint8Array([head, flags & 0xff, flags >> 8, ...payload]), index);
}

function int16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function int32(value: number): number[] {
  return [...int16(value), (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function findCell(layout: readonly string[], ch: string): { x: number; y: number } | undefined {
  for (let y = 0; y < layout.length; y++) {
    const x = layout[y]!.indexOf(ch);
    if (x !== -1) return { x, y };
  }
  return undefined;
}

function buildKryptaMacros(layout: readonly string[], sectorAt: (x: number, y: number) => number | undefined): MacroTable {
  const records = new Map<number, MacroAction[]>();
  const grate = findCell(layout, 'L');
  const above = grate && sectorAt(grate.x, grate.y - 1);
  const grateSector = grate && sectorAt(grate.x, grate.y);
  if (above !== undefined) {
    records.set(above * 4 + 2, [
      macroItem(MA.LOCK, MC.TOUCHSUC, [...int16(ITEM_KEY), ...int16(-1)], 0),
      macroItem(MA.TEXTL, MC.TOUCHSUC, [0, ...int32(TEXT_GRATE_OPENED)], 1),
      macroItem(MA.TEXTL, MC.LOCKINFO, [0, ...int32(TEXT_GRATE_LOCKED)], 2),
    ]);
  }
  if (grateSector !== undefined) {
    records.set(grateSector * 4 + 1, [macroItem(MA.ENDGM, MC.PASSSUC, [], 3)]);
  }
  return { records, count: 4 };
}

function isDoorAxis(layout: readonly string[], x: number, y: number, direction: number): boolean {
  const horizontal = direction === 1 || direction === 3;
  const a = horizontal ? layout[y]?.[x - 1] : layout[y - 1]?.[x];
  const b = horizontal ? layout[y]?.[x + 1] : layout[y + 1]?.[x];
  return a !== undefined && b !== undefined && WALKABLE.has(a) && WALKABLE.has(b);
}
