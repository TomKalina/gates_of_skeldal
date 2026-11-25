import { pushFloorItemGroup, sideAt, SD_PLAY_IMPS, type DungeonMap } from '../formats/map-file';
import { defaultRnd, vypocetZasahu, type Rnd } from './combat';
import { findPath, MC_PLAYER, SD_MONST_IMPS, type MobMap } from './mob-ai';
import type { Mob } from './mobs';
import type { Character } from './party';

export const MOB_BLOCK = SD_MONST_IMPS | SD_PLAY_IMPS;

export interface PartyFighter {
  vls: readonly number[];
  reach: number;
  cooldown: number;
}

export interface Encounter {
  mobs: Mob[];
  hp: number[];
  maxHp: number[];
  fighters: readonly PartyFighter[];
  mobCooldown: number[];
  memberCooldown: number[];
  gold: number;
}

export type EncounterEvent =
  | { kind: 'mobHit'; mob: Mob; member: number; damage: number }
  | { kind: 'mobMiss'; mob: Mob; member: number }
  | { kind: 'mobMoved'; mob: Mob }
  | { kind: 'memberHit'; member: number; mob: Mob; damage: number; killed: boolean }
  | { kind: 'memberMiss'; member: number; mob: Mob }
  | { kind: 'noTarget'; member: number };

export function createEncounter(mobs: Mob[], party: readonly Character[], fighters: readonly PartyFighter[]): Encounter {
  return {
    mobs,
    hp: party.map((c) => c.stats.maxHp),
    maxHp: party.map((c) => c.stats.maxHp),
    fighters,
    mobCooldown: mobs.map((m) => m.speed),
    memberCooldown: party.map(() => 0),
    gold: 0,
  };
}

export function aliveMobs(enc: Encounter): Mob[] {
  return enc.mobs.filter((m) => m.lives > 0);
}

export function mobsInSector(enc: Encounter, sector: number): Mob[] {
  return enc.mobs.filter((m) => m.lives > 0 && m.sector === sector);
}

export function partyAlive(enc: Encounter): boolean {
  return enc.hp.some((hp) => hp > 0);
}

export function createMobMap(map: DungeonMap, enc: Encounter, partySector: number): MobMap {
  return {
    sectorCount: map.sectors.length,
    sideFlags: (sector, dir) => sideAt(map, sector, dir)?.flags ?? MOB_BLOCK,
    stepNext: (sector, dir) => map.sectors[sector]?.stepNext[dir] ?? 0,
    coordFlags: (sector) => (sector === partySector ? MC_PLAYER : 0),
    mobsOnSector: (sector) => mobsInSector(enc, sector).length,
    mobAt: (sector) => mobsInSector(enc, sector)[0] ?? null,
  };
}

function adjacentDirection(mobMap: MobMap, from: number, to: number): number {
  for (let d = 0; d < 4; d++) {
    if (mobMap.sideFlags(from, d) & MOB_BLOCK) continue;
    if (mobMap.stepNext(from, d) === to) return d;
  }
  return -1;
}

function pickAliveMember(enc: Encounter, rnd: Rnd): number {
  const alive = enc.hp.flatMap((hp, i) => (hp > 0 ? [i] : []));
  return alive[rnd(alive.length)] ?? -1;
}

export function tickEncounter(enc: Encounter, map: DungeonMap, partySector: number, rnd: Rnd = defaultRnd): EncounterEvent[] {
  const events: EncounterEvent[] = [];
  enc.memberCooldown = enc.memberCooldown.map((c) => Math.max(0, c - 1));
  if (!partyAlive(enc)) return events;
  const mobMap = createMobMap(map, enc, partySector);
  enc.mobs.forEach((mob, i) => {
    if (mob.lives <= 0) return;
    if ((enc.mobCooldown[i] ?? 0) > 0) {
      enc.mobCooldown[i] = (enc.mobCooldown[i] ?? 0) - 1;
      return;
    }
    const attackDir = adjacentDirection(mobMap, mob.sector, partySector);
    if (attackDir !== -1) {
      const member = pickAliveMember(enc, rnd);
      const fighter = enc.fighters[member];
      if (member === -1 || !fighter) return;
      mob.dir = attackDir;
      enc.mobCooldown[i] = mob.speed;
      const damage = Math.max(0, vypocetZasahu(mob.vlastnosti, fighter.vls, 1, 0, 0, false, rnd));
      if (damage > 0) {
        enc.hp[member] = Math.max(0, (enc.hp[member] ?? 0) - damage);
        events.push({ kind: 'mobHit', mob, member, damage });
      } else {
        events.push({ kind: 'mobMiss', mob, member });
      }
      return;
    }
    const path = findPath(mobMap, mob.sector, partySector, MOB_BLOCK, 1);
    if (!path || path.length < 2 || path.length > mob.dohled) return;
    const next = path[0]!;
    const dir = adjacentDirection(mobMap, mob.sector, next);
    if (dir === -1 || mobMap.mobsOnSector(next) > 0) return;
    mob.sector = next;
    mob.dir = dir;
    enc.mobCooldown[i] = mob.speed;
    events.push({ kind: 'mobMoved', mob });
  });
  return events;
}

function targetAhead(enc: Encounter, map: DungeonMap, sector: number, facing: number, reach: number): Mob | undefined {
  let current = sector;
  for (let distance = 0; distance < reach; distance++) {
    const side = sideAt(map, current, facing);
    if (!side || side.flags & SD_PLAY_IMPS) return undefined;
    current = map.sectors[current]?.stepNext[facing] ?? 0;
    const mob = mobsInSector(enc, current)[0];
    if (mob) return mob;
  }
  return undefined;
}

export function partyAttack(enc: Encounter, map: DungeonMap, sector: number, facing: number, member: number, rnd: Rnd = defaultRnd): EncounterEvent | null {
  const fighter = enc.fighters[member];
  if (!fighter || (enc.hp[member] ?? 0) <= 0 || (enc.memberCooldown[member] ?? 0) > 0) return null;
  const mob = targetAhead(enc, map, sector, facing, fighter.reach);
  if (!mob) return { kind: 'noTarget', member };
  enc.memberCooldown[member] = fighter.cooldown;
  const damage = Math.max(0, vypocetZasahu(fighter.vls, mob.vlastnosti, 1, 0, 0, true, rnd));
  if (damage <= 0) return { kind: 'memberMiss', member, mob };
  mob.lives = Math.max(0, mob.lives - damage);
  const killed = mob.lives === 0;
  if (killed) {
    const drop = mob.inv.filter((item) => item !== 0);
    pushFloorItemGroup(map, mob.sector, facing, drop);
    enc.gold += mob.money;
  }
  return { kind: 'memberHit', member, mob, damage, killed };
}

export function healMember(enc: Encounter, member: number, amount: number): number {
  const before = enc.hp[member] ?? 0;
  if (before <= 0) return 0;
  enc.hp[member] = Math.min(enc.maxHp[member] ?? before, before + amount);
  return (enc.hp[member] ?? 0) - before;
}
