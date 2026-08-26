import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  createEmptyRoster,
  depositItems,
  firstEmptySlot,
  HUMAN_PLACES,
  HUMAN_RINGS,
  isPartyReady,
  isPortraitFemale,
  MAX_INV,
  MAX_PARTY_SIZE,
  partySize,
  rollCharacterStats,
  spendBonusPoint,
  usedPortraits,
  validateCharacterName,
  withMember,
} from './party';

const RANGES = {
  strengthLow: 10,
  strengthHigh: 10,
  magicLow: 5,
  magicHigh: 5,
  speedLow: 8,
  speedHigh: 8,
  dexterityLow: 6,
  dexterityHigh: 6,
  hpRegen: 2,
  mpRegen: 3,
  staminaRegen: 2,
};

describe('rollCharacterStats', () => {
  it('rolls within range and derives HP/mana/stamina like generuj_postavu', () => {
    const stats = rollCharacterStats(RANGES, () => 0);
    expect(stats.strength).toBe(10);
    expect(stats.magic).toBe(5);
    expect(stats.speed).toBe(8);
    expect(stats.dexterity).toBe(6);
    expect(stats.maxHp).toBe(Math.floor((10 * 3 + 8) / 2));
    expect(stats.maxMana).toBe(10);
    expect(stats.stamina).toBe(12);
    expect(stats.hpRegen).toBe(2);
  });

  it('picks the high end of the range when rng returns just under 1', () => {
    const wideRanges = { ...RANGES, strengthLow: 10, strengthHigh: 12 };
    const stats = rollCharacterStats(wideRanges, () => 0.999);
    expect(stats.strength).toBe(12);
  });
});

describe('isPortraitFemale', () => {
  it('matches chargen.c poradi[]/women[] tables — not a simple index threshold', () => {
    expect([0, 2, 3, 4].map(isPortraitFemale)).toEqual([false, false, false, false]);
    expect([1, 5, 6, 7].map(isPortraitFemale)).toEqual([true, true, true, true]);
  });
});

describe('spendBonusPoint', () => {
  it('increments the stat, decrements the pool, and recomputes derived values', () => {
    const character = createCharacter('Hero', 0, RANGES, () => 0);
    expect(character.bonusPoints).toBe(5);
    expect(character.stats.strength).toBe(10);

    const upgraded = spendBonusPoint(character, 'strength');
    expect(upgraded.bonusPoints).toBe(4);
    expect(upgraded.stats.strength).toBe(11);
    expect(upgraded.stats.maxHp).toBe(Math.floor((11 * 3 + 8) / 2));
  });

  it('does nothing once the pool is empty', () => {
    let character = createCharacter('Hero', 0, RANGES, () => 0);
    for (let i = 0; i < 5; i++) character = spendBonusPoint(character, 'strength');
    expect(character.bonusPoints).toBe(0);

    const unchanged = spendBonusPoint(character, 'strength');
    expect(unchanged).toBe(character);
  });
});

describe('createCharacter — inventory fields', () => {
  it('matches generuj_postavu: empty backpack/equipment, inv_size=6', () => {
    const character = createCharacter('Hero', 0, RANGES, () => 0);
    expect(character.wearing).toEqual(new Array(HUMAN_PLACES).fill(0));
    expect(character.rings).toEqual(new Array(HUMAN_RINGS).fill(0));
    expect(character.arrows).toBe(0);
    expect(character.invSize).toBe(6);
    expect(character.inv).toEqual(new Array(MAX_INV).fill(0));
  });
});

describe('depositItems', () => {
  it('flattens a picked-up group (abs of any container-content negatives) into separate free slots (game/inv.c: put_item_to_inv)', () => {
    // Real LESPRED.MAP pile: item 52 containing 6 sub-items — 7 entries, so
    // a big enough backpack (invSize=7) is needed for all of them to fit.
    const character = { ...createCharacter('Hero', 0, RANGES, () => 0), invSize: 7 };
    const { character: updated, leftover } = depositItems(character, [52, -40, -22, -37, -45, -7, -7]);
    // put_item_to_inv fills backwards from the group's end, so the array
    // lands reversed (last entry first) relative to the pile's own order.
    expect(updated.inv.slice(0, 7)).toEqual([7, 7, 45, 37, 22, 40, 52]);
    expect(leftover).toEqual([]);
  });

  it('fills the first empty slot, skipping already-occupied ones', () => {
    const character = createCharacter('Hero', 0, RANGES, () => 0);
    const withOne = depositItems(character, [1]).character;
    const { character: updated } = depositItems(withOne, [2]);
    expect(updated.inv.slice(0, 2)).toEqual([1, 2]);
  });

  it('stops entirely once the backpack is full, leaving unprocessed (lower-indexed) items as leftover (not skip-and-continue)', () => {
    // put_item_to_inv processes the group backwards: items[2]=3 fills the
    // first free slot, items[1]=2 fills the next, then the backpack is full
    // and the loop breaks — items[0]=1 is never reached, left "on the cursor".
    const character = { ...createCharacter('Hero', 0, RANGES, () => 0), invSize: 2 };
    const { character: updated, leftover } = depositItems(character, [1, 2, 3]);
    expect(updated.inv.slice(0, 2)).toEqual([3, 2]);
    expect(leftover).toEqual([1]);
  });
});

describe('validateCharacterName', () => {
  it('rejects empty or whitespace-only names', () => {
    expect(validateCharacterName('')).toBe(false);
    expect(validateCharacterName('   ')).toBe(false);
    expect(validateCharacterName('Conan')).toBe(true);
  });
});

describe('party roster', () => {
  it('starts empty with MAX_PARTY_SIZE slots', () => {
    const roster = createEmptyRoster();
    expect(roster).toHaveLength(MAX_PARTY_SIZE);
    expect(firstEmptySlot(roster)).toBe(0);
    expect(isPartyReady(roster)).toBe(false);
  });

  it('tracks used portraits and party size as members are added', () => {
    let roster = createEmptyRoster();
    const hero = createCharacter('Hero', 2, RANGES, () => 0);
    roster = withMember(roster, firstEmptySlot(roster), hero);

    expect(partySize(roster)).toBe(1);
    expect(usedPortraits(roster).has(2)).toBe(true);
    expect(firstEmptySlot(roster)).toBe(1);
    expect(isPartyReady(roster)).toBe(true);
  });

  it('reports no empty slot when full', () => {
    let roster = createEmptyRoster();
    for (let i = 0; i < MAX_PARTY_SIZE; i++) {
      roster = withMember(roster, i, createCharacter(`Member${i}`, i, RANGES, () => 0));
    }
    expect(firstEmptySlot(roster)).toBe(-1);
    expect(partySize(roster)).toBe(MAX_PARTY_SIZE);
  });
});
