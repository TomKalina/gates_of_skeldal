import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, SD_APPLY_2ND, SD_PLAY_IMPS, SD_TRANSPARENT, type DungeonMap, type MapSector, type MapSide } from '../formats/map-file';
import { VLS_DAMAGE, VLS_MAX, VLS_OBRAN_H, VLS_OBRAN_L, VLS_UTOK_H, VLS_UTOK_L } from './combat';
import { createEncounter, createMobMap, healMember, MOB_BLOCK, partyAttack, tickEncounter, type PartyFighter } from './encounter';
import { createMob } from './mobs';
import { HUMAN_PLACES, HUMAN_RINGS, MAX_INV, type Character } from './party';

const open = (): MapSide => ({ prim: 0, sec: 0, flags: SD_TRANSPARENT, primAnim: 0, secAnim: 0, oblouk: 0, action: 0, sectorTag: 0, sideTag: 0 });
const wall = (): MapSide => ({ ...open(), flags: SD_PLAY_IMPS });

function corridor(length: number, doorAfter?: number): DungeonMap {
  const sectors: MapSector[] = [{ floor: 0, ceil: 0, sectorType: 0, stepNext: [0, 0, 0, 0], shaded: false }];
  const sides: MapSide[] = [wall(), wall(), wall(), wall()];
  for (let s = 1; s <= length; s++) {
    sectors.push({ floor: 1, ceil: 1, sectorType: 0, stepNext: [0, s < length ? s + 1 : 0, 0, s > 1 ? s - 1 : 0], shaded: false });
    const east = s < length ? open() : wall();
    const west = s > 1 ? open() : wall();
    if (doorAfter === s) east.flags = SD_PLAY_IMPS | SD_TRANSPARENT | SD_APPLY_2ND;
    if (doorAfter !== undefined && doorAfter + 1 === s) west.flags = SD_PLAY_IMPS | SD_TRANSPARENT | SD_APPLY_2ND;
    if (doorAfter === s) east.action = A_OPEN_CLOSE;
    sides.push(wall(), east, wall(), west);
  }
  return {
    mapName: 'TEST', startSector: 1, startDirection: 1, fadeColor: { r: 0, g: 0, b: 0 }, sectors, sides,
    mainTextures: [], leftTextures: [], rightTextures: [], ceilTextures: [], floorTextures: [], archLeftTextures: [], archRightTextures: [],
    placedItems: new Map(), mapTransitions: new Map(), textTriggers: new Map(), touchTextTriggers: new Map(),
  };
}

function stats(attack: number, defense: number, damage: number): number[] {
  const v = new Array<number>(VLS_MAX).fill(0);
  v[VLS_UTOK_L] = attack;
  v[VLS_UTOK_H] = attack;
  v[VLS_OBRAN_L] = defense;
  v[VLS_OBRAN_H] = defense;
  v[VLS_DAMAGE] = damage;
  return v;
}

const hero: Character = {
  name: 'Kall', portraitIndex: 0, female: false,
  stats: { strength: 10, magic: 0, speed: 10, dexterity: 10, maxHp: 30, maxMana: 0, stamina: 0, hpRegen: 0, mpRegen: 0, staminaRegen: 0 },
  level: 1, exp: 0, bonusPoints: 0, wearing: new Array<number>(HUMAN_PLACES).fill(0), rings: new Array<number>(HUMAN_RINGS).fill(0),
  arrows: 0, invSize: 6, inv: new Array<number>(MAX_INV).fill(0),
};
const fighter: PartyFighter = { vls: stats(10, 2, 3), reach: 1, cooldown: 3 };
const noRandom = () => 0;

describe('encounter', () => {
  it('exposes the party sector and walls to mob AI through the MobMap adapter', () => {
    const map = corridor(3);
    const enc = createEncounter([createMob({ name: 'Krysa', sector: 3 })], [hero], [fighter]);
    const mobMap = createMobMap(map, enc, 1);
    expect(mobMap.coordFlags(1)).not.toBe(0);
    expect(mobMap.mobsOnSector(3)).toBe(1);
    expect(mobMap.sideFlags(1, 0) & MOB_BLOCK).toBeTruthy();
    expect(mobMap.stepNext(1, 1)).toBe(2);
  });

  it('walks a mob toward the party within sight and then attacks', () => {
    const map = corridor(4);
    const mob = createMob({ name: 'Kostra', sector: 4, speed: 0, dohled: 5, vlastnosti: stats(12, 0, 4) });
    const enc = createEncounter([mob], [hero], [{ ...fighter, vls: stats(0, 2, 0) }]);
    tickEncounter(enc, map, 1, noRandom);
    expect(mob.sector).toBe(3);
    tickEncounter(enc, map, 1, noRandom);
    expect(mob.sector).toBe(2);
    const events = tickEncounter(enc, map, 1, noRandom);
    expect(events).toEqual([{ kind: 'mobHit', mob, member: 0, damage: 14 }]);
    expect(enc.hp[0]).toBe(16);
  });

  it('keeps a mob out of sight range or behind a closed door idle', () => {
    const far = createMob({ name: 'Krysa', sector: 4, speed: 0, dohled: 2 });
    const enc = createEncounter([far], [hero], [fighter]);
    expect(tickEncounter(enc, corridor(4), 1, noRandom)).toEqual([]);
    const blocked = createMob({ name: 'Krysa', sector: 3, speed: 0, dohled: 9 });
    const enc2 = createEncounter([blocked], [hero], [fighter]);
    expect(tickEncounter(enc2, corridor(3, 1), 1, noRandom)).toEqual([]);
    expect(blocked.sector).toBe(3);
  });

  it('lets a party member kill an adjacent mob, dropping its loot, then waits out the cooldown', () => {
    const map = corridor(2);
    const inv = new Array<number>(16).fill(0);
    inv[0] = 7;
    const mob = createMob({ name: 'Krysa', sector: 2, lives: 5, inv });
    const enc = createEncounter([mob], [hero], [fighter]);
    const event = partyAttack(enc, map, 1, 1, 0, noRandom);
    expect(event).toMatchObject({ kind: 'memberHit', killed: true });
    expect(mob.lives).toBe(0);
    expect(map.placedItems.get(2 * 4 + 1)).toEqual([7]);
    expect(partyAttack(enc, map, 1, 1, 0, noRandom)).toBeNull();
  });

  it('heals only living members up to their max HP', () => {
    const enc = createEncounter([], [hero, hero], [fighter, fighter]);
    enc.hp = [20, 0];
    expect(healMember(enc, 0, 50)).toBe(10);
    expect(healMember(enc, 1, 50)).toBe(0);
  });
});
