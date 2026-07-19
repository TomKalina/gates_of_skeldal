import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, SD_LEFT_ARC, SD_PLAY_IMPS, SD_PRIM_VIS, SD_RIGHT_ARC, SD_SEC_VIS, SD_TRANSPARENT, type DungeonMap, type MapSide } from '../formats/map-file';
import { behind, canStep, computeVisibleGrid, computeViewCells, pendingTransition, stepBackward, stepForward, turnLeft, turnRight } from './dungeon';

function wall(prim: number): MapSide {
  return { prim, sec: 0, oblouk: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0, action: 0 };
}
// A real open passage is also SD_TRANSPARENT — verified against LESPRED.MAP,
// where every side with no wall image (SD_PRIM_VIS unset) also has this bit
// set, since visibility past an open side is gated by SD_TRANSPARENT, not
// SD_PRIM_VIS (see dungeon.ts's computeVisibleGrid).
function open(): MapSide {
  return { prim: 0, sec: 0, oblouk: 0, flags: SD_TRANSPARENT, primAnim: 0, secAnim: 0, action: 0 };
}

// A 2-sector corridor: sector 0 (start, facing East) is open east into
// sector 1, a dead end (east wall blocks further movement and view).
// Side order per sector is [N, E, S, W].
function buildTestMap(): DungeonMap {
  const sides: MapSide[] = [
    // sector 0
    wall(5), // N
    open(), // E -> sector 1
    wall(6), // S
    wall(7), // W
    // sector 1
    wall(8), // N
    wall(9), // E (dead end)
    wall(10), // S
    open(), // W -> back to sector 0
  ];
  return {
    mapName: 'Test',
    startSector: 0,
    startDirection: 1,
    sectors: [
      { floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 1, 0, 0], shaded: false },
      { floor: 1, ceil: 1, sectorType: 1, stepNext: [1, 1, 1, 0], shaded: false },
    ],
    sides,
    mainTextures: [],
    leftTextures: [],
    rightTextures: [],
    ceilTextures: [],
    floorTextures: [],
    archLeftTextures: [],
    archRightTextures: [],
    fadeColor: { r: 0, g: 0, b: 0 },
    placedItems: new Map(),
    mapTransitions: new Map(),
  };
}

describe('direction helpers', () => {
  it('rotate correctly', () => {
    expect(turnLeft(1)).toBe(0);
    expect(turnRight(1)).toBe(2);
    expect(behind(1)).toBe(3);
    expect(turnLeft(0)).toBe(3);
    expect(turnRight(3)).toBe(0);
  });
});

describe('computeViewCells', () => {
  it('stops at the first visible front wall and reports side walls per depth', () => {
    const map = buildTestMap();
    const cells = computeViewCells(map, 0, 1);

    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ depth: 0, lateral: 0, sector: 0, frontWallTexture: null, leftWallTexture: 5, rightWallTexture: 6 });
    expect(cells[1]).toMatchObject({ depth: 1, lateral: 0, sector: 1, frontWallTexture: 9, leftWallTexture: 8, rightWallTexture: 10 });
  });

  it('adds the primAnim upper-nibble animation-frame offset to the texture index', () => {
    const map = buildTestMap();
    // sector 0's east side is open in the base fixture; give it a visible,
    // animated wall instead (prim=5, currently on frame 2 of its sequence).
    const animated: MapSide = { prim: 5, sec: 0, oblouk: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0x23, secAnim: 0, action: 0 };
    const animatedMap: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? animated : s)) };

    const cells = computeViewCells(animatedMap, 0, 1);
    expect(cells[0]?.frontWallTexture).toBe(5 + 2);
  });

  it('reports a door front side via its independent secondary texture slot', () => {
    // Verified against LESPRED.MAP's sector 14/15 door: prim=0 (nothing in
    // the primary slot) but sec=15 (a closed wooden door), SD_SEC_VIS set,
    // action=A_OPEN_CLOSE. The primary and secondary texture questions are
    // fully independent (see visibleSecTexture in dungeon.ts).
    const map = buildTestMap();
    const door: MapSide = { prim: 0, sec: 9, oblouk: 0, flags: SD_PLAY_IMPS | SD_SEC_VIS, primAnim: 0, secAnim: 0, action: A_OPEN_CLOSE };
    const doorMap: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? door : s)) };

    const cells = computeViewCells(doorMap, 0, 1);
    expect(cells[0]).toMatchObject({ frontWallTexture: null, frontSecTexture: 9, frontIsDoor: true });
  });

  it('draws a decorative arch overlay only when SD_LEFT_ARC/SD_RIGHT_ARC is set, independent of frontWallTexture', () => {
    // Verified against real LESPRED.MAP data: 623/1204 sides have a
    // non-zero oblouk&0xf, but only 218 of those also carry SD_LEFT_ARC or
    // SD_RIGHT_ARC — the rest are inert. Both halves can be gated
    // independently (a side can draw one, both, or neither).
    const map = buildTestMap();
    const archOnLeftOnly: MapSide = { prim: 5, sec: 0, oblouk: 2, flags: SD_PLAY_IMPS | SD_PRIM_VIS | SD_LEFT_ARC, primAnim: 0, secAnim: 0, action: 0 };
    const withArc: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? archOnLeftOnly : s)) };

    const cells = computeViewCells(withArc, 0, 1);
    expect(cells[0]?.frontArchLeftTexture).toBe(2);
    expect(cells[0]?.frontArchRightTexture).toBeNull();
  });

  it('an oblouk arch index with neither arc flag set draws no arch at all (the common, inert case)', () => {
    const map = buildTestMap();
    const inertArchIndex: MapSide = { prim: 5, sec: 0, oblouk: 1, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0, action: 0 };
    const inertMap: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? inertArchIndex : s)) };

    const cells = computeViewCells(inertMap, 0, 1);
    expect(cells[0]?.frontArchLeftTexture).toBeNull();
    expect(cells[0]?.frontArchRightTexture).toBeNull();
  });

  it('the arch index adds the same primAnim upper-nibble offset the main texture gets (GET_OBLOUK)', () => {
    const map = buildTestMap();
    const animatedArch: MapSide = { prim: 5, sec: 0, oblouk: 1, flags: SD_PLAY_IMPS | SD_PRIM_VIS | SD_RIGHT_ARC, primAnim: 0x20, secAnim: 0, action: 0 };
    const animatedMap: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? animatedArch : s)) };

    const cells = computeViewCells(animatedMap, 0, 1);
    expect(cells[0]?.frontArchRightTexture).toBe(1 + 2);
  });
});

