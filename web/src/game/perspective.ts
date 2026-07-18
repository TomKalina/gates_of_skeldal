// engine1.c's calc_points() + create_tables()'s floor/ceiling loops
// (game/engine1.c — the real, actively-built engine1.c; libs/engine1.c is a
// smaller, unused legacy copy, confirmed absent from every CMakeLists.txt).
//
// The real renderer precomputes, once, a `viewport_geometry[j][edge][i]`
// table: for each lateral boundary `j` (0..VIEW3D_X) and edge (0=floor,
// 1=ceiling), a sequence of `{x,y}` points decaying geometrically over
// depth `i` (0..VIEW3D_Z) via `v -= v/FACTOR_3D` (truncating), seeded from
// `START_X1`/`START_Y1`/`START_X2`/`START_Y2`. This is a real iterative
// integer-truncating decay, not a closed-form `pow` — replicated exactly
// (`Math.trunc` matches C's `(int)` cast: both truncate toward zero).
//
// `create_tables()` then builds per-scanline floor/ceiling blit tables
// (`f_table`/`c_table`) from this geometry, one entry per *screen row*,
// precomputing an exact source/destination byte offset for a straight
// memcpy (`engine2.c`'s `fcdraw`) — a DOS-era optimization for O(1)
// per-scanline blitting. Floor/ceiling textures turn out to be pre-baked,
// screen-sized perspective art (640x199 for floor, 640x93 for ceiling —
// verified against LESPRED.MAP's real LES1F01A.PCX/LES1C01A.PCX), copied
// at *native scale* with no runtime stretching: `txtrofs`'s formula is a
// constant *offset* from `lineofs`, not a ratio, so texture row R always
// lands on the same screen row R+const for every depth cell that shares a
// texture. What varies per depth/lateral cell is only the *clip
// region* (`xl`/`xr`, reprojected per-row from the undecayed near-plane
// fan) — each visible cell reveals its own sector's texture within its own
// trapezoid, mirroring exactly how this port already clips wall side-
// textures (`dungeon-view.ts`'s `drawSideWall`). This module ports that
// same geometry (`calcPoints`, `floorCeilBand`) for Canvas2D: draw each
// texture once at native scale, clipped to a per-cell trapezoid, instead
// of replicating the scanline-table/memcpy technique itself.
//
// Scope note (Phase B1 — see docs/EXECUTION-PLAN.md): only floor/ceiling
// geometry is ported here. Wall geometry (`x_table`/`z_table`,
// `show_cel2`'s `plac` anchoring) is Phase B2 and still uses the older
// `DEPTH_SCALE` closed-form approximation in `dungeon-view.ts` — so floor/
// wall edges may not align to the exact pixel until B2 replaces that too;
// documented as a known seam in port-graph.md.

export const VIEW3D_X = 4;
export const VIEW3D_Z = 5;
const START_X1 = 357;
const START_Y1 = 305;
const START_X2 = 357;
const START_Y2 = -150;
const FACTOR_3D = 3.33;

// engine1.h
export const VIEW_SIZE_X = 640;
export const VIEW_SIZE_Y = 360;
export const MIDDLE_X = 320;
export const MIDDLE_Y = 112;

export interface ViewPoint {
  x: number;
  y: number;
}

// [lateral boundary j: 0..VIEW3D_X][edge: 0=floor, 1=ceiling][depth i: 0..VIEW3D_Z]
export type ViewportGeometry = readonly ViewPoint[][][];

export function calcPoints(): ViewportGeometry {
  const geometry: ViewPoint[][][] = [];
  for (let j = 0; j <= VIEW3D_X; j++) {
    let x1 = START_X1 + 2 * START_X1 * j;
    let y1 = START_Y1;
    let x2 = START_X2 + 2 * START_X1 * j;
    let y2 = START_Y2;
    const floorEdge: ViewPoint[] = [];
    const ceilEdge: ViewPoint[] = [];
    for (let i = 0; i <= VIEW3D_Z; i++) {
      floorEdge.push({ x: x1, y: y1 });
      ceilEdge.push({ x: x2, y: y2 });
      x2 = Math.trunc(x2 - x2 / FACTOR_3D);
      y2 = Math.trunc(y2 - y2 / FACTOR_3D);
      x1 = Math.trunc(x1 - x1 / FACTOR_3D);
      y1 = Math.trunc(y1 - y1 / FACTOR_3D);
    }
    geometry.push([floorEdge, ceilEdge]);
  }
  return geometry;
}

export type Edge = 0 | 1;

// create_tables()'s xl/xr picking logic for lateral column `x` against
// `strd = CF_XMAP_SIZE>>1` (the center column), rewritten in terms of a
// signed lateral cell offset (0 = center, negative = left, positive =
// right) instead of the 0-based CF_XMAP_SIZE column index — same three
// cases (left/center/right), same near-plane (depth-0) fan lookup.
function lateralXSeeds(geometry: ViewportGeometry, edge: Edge, lateral: number): { xl: number; xr: number } {
  if (lateral === 0) {
    const v = geometry[0]![edge]![0]!.x;
    return { xl: -v, xr: v };
  }
  if (lateral < 0) {
    const k = -lateral;
    return { xl: -geometry[k]![edge]![0]!.x, xr: -geometry[k - 1]![edge]![0]!.x };
  }
  const k = lateral;
  return { xl: geometry[k - 1]![edge]![0]!.x, xr: geometry[k]![edge]![0]!.x };
}

export interface FloorCeilBand {
  // Fractions of VIEW_SIZE_Y/VIEW_SIZE_X — caller scales into its own
  // viewport rect (this port's viewport isn't pixel-identical to the real
  // engine's 640x360, so everything here is resolution-independent).
  rowNear: number;
  rowFar: number;
  xlNear: number;
  xrNear: number;
  xlFar: number;
  xrFar: number;
}

// Reprojects a depth cell's floor/ceiling trapezoid from the real engine's
// geometry: near/far screen rows come straight from the geometry's y-decay
// at depth `d`/`d+1` (`row = y + MIDDLE_Y`, same formula the source uses
// for both f_table and c_table's `lineofs`); left/right bounds come from
// the undecayed near-plane (depth-0) lateral fan, reprojected per-row by
// the ratio of that row's y to the near-plane's own y (`create_tables`'
// `xl*(y1+K)/geometry[0][edge][0].y+MIDDLE_X`, K=+1 for floor, -2 for
// ceiling — both fudge constants preserved exactly as in the source).
export function floorCeilBand(geometry: ViewportGeometry, depth: number, lateral: number, edge: Edge): FloorCeilBand {
  const yNear = geometry[0]![edge]![depth]!.y;
  const yFar = geometry[0]![edge]![depth + 1]!.y;
  const y0 = geometry[0]![edge]![0]!.y;
  const k = edge === 0 ? 1 : -2;
  const { xl, xr } = lateralXSeeds(geometry, edge, lateral);
  const reproject = (seed: number, y: number) => (seed * (y + k)) / y0 + MIDDLE_X;
  return {
    rowNear: yNear + MIDDLE_Y,
    rowFar: yFar + MIDDLE_Y,
    xlNear: reproject(xl, yNear),
    xrNear: reproject(xr, yNear),
    xlFar: reproject(xl, yFar),
    xrFar: reproject(xr, yFar),
  };
}
