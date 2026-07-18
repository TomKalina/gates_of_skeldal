import { describe, expect, it } from 'vitest';
import { SD_PRIM_VIS, SD_SEC_VIS, type DungeonMap, type MapSide } from '../formats/map-file';
import { applyAction, A_HIDE_PRIM, A_HIDE_PRIM_SEC, A_HIDE_SEC, A_SHOW_HIDE_PRIM, A_SHOW_HIDE_SEC, A_SHOW_PRIM, A_SHOW_SEC } from './actions';

function side(flags: number): MapSide {
  return { prim: 1, sec: 1, oblouk: 0, flags, primAnim: 0, secAnim: 0, action: 0 };
}

function testMap(sideFlags: number): DungeonMap {
  return {
    mapName: 'Test',
    startSector: 0,
    startDirection: 0,
    sectors: [{ floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 0, 0, 0] }],
    sides: [side(sideFlags), side(0), side(0), side(0)],
    mainTextures: [],
    leftTextures: [],
    rightTextures: [],
    ceilTextures: [],
    floorTextures: [],
  };
}

describe('applyAction', () => {
  it('A_HIDE_PRIM clears SD_PRIM_VIS and reports a change', () => {
    const map = testMap(SD_PRIM_VIS);
    expect(applyAction(map, 0, 0, A_HIDE_PRIM)).toBe(true);
    expect(map.sides[0]!.flags & SD_PRIM_VIS).toBe(0);
  });

  it('A_HIDE_PRIM on an already-hidden side is a no-op and reports no change', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_HIDE_PRIM)).toBe(false);
    expect(map.sides[0]!.flags & SD_PRIM_VIS).toBe(0);
  });

  it('A_SHOW_PRIM sets SD_PRIM_VIS and reports a change', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_SHOW_PRIM)).toBe(true);
    expect(map.sides[0]!.flags & SD_PRIM_VIS).toBe(SD_PRIM_VIS);
  });

  it('A_SHOW_PRIM on an already-visible side is a no-op', () => {
    const map = testMap(SD_PRIM_VIS);
    expect(applyAction(map, 0, 0, A_SHOW_PRIM)).toBe(false);
  });

  it('A_SHOW_HIDE_PRIM always toggles unconditionally', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_SHOW_HIDE_PRIM)).toBe(true);
    expect(map.sides[0]!.flags & SD_PRIM_VIS).toBe(SD_PRIM_VIS);
    expect(applyAction(map, 0, 0, A_SHOW_HIDE_PRIM)).toBe(true);
    expect(map.sides[0]!.flags & SD_PRIM_VIS).toBe(0);
  });

  it('A_HIDE_SEC/A_SHOW_SEC/A_SHOW_HIDE_SEC mirror the PRIM behavior for SD_SEC_VIS', () => {
    const map = testMap(SD_SEC_VIS);
    expect(applyAction(map, 0, 0, A_HIDE_SEC)).toBe(true);
    expect(map.sides[0]!.flags & SD_SEC_VIS).toBe(0);
    expect(applyAction(map, 0, 0, A_SHOW_SEC)).toBe(true);
    expect(map.sides[0]!.flags & SD_SEC_VIS).toBe(SD_SEC_VIS);
    expect(applyAction(map, 0, 0, A_SHOW_HIDE_SEC)).toBe(true);
    expect(map.sides[0]!.flags & SD_SEC_VIS).toBe(0);
  });

  it('A_HIDE_PRIM_SEC clears both visibility flags at once', () => {
    const map = testMap(SD_PRIM_VIS | SD_SEC_VIS);
    expect(applyAction(map, 0, 0, A_HIDE_PRIM_SEC)).toBe(true);
    expect(map.sides[0]!.flags & (SD_PRIM_VIS | SD_SEC_VIS)).toBe(0);
  });

  it('A_HIDE_PRIM_SEC is a no-op when neither flag is set', () => {
    const map = testMap(0);
    expect(applyAction(map, 0, 0, A_HIDE_PRIM_SEC)).toBe(false);
  });

  it('returns false for a side that does not exist', () => {
    const map = testMap(0);
    expect(applyAction(map, 99, 0, A_HIDE_PRIM)).toBe(false);
  });

  it('returns false for an unhandled action code', () => {
    const map = testMap(SD_PRIM_VIS);
    expect(applyAction(map, 0, 0, 4 /* A_RUN_PRIM, not ported here */)).toBe(false);
  });
});
