import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, SD_PLAY_IMPS, SD_SEC_VIS, sideAt } from '../formats/map-file';
import { canStep, passageTextTrigger, stepForward, touchFrontWall, type Direction } from '../game/dungeon';
import { stepAllAnimations } from '../game/animation';
import { buildKryptaMap, FLOOR_STAIRS, TEX_DOOR, TEX_GRATE } from './map';

describe('buildKryptaMap', () => {
  it('starts on the S cell facing east with a walkable corridor ahead', () => {
    const { map, sectorAt } = buildKryptaMap();
    expect(map.startSector).toBe(sectorAt(1, 1));
    expect(map.startDirection).toBe(1);
    expect(canStep(map, map.startSector, 1)).toBe(true);
    expect(canStep(map, map.startSector, 0)).toBe(false);
  });

  it('links neighbouring sectors both ways', () => {
    const { map, sectorAt } = buildKryptaMap();
    const a = sectorAt(1, 1)!;
    const b = sectorAt(2, 1)!;
    expect(map.sectors[a]!.stepNext[1]).toBe(b);
    expect(map.sectors[b]!.stepNext[3]).toBe(a);
  });

  it('places a closed A_OPEN_CLOSE door on both faces of the D boundary', () => {
    const { map, sectorAt } = buildKryptaMap();
    const before = sectorAt(4, 3)!;
    const door = sectorAt(5, 3)!;
    const east = sideAt(map, before, 1)!;
    const west = sideAt(map, door, 3)!;
    for (const side of [east, west]) {
      expect(side.action).toBe(A_OPEN_CLOSE);
      expect(side.sec).toBe(TEX_DOOR);
      expect(side.flags & SD_SEC_VIS).toBeTruthy();
      expect(side.flags & SD_PLAY_IMPS).toBeTruthy();
    }
    expect(sideAt(map, door, 1)!.action).toBe(0);
  });

  it('opens the door through the engine touch handler and animation stepper', () => {
    const { map, sectorAt } = buildKryptaMap();
    const state = { map, sector: sectorAt(4, 3)!, direction: 1 as Direction };
    expect(canStep(map, state.sector, 1)).toBe(false);
    touchFrontWall(map, state.sector, 1);
    for (let i = 0; i < 8; i++) stepAllAnimations(map);
    expect(canStep(map, state.sector, 1)).toBe(true);
    expect(stepForward(state).sector).toBe(sectorAt(5, 3));
  });

  it('textures the grate wall and marks the stairs floor', () => {
    const { map, sectorAt } = buildKryptaMap();
    expect(sideAt(map, sectorAt(13, 9)!, 2)!.prim).toBe(TEX_GRATE);
    expect(map.sectors[sectorAt(14, 10)!]!.floor).toBe(FLOOR_STAIRS);
  });

  it('wires flavour texts to passable sides', () => {
    const { map, levelTexts, sectorAt } = buildKryptaMap();
    const id = passageTextTrigger(map, sectorAt(1, 1)!, 1);
    expect(id).toBeDefined();
    expect(levelTexts.get(id!)).toContain('Krypta');
  });
});
