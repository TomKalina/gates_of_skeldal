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

// game/globals.h's THUMAN: `short wearing[HUMAN_PLACES]` (9 equip slots, 0 =
// empty — see game/inv.c's PO_* enum for slot meaning), `short prsteny[
// HUMAN_RINGS]` (4 ring slots), `short sipy` (arrow count), `short inv_size`
// (backpack size, 6-30 — starts at 6, grows via a worn PL_BATOH item's
// `nosnost`: `inv_size = 6 + item.nosnost`), `short inv[MAX_INV]` (30-slot
// backpack). All real item references here are 1-based indices into
// ITEMS.DAT's item list (see formats/items-file.ts), 0 = empty, same
// convention as A_MAPITEM's floor piles.
export const HUMAN_PLACES = 9;
export const HUMAN_RINGS = 4;
export const MAX_INV = 30;

export interface Character {
  name: string;
  portraitIndex: number;
  female: boolean;
  stats: RolledStats;
  level: number;
  exp: number;
  bonusPoints: number;
  wearing: readonly number[];
  rings: readonly number[];
  arrows: number;
  invSize: number;
  inv: readonly number[];
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

// chargen.c/chargen2.c's generuj_postavu: a fresh character always starts
// with an empty backpack/equipment and inv_size=6 (verified: both real
// callers set `p->inv_size=6` directly, nothing else touches wearing/
// prsteny/sipy/inv for a newly-rolled character).
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
    wearing: new Array(HUMAN_PLACES).fill(0),
    rings: new Array(HUMAN_RINGS).fill(0),
    arrows: 0,
    invSize: 6,
    inv: new Array(MAX_INV).fill(0),
  };
}

// game/inv.c's put_item_to_inv(): flattens a floor-pickup group (container
// contents included — abs() strips the "inside a container" negative tag,
// see map-file.ts's popFloorItemGroup) into separate backpack slots, one
// per item, filling the first empty inv[] slot for each. Processes the
// group in reverse, matching the source's own `while(i) { i--; ... }`
// countdown, and stops entirely (not skip-and-continue) the moment
// inv_size is exhausted — the source's real early exit. Returns whichever
// leading items didn't fit, unchanged, for the caller to keep "on the
// cursor". The real PL_SIP arrow-merge shortcut (arrows go into `arrows`
// instead of a slot) isn't ported yet — ITEMS.DAT's `umisteni`/`druh`
// fields aren't parsed by this port's items-file.ts, so every item here
// always takes a normal slot.
export function depositItems(character: Character, items: readonly number[]): { character: Character; leftover: readonly number[] } {
  const inv = character.inv.slice();
  let pos = 0;
  let i = items.length;
  while (i > 0) {
    while (pos < character.invSize && inv[pos]) pos++;
    if (pos >= character.invSize) break;
    i--;
    inv[pos] = Math.abs(items[i]!);
  }
  return { character: { ...character, inv }, leftover: items.slice(0, i) };
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
