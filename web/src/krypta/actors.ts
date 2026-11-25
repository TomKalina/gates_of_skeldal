import { VLS_DAMAGE, VLS_MAX, VLS_OBRAN_H, VLS_OBRAN_L, VLS_OBRAT, VLS_SILA, VLS_UTOK_H, VLS_UTOK_L } from '../game/combat';
import type { Consumable } from '../game/dungeon-view';
import type { PartyFighter } from '../game/encounter';
import { createMob, type Mob } from '../game/mobs';
import { ITEM_GOLD, ITEM_POTION, type MobKind, type MobSpawn } from './map';

export const MOB_SPRITE_RAT = 1;
export const MOB_SPRITE_SKELETON = 2;
export const MOB_SPRITE_CULTIST = 3;

interface CombatProfile {
  sila: number;
  obrat: number;
  utok: readonly [number, number];
  obrana: readonly [number, number];
  damage: number;
}

function vls(profile: CombatProfile): number[] {
  const values = new Array<number>(VLS_MAX).fill(0);
  values[VLS_SILA] = profile.sila;
  values[VLS_OBRAT] = profile.obrat;
  values[VLS_UTOK_L] = profile.utok[0];
  values[VLS_UTOK_H] = profile.utok[1];
  values[VLS_OBRAN_L] = profile.obrana[0];
  values[VLS_OBRAN_H] = profile.obrana[1];
  values[VLS_DAMAGE] = profile.damage;
  return values;
}

interface MobTemplate {
  name: string;
  sprite: number;
  lives: number;
  speed: number;
  dohled: number;
  profile: CombatProfile;
  drop: number;
}

const MOB_TEMPLATES: Record<MobKind, MobTemplate> = {
  r: { name: 'Krysa', sprite: MOB_SPRITE_RAT, lives: 9, speed: 5, dohled: 4, profile: { sila: 6, obrat: 14, utok: [4, 9], obrana: [2, 6], damage: 1 }, drop: 0 },
  s: { name: 'Oživlá kostra', sprite: MOB_SPRITE_SKELETON, lives: 24, speed: 8, dohled: 5, profile: { sila: 14, obrat: 8, utok: [8, 14], obrana: [4, 9], damage: 3 }, drop: ITEM_GOLD },
  c: { name: 'Kultista temných', sprite: MOB_SPRITE_CULTIST, lives: 30, speed: 7, dohled: 6, profile: { sila: 12, obrat: 12, utok: [9, 15], obrana: [5, 10], damage: 4 }, drop: ITEM_POTION },
};

export function createKryptaMobs(spawns: readonly MobSpawn[]): Mob[] {
  return spawns.map((spawn, i) => {
    const template = MOB_TEMPLATES[spawn.kind];
    const inv = new Array<number>(16).fill(0);
    inv[0] = template.drop;
    return createMob({
      name: template.name,
      sector: spawn.sector,
      id: i + 1,
      cisloVzoru: template.sprite,
      lives: template.lives,
      speed: template.speed,
      dohled: template.dohled,
      vlastnosti: vls(template.profile),
      inv,
    });
  });
}

export const KRYPTA_FIGHTERS: readonly PartyFighter[] = [
  { vls: vls({ sila: 12, obrat: 18, utok: [9, 15], obrana: [4, 9], damage: 4 }), reach: 4, cooldown: 12 },
  { vls: vls({ sila: 11, obrat: 16, utok: [8, 14], obrana: [4, 8], damage: 3 }), reach: 4, cooldown: 11 },
  { vls: vls({ sila: 8, obrat: 12, utok: [10, 18], obrana: [2, 6], damage: 5 }), reach: 4, cooldown: 16 },
  { vls: vls({ sila: 17, obrat: 12, utok: [10, 16], obrana: [6, 11], damage: 5 }), reach: 1, cooldown: 9 },
  { vls: vls({ sila: 18, obrat: 11, utok: [10, 17], obrana: [6, 12], damage: 6 }), reach: 1, cooldown: 9 },
];

export const KRYPTA_CONSUMABLES: ReadonlyMap<number, Consumable> = new Map([
  [ITEM_POTION, { heal: 20 }],
  [ITEM_GOLD, { gold: 25 }],
]);
