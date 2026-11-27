import { describe, expect, it } from 'vitest';
import { bagClick, computeVlastnosti, humanClick, itemRequirements, PO, ringClick, swapBackpack, VLS } from './inventory';
import { ItemPlace, ItemType, type ItemDef } from './items';
import type { Character } from './party';

function def(over: Partial<ItemDef>): ItemDef {
  return {
    jmeno: 'X',
    popis: '',
    zmeny: new Array<number>(24).fill(0),
    podminky: [0, 0, 0, 0],
    hmotnost: 1,
    nosnost: 0,
    druh: ItemType.NESPEC,
    umisteni: ItemPlace.NIKAM,
    flags: 0,
    spell: 0,
    magie: 0,
    soundHandle: 0,
    useEvent: 0,
    ikona: 0,
    vzhled: 0,
    userValue: 0,
    keynum: 0,
    polohy: [
      [0, 0],
      [0, 0],
    ],
    typZbrane: 0,
    sound: 0,
    vLetu: [],
    cena: 0,
    weaponAttack: 0,
    hitpos: 0,
    shiftup: 0,
    ...over,
  };
}

function zmeny(changes: Record<number, number>): number[] {
  const z = new Array<number>(24).fill(0);
  for (const [k, v] of Object.entries(changes)) z[Number(k)] = v;
  return z;
}

const SWORD = 1;
const HELMET = 2;
const ROBE = 3;
const RING = 4;
const BAG = 5;
const HEAVY = 6;
const AXE = 7;
const POTION = 8;

const items: ItemDef[] = [
  def({ druh: ItemType.UTOC, umisteni: ItemPlace.RUKA, zmeny: zmeny({ [VLS.UTOK_L]: 2, [VLS.UTOK_H]: 5 }) }),
  def({ druh: ItemType.ZBROJ, umisteni: ItemPlace.HLAVA, zmeny: zmeny({ [VLS.OBRAN_L]: 1, [VLS.OHEN]: 10 }) }),
  def({ druh: ItemType.ZBROJ, umisteni: ItemPlace.KUTNA }),
  def({ umisteni: ItemPlace.PRSTEN, zmeny: zmeny({ [VLS.SILA]: 3 }) }),
  def({ umisteni: ItemPlace.BATOH, nosnost: 6 }),
  def({ druh: ItemType.ZBROJ, umisteni: ItemPlace.TELO_H, podminky: [99, 0, 0, 0] }),
  def({ druh: ItemType.UTOC, umisteni: ItemPlace.RUKA, podminky: [10, 0, 0, 0] }),
  def({ druh: ItemType.LEKTVAR }),
];

function hero(over: Partial<Character> = {}): Character {
  return {
    name: 'Tom',
    portraitIndex: 0,
    female: false,
    stats: { strength: 15, magic: 14, speed: 15, dexterity: 14, maxHp: 30, maxMana: 28, stamina: 28, hpRegen: 0, mpRegen: 0, staminaRegen: 0 },
    level: 1,
    exp: 0,
    bonusPoints: 0,
    wearing: new Array<number>(9).fill(0),
    rings: [0, 0, 0, 0],
    arrows: 0,
    invSize: 6,
    inv: new Array<number>(30).fill(0),
    ...over,
  };
}

describe('computeVlastnosti', () => {
  it('starts from generuj_postavu base values and adds worn item changes', () => {
    const base = computeVlastnosti(hero(), items);
    expect([base[VLS.UTOK_L], base[VLS.UTOK_H], base[VLS.OBRAN_L], base[VLS.OBRAN_H]]).toEqual([1, 2, 1, 2]);
    const wearing = new Array<number>(9).fill(0);
    wearing[PO.RUKA_R] = SWORD;
    wearing[PO.HLAVA] = HELMET;
    const v = computeVlastnosti(hero({ wearing, rings: [RING, 0, 0, 0] }), items);
    expect([v[VLS.UTOK_L], v[VLS.UTOK_H], v[VLS.OBRAN_L], v[VLS.OHEN], v[VLS.SILA]]).toEqual([3, 7, 2, 10, 18]);
  });

  it('combines resistances with the saturating formula from prepocitat_postavu', () => {
    const wearing = new Array<number>(9).fill(0);
    wearing[PO.HLAVA] = HELMET;
    wearing[PO.KRK] = HELMET;
    expect(computeVlastnosti(hero({ wearing }), items)[VLS.OHEN]).toBe(20);
  });

  it('gives the first three heroes their post-creation attack/defence bump', () => {
    const strong = hero({ stats: { ...hero().stats, strength: 21, dexterity: 21 } });
    const v = computeVlastnosti(strong, items, 0);
    expect([v[VLS.UTOK_H], v[VLS.OBRAN_H]]).toEqual([3, 3]);
    expect(computeVlastnosti(strong, items, 3)[VLS.UTOK_H]).toBe(2);
  });
});

