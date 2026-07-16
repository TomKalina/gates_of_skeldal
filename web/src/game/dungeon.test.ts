import { describe, expect, it } from 'vitest';
import { SD_PLAY_IMPS, SD_PRIM_VIS, SD_TRANSPARENT, type DungeonMap, type MapSide } from '../formats/map-file';
import { behind, canStep, computeVisibleGrid, computeViewCells, stepBackward, stepForward, turnLeft, turnRight } from './dungeon';

function wall(prim: number): MapSide {
  return { prim, sec: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0 };
}
// A real open passage is also SD_TRANSPARENT — verified against LESPRED.MAP,
// where every side with no wall image (SD_PRIM_VIS unset) also has this bit
// set, since visibility past an open side is gated by SD_TRANSPARENT, not
// SD_PRIM_VIS (see dungeon.ts's computeVisibleGrid).
function open(): MapSide {
  return { prim: 0, sec: 0, flags: SD_TRANSPARENT, primAnim: 0, secAnim: 0 };
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
      { floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 1, 0, 0] },
      { floor: 1, ceil: 1, sectorType: 1, stepNext: [1, 1, 1, 0] },
    ],
    sides,
    mainTextures: [],
    leftTextures: [],
    rightTextures: [],
    ceilTextures: [],
    floorTextures: [],
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
    const animated: MapSide = { prim: 5, sec: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0x23, secAnim: 0 };
    const animatedMap: DungeonMap = { ...map, sides: map.sides.map((s, i) => (i === 1 ? animated : s)) };

    const cells = computeViewCells(animatedMap, 0, 1);
    expect(cells[0]?.frontWallTexture).toBe(5 + 2);
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
});
