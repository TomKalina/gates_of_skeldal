import { describe, expect, it } from 'vitest';
import { SD_PLAY_IMPS, SD_PRIM_VIS, type DungeonMap, type MapSide } from '../formats/map-file';
import { behind, canStep, computeViewCells, stepBackward, stepForward, turnLeft, turnRight } from './dungeon';

function wall(prim: number): MapSide {
  return { prim, sec: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS };
}
function open(): MapSide {
  return { prim: 0, sec: 0, flags: 0 };
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
    expect(cells[0]).toMatchObject({ depth: 0, sector: 0, frontWallTexture: null, leftWallTexture: 5, rightWallTexture: 6 });
    expect(cells[1]).toMatchObject({ depth: 1, sector: 1, frontWallTexture: 9, leftWallTexture: 8, rightWallTexture: 10 });
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
