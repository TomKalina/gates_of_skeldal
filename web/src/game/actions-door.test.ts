import { describe, expect, it } from 'vitest';
import { SD_PRIM_ANIM, SD_PRIM_FORV, SD_SEC_ANIM, SD_SEC_FORV, type DungeonMap, type MapSide } from '../formats/map-file';
import { applyAction, A_CLOSE_DOOR, A_OPEN_DOOR, A_RUN_PRIM, A_RUN_SEC } from './actions';

function side(flags: number): MapSide {
  return { prim: 1, sec: 1, oblouk: 0, sectorTag: 0, sideTag: 0, flags, primAnim: 0, secAnim: 0, action: 0 };
}

function testMap(sideFlags: number): DungeonMap {
  return {
    mapName: 'Test',
    startSector: 0,
    startDirection: 0,
    sectors: [{ floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 0, 0, 0], shaded: false }],
    sides: [side(sideFlags), side(0), side(0), side(0)],
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
    textTriggers: new Map(),
    touchTextTriggers: new Map(),
  };
}

describe('applyAction door and run cases', () => {
  it('A_OPEN_DOOR sets both FORV flags on a closed side', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_OPEN_DOOR)).toBe(true);
    expect(map.sides[0]!.flags).toBe(SD_PRIM_FORV | SD_SEC_FORV);
  });

  it('A_OPEN_DOOR on an open side is a no-op', () => {
    const map = testMap(SD_PRIM_FORV | SD_SEC_FORV);
    expect(applyAction(map, 0, 0, A_OPEN_DOOR)).toBe(false);
  });

  it('A_OPEN_DOOR leaves SD_PRIM_FORV alone while prim is continuously animating', () => {
    const map = testMap(SD_PRIM_ANIM);
    expect(applyAction(map, 0, 0, A_OPEN_DOOR)).toBe(true);
    expect(map.sides[0]!.flags).toBe(SD_PRIM_ANIM | SD_SEC_FORV);
  });

  it('A_CLOSE_DOOR clears both FORV flags on an open side', () => {
    const map = testMap(SD_PRIM_FORV | SD_SEC_FORV);
    expect(applyAction(map, 0, 0, A_CLOSE_DOOR)).toBe(true);
    expect(map.sides[0]!.flags).toBe(0);
  });

  it('A_CLOSE_DOOR on a closed side is a no-op', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_CLOSE_DOOR)).toBe(false);
  });

  it('A_RUN_PRIM and A_RUN_SEC set the ANIM flags', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_RUN_PRIM)).toBe(true);
    expect(applyAction(map, 0, 0, A_RUN_SEC)).toBe(true);
    expect(map.sides[0]!.flags).toBe(SD_PRIM_ANIM | SD_SEC_ANIM);
  });
});
