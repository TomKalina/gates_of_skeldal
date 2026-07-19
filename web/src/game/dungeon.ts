import { A_OPEN_CLOSE, SD_LEFT_ARC, SD_PLAY_IMPS, SD_PRIM_VIS, SD_RIGHT_ARC, SD_SEC_VIS, SD_TRANSPARENT, sideAt, type DungeonMap } from '../formats/map-file';

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
  // 0 = straight ahead, negative = left of center, positive = right —
  // engine1.h's VIEW3D_X lateral grid (create_minimap/crt_minimap_itr),
  // collapsed the same way depth already is: a closed-form scale-and-shift
  // instead of the DOS per-cell pixel tables (calc_points).
  lateral: number;
  sector: number;
  frontWallTexture: number | null;
  leftWallTexture: number | null;
  rightWallTexture: number | null;
  floorTexture: number;
  ceilTexture: number;
  // A side's SECONDARY texture (sec/secAnim, gated by SD_SEC_VIS) is a
  // completely separate slot from prim — verified against LESPRED.MAP's
  // sector 14/15 door: prim=0 (nothing in the primary slot) but
  // sec=15 (LES1A11A.PCX, a closed wooden door). Previously unrendered
  // entirely, since this MVP only ever read prim/primAnim.
  frontSecTexture: number | null;
  // True when this front side's action is A_OPEN_CLOSE (a real, clickable
  // door in the source data) — see toggleDoor().
  frontIsDoor: boolean;
  // draw_basic_sector's decorative arch overlay, drawn *before* the main
  // wall texture (see dungeon-view.ts's drawFrontWall) — an independent
  // index/gate per half (SD_LEFT_ARC/SD_RIGHT_ARC), each pulling from its
  // own OBL_NUM/OBL2_NUM texture bank via archTextureIndex(). A side can
  // show both halves, one, or neither, regardless of frontWallTexture.
  frontArchLeftTexture: number | null;
  frontArchRightTexture: number | null;
}

// VIEW3D_Z/VIEW3D_X in engine1.h.
export const MAX_VIEW_DEPTH = 5;
export const MAX_LATERAL = 4;

// draw_basic_sector: the texture actually shown is `q->prim + (q->prim_anim
// >> 4)`, not prim alone — the upper nibble of prim_anim is an animation
// frame offset (verified: LESPRED.MAP sector 18's west side has prim=24
// pointing at a 4-frame sequence, LES1A21A..LES1A24A.PCX at consecutive
// indices, with primAnim's upper nibble selecting which frame is current).
function visibleTexture(side: ReturnType<typeof sideAt>): number | null {
  if (!side) return null;
  if ((side.flags & SD_PRIM_VIS) === 0) return null;
  if (side.prim === 0) return null;
  return side.prim + (side.primAnim >> 4);
}

// builder.c's crt_minimap_itr: both forward AND sideways visibility are
// gated by SD_TRANSPARENT, NOT SD_PRIM_VIS. These are genuinely different
// questions — "is a wall image drawn on this side" (SD_PRIM_VIS) vs "does
// geometry continue to exist and get computed beyond this side"
// (SD_TRANSPARENT) — and a side can answer both at once: verified against
// LESPRED.MAP's start sector, whose west wall renders an opaque-looking
// decorative bracket sprite that's actually 61% colorkey-punched, with a
// second, ordinary wall one sector further west showing through the gaps.
// Previously this MVP conflated the two (stopped the whole cell chain the
// moment any wall image appeared), which is why that second wall — and,
// more importantly, the sectors visible sideways through transparent
// doors/windows/open walls — never got computed or drawn at all.
function isTransparent(side: ReturnType<typeof sideAt>): boolean {
  return side !== undefined && (side.flags & SD_TRANSPARENT) !== 0;
}

// Same idea as visibleTexture(), for the independent secondary slot
// (sec/secAnim, gated by SD_SEC_VIS rather than SD_PRIM_VIS).
function visibleSecTexture(side: ReturnType<typeof sideAt>): number | null {
  if (!side) return null;
  if ((side.flags & SD_SEC_VIS) === 0) return null;
  if (side.sec === 0) return null;
  return side.sec + (side.secAnim >> 4);
}

