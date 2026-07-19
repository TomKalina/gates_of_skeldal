import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, SD_PLAY_IMPS, SD_PRIM_ANIM, SD_PRIM_FORV, SD_PRIM_GAB, SD_SEC_FORV, SD_SEC_GAB, toggleDoor, type DungeonMap, type MapSide } from '../formats/map-file';
import { stepAllAnimations, stepSide } from './animation';

// A door like the real sector 14/15 one: prim unused (pk=0), sec is a
// 7-frame sequence (sk=7) starting closed (sj=0), SD_PLAY_IMPS set.
function closedDoor(): MapSide {
  return { prim: 0, sec: 15, oblouk: 0, flags: SD_PLAY_IMPS, primAnim: 0, secAnim: 7, action: A_OPEN_CLOSE };
}

function singleSideMap(side: MapSide): DungeonMap {
  return {
    mapName: 'Test',
    startSector: 0,
    startDirection: 0,
    sectors: [{ floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 0, 0, 0], shaded: false }],
    sides: [side, side, side, side],
    mainTextures: [],
    leftTextures: [],
    rightTextures: [],
    ceilTextures: [],
    floorTextures: [],
    archLeftTextures: [],
    archRightTextures: [],
    fadeColor: { r: 0, g: 0, b: 0 },
    placedItems: new Map(),
  };
}

describe('stepSide — one-shot (door) animation', () => {
  it('does nothing to a side with no animation range on either channel', () => {
    const side: MapSide = { prim: 0, sec: 0, oblouk: 0, flags: 0, primAnim: 0, secAnim: 0, action: 0 };
    expect(stepSide(side)).toBe(false);
  });

  it('steps one frame per call toward the open end while SD_SEC_FORV is set', () => {
    const side = closedDoor();
    const map = singleSideMap(side);
    toggleDoor(map, 0, 0); // starts opening: sets SD_PRIM_FORV|SD_SEC_FORV
    expect(stepSide(side)).toBe(true);
    expect(side.secAnim >> 4).toBe(1);
    expect(stepSide(side)).toBe(true);
    expect(side.secAnim >> 4).toBe(2);
  });

  it('clamps at the frame count (fully open) and clears SD_PLAY_IMPS exactly on that step', () => {
    const side = closedDoor();
    const map = singleSideMap(side);
    toggleDoor(map, 0, 0);
    // 7 steps: secAnim goes 0->1->2->3->4->5->6->7. Stays blocked (SD_PLAY_IMPS
    // set) for all of them except the very last, which reaches the frame
    // count (7) and is where passability actually flips.
    for (let i = 0; i < 7; i++) {
      expect(side.flags & SD_PLAY_IMPS).toBe(SD_PLAY_IMPS);
      stepSide(side);
    }
    expect(side.secAnim >> 4).toBe(7);
    expect(side.flags & SD_PLAY_IMPS).toBe(0);

    // Further steps stay clamped, not overshooting.
    expect(stepSide(side)).toBe(false);
    expect(side.secAnim >> 4).toBe(7);
  });

  it('reversing direction after fully opening steps back down and re-blocks on reaching 0', () => {
    const side = closedDoor();
    const map = singleSideMap(side);
    toggleDoor(map, 0, 0); // opening
    for (let i = 0; i < 7; i++) stepSide(side);
    expect(side.secAnim >> 4).toBe(7);
    expect(side.flags & SD_PLAY_IMPS).toBe(0); // fully open, passable

    toggleDoor(map, 0, 0); // reverse: now closing
    expect(side.flags & SD_PLAY_IMPS).toBe(0); // still passable, hasn't moved yet
    for (let i = 0; i < 6; i++) {
      stepSide(side);
      expect(side.flags & SD_PLAY_IMPS).toBe(0); // still passable until fully closed
    }
    expect(side.secAnim >> 4).toBe(1);
    stepSide(side);
    expect(side.secAnim >> 4).toBe(0);
    expect(side.flags & SD_PLAY_IMPS).toBe(SD_PLAY_IMPS);
  });

  it('a side with pk=0, sk=0 elsewhere but action=A_OPEN_CLOSE never changes (guarded by the early return)', () => {
    const side: MapSide = { prim: 0, sec: 0, oblouk: 0, flags: SD_PLAY_IMPS, primAnim: 0, secAnim: 0, action: A_OPEN_CLOSE };
    expect(stepSide(side)).toBe(false);
    expect(side.flags & SD_PLAY_IMPS).toBe(SD_PLAY_IMPS);
  });
});

describe('stepSide — continuous (SD_PRIM_ANIM) animation', () => {
  it('wraps back to 0 once past the frame count, instead of clamping', () => {
    // primAnim upper nibble starts at 3, count 3 (i.e. already at the max);
    // SD_PRIM_ANIM + SD_PRIM_FORV set, stepping forward should wrap to 0.
    const side: MapSide = { prim: 1, sec: 0, oblouk: 0, flags: SD_PRIM_ANIM | SD_PRIM_FORV, primAnim: (3 << 4) | 3, secAnim: 0, action: 0 };
    expect(stepSide(side)).toBe(true);
    expect(side.primAnim >> 4).toBe(0);
  });

  it('SD_PRIM_GAB ping-pongs direction at each end instead of wrapping', () => {
    // At the top end (j===k) with GAB set: direction flips before stepping,
    // so it steps *down* this call instead of wrapping to 0.
    const side: MapSide = { prim: 1, sec: 0, oblouk: 0, flags: SD_PRIM_ANIM | SD_PRIM_GAB | SD_PRIM_FORV, primAnim: (3 << 4) | 3, secAnim: 0, action: 0 };
    stepSide(side);
    expect(side.primAnim >> 4).toBe(2);
    expect(side.flags & SD_PRIM_FORV).toBe(0); // direction flipped
  });

  it('the sec channel behaves the same way independently of prim, using SD_SEC_GAB/SD_SEC_FORV', () => {
    const side: MapSide = { prim: 0, sec: 1, oblouk: 0, flags: (0x1000 /* SD_SEC_ANIM */) | SD_SEC_GAB | SD_SEC_FORV, primAnim: 0, secAnim: (3 << 4) | 3, action: 0 };
    stepSide(side);
    expect(side.secAnim >> 4).toBe(2);
    expect(side.flags & SD_SEC_FORV).toBe(0);
  });
});

describe('stepAllAnimations', () => {
  function blankSide(): MapSide {
    return { prim: 0, sec: 0, oblouk: 0, flags: 0, primAnim: 0, secAnim: 0, action: 0 };
  }

  it('steps the one animating side in the map and reports a change', () => {
    const door = closedDoor();
    const map: DungeonMap = { ...singleSideMap(door), sides: [door, blankSide(), blankSide(), blankSide()] };
    toggleDoor(map, 0, 0);
    expect(stepAllAnimations(map)).toBe(true);
    expect(map.sides[0]!.secAnim >> 4).toBe(1);
    // The blank sides are untouched.
    expect(map.sides[1]!.secAnim).toBe(0);
  });

  it('reports false once every side has settled (no more frames to advance)', () => {
    const map = singleSideMap(blankSide());
    expect(stepAllAnimations(map)).toBe(false);
  });
});
