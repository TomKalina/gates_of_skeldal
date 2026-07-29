import { describe, expect, it } from 'vitest';
import {
  createCharacter,
  createEmptyRoster,
  firstEmptySlot,
  isPartyReady,
  isPortraitFemale,
  MAX_PARTY_SIZE,
  partySize,
  rollCharacterStats,
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
