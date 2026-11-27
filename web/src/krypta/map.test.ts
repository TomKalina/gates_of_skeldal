import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, SD_PLAY_IMPS, SD_SEC_VIS, sideAt } from '../formats/map-file';
import { canStep, passageTextTrigger, stepForward, touchFrontWall, type Direction } from '../game/dungeon';
import { stepAllAnimations } from '../game/animation';
import { MA, MC, runMacros, textIndex, twoParms, type MacroHost } from '../game/macros';
import { buildKryptaMap, FLOOR_STAIRS, ITEM_KEY, TEX_DOOR, TEX_GRATE, TEXT_GRATE_LOCKED, TEXT_GRATE_OPENED } from './map';

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

  it('puts a closed grate between the corridor and the stairs cell', () => {
    const { map, sectorAt } = buildKryptaMap();
    const above = sectorAt(13, 9)!;
    expect(sideAt(map, above, 2)!.sec).toBe(TEX_GRATE);
    expect(canStep(map, above, 2)).toBe(false);
    expect(map.sectors[sectorAt(14, 10)!]!.floor).toBe(FLOOR_STAIRS);
    expect(canStep(map, sectorAt(13, 10)!, 1)).toBe(true);
  });

  it('runs the grate lock macro: locked text without the key, opening text with it', () => {
    const { map, macros, sectorAt } = buildKryptaMap();
    const side = sectorAt(13, 9)! * 4 + 2;
    const run = (hasKey: boolean) => {
      const texts: number[] = [];
      const host: MacroHost = {
        sideFlags: (s) => map.sides[s]!.flags,
        monsterInGame: () => false,
        monsterInRoom: () => false,
        haveItem: (item) => hasKey && item === ITEM_KEY,
        testFlag: () => false,
        random100: () => 0,
        lastSendAction: 0,
        exec: (action, at) => {
          if (action.action === MA.TEXTL) texts.push(textIndex(action));
          if (action.action === MA.LOCK) {
            if (host.haveItem(twoParms(action).parm1)) return false;
            runMacros(macros, new Uint8Array(macros.count), at, MC.LOCKINFO, host);
            return true;
          }
        },
      };
      runMacros(macros, new Uint8Array(macros.count), side, MC.TOUCHSUC, host);
      return texts;
    };
    expect(run(false)).toEqual([TEXT_GRATE_LOCKED]);
    expect(run(true)).toEqual([TEXT_GRATE_OPENED]);
  });

  it('ends the game when passing from the grate cell onto the stairs', () => {
    const { macros, sectorAt } = buildKryptaMap();
    const list = macros.records.get(sectorAt(13, 10)! * 4 + 1)!;
    expect(list.map((a) => [a.action, a.flags])).toEqual([[MA.ENDGM, MC.PASSSUC]]);
  });

  it('spawns mobs from the layout and places loot on the floor', () => {
    const { map, mobSpawns, sectorAt } = buildKryptaMap();
    expect(mobSpawns.map((s) => s.kind).sort()).toEqual(['c', 'c', 'r', 's', 's']);
    expect(map.placedItems.get(sectorAt(14, 1)! * 4 + 1)).toEqual([ITEM_KEY]);
  });

  it('wires flavour texts to passable sides', () => {
    const { map, levelTexts, sectorAt } = buildKryptaMap();
    const id = passageTextTrigger(map, sectorAt(1, 1)!, 1);
    expect(id).toBeDefined();
    expect(levelTexts.get(id!)).toContain('Krypta');
  });
});
