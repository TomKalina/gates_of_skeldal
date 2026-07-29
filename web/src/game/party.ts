import type { AttributeRanges } from './attribute-wheel';

// POCET_POSTAV in globals.h
export const MAX_PARTY_SIZE = 6;
export const PORTRAIT_COUNT = 8;

export interface RolledStats {
  strength: number;
  magic: number;
  speed: number;
  dexterity: number;
  maxHp: number;
  maxMana: number;
  stamina: number;
  hpRegen: number;
  mpRegen: number;
  staminaRegen: number;
}

export interface Character {
  name: string;
  portraitIndex: number;
  female: boolean;
  stats: RolledStats;
  level: number;
  exp: number;
  bonusPoints: number;
}

// chargen.c displays the 8 portraits in this file-index order (poradi[]),
// and flags the display SLOT — not the file index — as female (women[]):
// slot 4 (portrait file 1) is female even though portraits 2-4 aren't, so
// this isn't a simple threshold on the raw index.
export const PORTRAIT_DISPLAY_ORDER = [0, 2, 3, 4, 1, 5, 6, 7] as const;
const FEMALE_PORTRAITS = new Set<number>(
  PORTRAIT_DISPLAY_ORDER.filter((_, slot) => slot >= 4),
);

export function isPortraitFemale(portraitIndex: number): boolean {
  return FEMALE_PORTRAITS.has(portraitIndex);
}

function rollInRange(low: number, high: number, rng: () => number): number {
  return low + Math.floor(rng() * (high - low + 1));
}

// generuj_postavu: rolls the 4 primary stats from the wheel-selected ranges,
// then derives HP/mana/stamina exactly as the original does. Equipment-based
// recalculation (prepocitat_postavu) and the hunger/thirst/mana-battery
// fields it also sets are skipped — there's no inventory/equipment or game
// clock system yet (#13/#14).
export function rollCharacterStats(ranges: AttributeRanges, rng: () => number = Math.random): RolledStats {
  const strength = rollInRange(ranges.strengthLow, ranges.strengthHigh, rng);
  const magic = rollInRange(ranges.magicLow, ranges.magicHigh, rng);
  const speed = rollInRange(ranges.speedLow, ranges.speedHigh, rng);
  const dexterity = rollInRange(ranges.dexterityLow, ranges.dexterityHigh, rng);
  return {
    strength,
    magic,
    speed,
    dexterity,
    maxHp: Math.floor((strength * 3 + speed) / 2),
    maxMana: magic * 2,
    stamina: dexterity * 2,
    hpRegen: ranges.hpRegen,
    mpRegen: ranges.mpRegen,
    staminaRegen: ranges.staminaRegen,
  };
}

export function createCharacter(
  name: string,
  portraitIndex: number,
  ranges: AttributeRanges,
  rng: () => number = Math.random,
): Character {
  return {
    name,
    portraitIndex,
    female: isPortraitFemale(portraitIndex),
    stats: rollCharacterStats(ranges, rng),
    level: 1,
    exp: 0,
    bonusPoints: 5,
  };
}

export function validateCharacterName(name: string): boolean {
  return name.trim().length > 0;
}

export type PrimaryStat = 'strength' | 'magic' | 'speed' | 'dexterity';

// The reference stat-review screen shows "Bonus: 5" alongside a [+] next to
// each of the 4 primary stats — points the player allocates immediately
// during character creation (not saved for later level-ups). Spending one
// recomputes derived HP/mana/stamina the same way generuj_postavu does,
// since they're a function of the primary stats.
export function spendBonusPoint(character: Character, stat: PrimaryStat): Character {
  if (character.bonusPoints <= 0) return character;
  const stats: RolledStats = { ...character.stats, [stat]: character.stats[stat] + 1 };
  stats.maxHp = Math.floor((stats.strength * 3 + stats.speed) / 2);
  stats.maxMana = stats.magic * 2;
  stats.stamina = stats.dexterity * 2;
  return { ...character, stats, bonusPoints: character.bonusPoints - 1 };
}

export type PartyRoster = readonly (Character | null)[];

export function createEmptyRoster(): PartyRoster {
  return Array.from({ length: MAX_PARTY_SIZE }, () => null);
}

export function firstEmptySlot(roster: PartyRoster): number {
  return roster.findIndex((member) => member === null);
}

export function withMember(roster: PartyRoster, slot: number, character: Character | null): PartyRoster {
  const next = roster.slice();
  next[slot] = character;
  return next;
}

export function usedPortraits(roster: PartyRoster): ReadonlySet<number> {
  const used = new Set<number>();
  for (const member of roster) {
    if (member) used.add(member.portraitIndex);
  }
  return used;
}

export function partySize(roster: PartyRoster): number {
  return roster.filter((member) => member !== null).length;
}

export function isPartyReady(roster: PartyRoster): boolean {
  return partySize(roster) > 0;
}