describe('bagClick', () => {
  it('takes an item out of a slot and swaps a held item into it', () => {
    const inv = new Array<number>(30).fill(0);
    inv[2] = HELMET;
    const taken = bagClick(hero({ inv }), null, 2, items)!;
    expect(taken.held).toEqual([HELMET]);
    expect(taken.character.inv[2]).toBe(0);
    const swapped = bagClick(hero({ inv }), [SWORD], 2, items)!;
    expect(swapped.character.inv[2]).toBe(SWORD);
    expect(swapped.held).toEqual([HELMET]);
  });

  it('spreads a held group into free slots and refuses when it does not fit', () => {
    const r = bagClick(hero(), [BAG, -SWORD, -HELMET], 1, items)!;
    expect(r.character.inv.slice(0, 4)).toEqual([0, BAG, SWORD, HELMET]);
    expect(r.held).toBeNull();
    const full = new Array<number>(30).fill(0);
    for (let i = 0; i < 5; i++) full[i] = POTION;
    expect(bagClick(hero({ inv: full }), [BAG, -SWORD], 5, items)).toBeNull();
  });

  it('ignores clicks past the backpack size', () => {
    expect(bagClick(hero(), null, 6, items)).toBeNull();
  });
});

describe('humanClick', () => {
  it('puts a one-handed weapon in the hand under the cursor', () => {
    expect(humanClick(hero(), [SWORD], 50, null, items)!.character.wearing[PO.RUKA_R]).toBe(SWORD);
    expect(humanClick(hero(), [SWORD], 150, null, items)!.character.wearing[PO.RUKA_L]).toBe(SWORD);
  });

  it('swaps the previously worn item onto the cursor and drops the robe conflict into the bag', () => {
    const wearing = new Array<number>(9).fill(0);
    wearing[PO.KUTNA] = ROBE;
    const r = humanClick(hero({ wearing }), [HELMET], 0, null, items)!;
    expect(r.character.wearing[PO.HLAVA]).toBe(HELMET);
    expect(r.character.wearing[PO.KUTNA]).toBe(0);
    expect(r.character.inv[0]).toBe(ROBE);
    expect(r.held).toBeNull();
  });

  it('refuses items the hero cannot wear and items with no body slot', () => {
    expect(humanClick(hero(), [HEAVY], 0, null, items)).toBeNull();
    expect(humanClick(hero(), [POTION], 0, null, items)).toBeNull();
    expect(humanClick(hero(), [RING], 0, null, items)).toBeNull();
  });

  it('picks up the pointed worn item when the cursor is empty', () => {
    const wearing = new Array<number>(9).fill(0);
    wearing[PO.HLAVA] = HELMET;
    const r = humanClick(hero({ wearing }), null, 0, PO.HLAVA, items)!;
    expect(r.held).toEqual([HELMET]);
    expect(r.character.wearing[PO.HLAVA]).toBe(0);
  });

  it('drops the other hand when two weapons are too demanding to wield together', () => {
    const wearing = new Array<number>(9).fill(0);
    wearing[PO.RUKA_R] = AXE;
    const weak = hero({ wearing, stats: { ...hero().stats, strength: 15, dexterity: 9 } });
    const r = humanClick(weak, [AXE], 150, null, items)!;
    expect(r.character.wearing[PO.RUKA_L]).toBe(AXE);
    expect(r.character.wearing[PO.RUKA_R]).toBe(0);
    expect(r.character.inv[0]).toBe(AXE);
  });
});

describe('ringClick and swapBackpack', () => {
  it('only accepts rings in ring slots', () => {
    expect(ringClick(hero(), [RING], 1, items)!.character.rings).toEqual([0, RING, 0, 0]);
    expect(ringClick(hero(), [SWORD], 1, items)!.character.rings).toEqual([0, 0, 0, 0]);
  });

  it('wearing a backpack grows the bag and taking it off carries its contents', () => {
    const worn = swapBackpack(hero(), [BAG], items);
    expect(worn.character.invSize).toBe(12);
    const inv = [...worn.character.inv];
    inv[7] = HELMET;
    const off = swapBackpack({ ...worn.character, inv }, null, items);
    expect(off.character.invSize).toBe(6);
    expect(off.held).toEqual([BAG, -HELMET]);
  });
});

describe('itemRequirements', () => {
  it('formats requirements like texty 200-203', () => {
    expect(itemRequirements(items, AXE)).toBe('Síla: 10');
    expect(itemRequirements(items, SWORD)).toBeNull();
  });
});