describe('computeVisibleGrid', () => {
  it('sees sideways through a transparent side into an adjacent sector', () => {
    // Facing East (1): dirs[0]=North (left), dirs[2]=South (right). Sector
    // 0's north side is open into sector 2 — a real map's window or open
    // doorway would let you see that sector laterally, at the same depth,
    // the same way LESPRED.MAP's start sector reveals a sector to the side
    // through its transparent south window.
    const map = buildTestMap();
    const lateralMap: DungeonMap = {
      ...map,
      sectors: map.sectors.map((s, i) => (i === 0 ? { ...s, stepNext: [2, 1, 0, 0] as const } : s)).concat({
        floor: 1,
        ceil: 1,
        sectorType: 1,
        stepNext: [0, 0, 0, 0],
        shaded: false,
      }),
      // sector 0's north side, now open (transparent) and leading sideways to sector 2
      sides: map.sides.map((s, i) => (i === 0 ? open() : s)).concat(wall(20), wall(21), wall(22), wall(23)),
    };

    const grid = computeVisibleGrid(lateralMap, 0, 1);
    const lateralCell = grid.find((cell) => cell.lateral === -1);
    expect(lateralCell).toMatchObject({ depth: 0, sector: 2 });
  });
});

describe('movement', () => {
  it('canStep reflects SD_PLAY_IMPS, not SD_PRIM_VIS', () => {
    const map = buildTestMap();
    expect(canStep(map, 0, 1)).toBe(true); // open east
    expect(canStep(map, 1, 1)).toBe(false); // walled dead end
  });

  it('stepForward moves through an open side and stays put at a wall', () => {
    const map = buildTestMap();
    const afterFirstStep = stepForward({ map, sector: 0, direction: 1 });
    expect(afterFirstStep.sector).toBe(1);

    const afterSecondStep = stepForward(afterFirstStep);
    expect(afterSecondStep.sector).toBe(1);
  });

  it('stepBackward walks back the way it came', () => {
    const map = buildTestMap();
    const state = { map, sector: 1, direction: 1 as const };
    const back = stepBackward(state);
    expect(back.sector).toBe(0);
  });

  it('pendingTransition only fires on a blocked side that carries a map transition', () => {
    const map: DungeonMap = {
      ...buildTestMap(),
      mapTransitions: new Map([
        [1 * 4 + 1, { mapName: 'SKRETI.MAP', startSector: 12, startDirection: 3 }],
        // An open side never fires one even if (hypothetically) tagged —
        // real MA_LOADL data is always MC_PASSFAIL-gated (see map-file.ts),
        // so this guards the "blocked" precondition itself, not just data
        // presence.
        [0 * 4 + 1, { mapName: 'SKRETI.MAP', startSector: 0, startDirection: 0 }],
      ]),
    };
    expect(pendingTransition(map, 1, 1)).toEqual({ mapName: 'SKRETI.MAP', startSector: 12, startDirection: 3 });
    // Same sector's other blocked walls carry no transition.
    expect(pendingTransition(map, 1, 0)).toBeUndefined();
    expect(pendingTransition(map, 0, 1)).toBeUndefined();
  });
});
