import { SD_PLAY_IMPS, SD_PRIM_VIS, sideAt, type DungeonMap } from '../formats/map-file';

// Direction indices match TSECTOR.step_next order: 0=N, 1=E, 2=S, 3=W.
export type Direction = 0 | 1 | 2 | 3;

export interface DungeonState {
  map: DungeonMap;
  sector: number;
  direction: Direction;
}

export function turnLeft(dir: Direction): Direction {
  return ((dir + 3) % 4) as Direction;
}

export function turnRight(dir: Direction): Direction {
  return ((dir + 1) % 4) as Direction;
}

export function behind(dir: Direction): Direction {
  return ((dir + 2) % 4) as Direction;
}

// Movement passability uses SD_PLAY_IMPS (set = blocked), confirmed against
// the real LESPRED.MAP: this is distinct from SD_PRIM_VIS, which controls
// whether a wall is drawn (see computeViewCells) — a side can be walked
// through while still rendering a decorative arch, or vice versa.
export function canStep(map: DungeonMap, sector: number, dir: Direction): boolean {
  const side = sideAt(map, sector, dir);
  return side !== undefined && (side.flags & SD_PLAY_IMPS) === 0;
}

function stepThrough(state: DungeonState, dir: Direction): DungeonState {
  if (!canStep(state.map, state.sector, dir)) return state;
  const sector = state.map.sectors[state.sector];
  const nextSector = sector?.stepNext[dir];
  if (nextSector === undefined) return state;
  return { ...state, sector: nextSector };
}

export function stepForward(state: DungeonState): DungeonState {
  return stepThrough(state, state.direction);
}

export function stepBackward(state: DungeonState): DungeonState {
  return stepThrough(state, behind(state.direction));
}

export interface ViewCell {
  depth: number;
  sector: number;
  frontWallTexture: number | null;
  leftWallTexture: number | null;
  rightWallTexture: number | null;
  floorTexture: number;
  ceilTexture: number;
}

// VIEW3D_Z in engine1.h — current cell plus 4 ahead.
export const MAX_VIEW_DEPTH = 5;

function visibleTexture(side: ReturnType<typeof sideAt>): number | null {
  if (!side) return null;
  if ((side.flags & SD_PRIM_VIS) === 0) return null;
  return side.prim !== 0 ? side.prim : null;
}

// Mirrors builder.c's per-cell wall pick (draw_basic_sector) and the
// minimap traversal that stops the view at the first blocking front wall —
// simplified to treat any rendered front wall as fully opaque (the original
// distinguishes see-through arches/doors via additional flags this MVP
// doesn't model).
export function computeViewCells(map: DungeonMap, startSector: number, facing: Direction): ViewCell[] {
  const cells: ViewCell[] = [];
  let sector = startSector;

  for (let depth = 0; depth < MAX_VIEW_DEPTH; depth++) {
    const sectorData = map.sectors[sector];
    if (!sectorData) break;

    const frontWallTexture = visibleTexture(sideAt(map, sector, facing));
    const leftWallTexture = visibleTexture(sideAt(map, sector, turnLeft(facing)));
    const rightWallTexture = visibleTexture(sideAt(map, sector, turnRight(facing)));

    cells.push({
      depth,
      sector,
      frontWallTexture,
      leftWallTexture,
      rightWallTexture,
      floorTexture: sectorData.floor,
      ceilTexture: sectorData.ceil,
    });

    if (frontWallTexture !== null) break;
    sector = sectorData.stepNext[facing];
  }

  return cells;
}