// builder.c's GET_OBLOUK: `(p->oblouk & 0xf) + (p->prim_anim >> 4)` — the
// arch overlay shares the same animation-frame offset as the primary wall
// texture, so an animated door's arch frame advances in lockstep with its
// swing. 0 means "no arch" regardless of the animation offset (verified:
// sanitize_map clamps oblouk&0xf to the smaller of the two real banks'
// entry counts, so an out-of-range index can't occur with real map data;
// a missing/undefined texture lookup is handled the same as any other
// bank's miss, no special-casing needed here).
function archTextureIndex(side: ReturnType<typeof sideAt>): number | null {
  if (!side) return null;
  const index = (side.oblouk & 0xf) + (side.primAnim >> 4);
  return index === 0 ? null : index;
}

// Mirrors create_minimap/crt_minimap_itr: a depth-and-lateral grid of every
// sector visible from startSector while facing `facing`, built by
// recursing forward through transparent front sides and sideways through
// transparent left/right sides. dirs (left/front/right) are fixed for the
// whole traversal, exactly like the original's dirs[] — every sector in
// the grid is viewed using the same absolute compass directions, not
// re-derived per-sector. The original also tracks an `enter`/`enter_tab`
// state to bound how a lateral branch can re-cross back toward center;
// approximated here as "a branch may not cross back past the center
// column once committed to a side," which is simpler but keeps the same
// no-zigzag intent.
export function computeVisibleGrid(map: DungeonMap, startSector: number, facing: Direction): ViewCell[] {
  const dirs = [turnLeft(facing), facing, turnRight(facing)] as const;
  const cells: ViewCell[] = [];
  const seen = new Set<string>();

  function visit(sector: number, depth: number, lateral: number): void {
    if (depth >= MAX_VIEW_DEPTH || lateral < -MAX_LATERAL || lateral > MAX_LATERAL) return;
    const key = `${depth}:${lateral}`;
    if (seen.has(key)) return;
    seen.add(key);

    const sectorData = map.sectors[sector];
    if (!sectorData) return;

    const leftSide = sideAt(map, sector, dirs[0]);
    const frontSide = sideAt(map, sector, dirs[1]);
    const rightSide = sideAt(map, sector, dirs[2]);

    cells.push({
      depth,
      lateral,
      sector,
      frontWallTexture: visibleTexture(frontSide),
      leftWallTexture: visibleTexture(leftSide),
      rightWallTexture: visibleTexture(rightSide),
      floorTexture: sectorData.floor,
      ceilTexture: sectorData.ceil,
      frontSecTexture: visibleSecTexture(frontSide),
      frontIsDoor: frontSide !== undefined && frontSide.action === A_OPEN_CLOSE,
      frontArchLeftTexture: frontSide && frontSide.flags & SD_LEFT_ARC ? archTextureIndex(frontSide) : null,
      frontArchRightTexture: frontSide && frontSide.flags & SD_RIGHT_ARC ? archTextureIndex(frontSide) : null,
    });

    if (isTransparent(frontSide)) {
      const next = sectorData.stepNext[dirs[1]];
      if (next !== undefined) visit(next, depth + 1, lateral);
    }
    if (lateral <= 0 && isTransparent(leftSide)) {
      const next = sectorData.stepNext[dirs[0]];
      if (next !== undefined) visit(next, depth, lateral - 1);
    }
    if (lateral >= 0 && isTransparent(rightSide)) {
      const next = sectorData.stepNext[dirs[2]];
      if (next !== undefined) visit(next, depth, lateral + 1);
    }
  }

  visit(startSector, 0, 0);
  return cells;
}

// Backward-compatible straight-ahead-only view for callers that don't need
// the lateral grid.
export function computeViewCells(map: DungeonMap, startSector: number, facing: Direction): ViewCell[] {
  return computeVisibleGrid(map, startSector, facing)
    .filter((cell) => cell.lateral === 0)
    .sort((a, b) => a.depth - b.depth);
}
