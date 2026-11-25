import { describe, expect, it } from 'vitest';
import {
  HODINA,
  VLS_DAMAGE,
  VLS_KOUZLA,
  VLS_MAX,
  VLS_MAXHIT,
  VLS_OHEN,
  VLS_UTOK_L,
  combineResistance,
  prepocitatPostavu,
  type StatHuman,
  type StatItem,
} from './stats';

function zmeny(over: Record<number, number>): number[] {
  const z = new Array<number>(VLS_MAX).fill(0);
  for (const [k, v] of Object.entries(over)) z[Number(k)] = v;
  return z;
}

function human(over: Partial<StatHuman> = {}): StatHuman {
  const base = new Array<number>(VLS_MAX).fill(10);
  return {
    vlastnosti: [],
    stare_vls: base,
    wearing: new Array<number>(9).fill(0),
    prsteny: [0, 0, 0, 0],
    inv_size: 10,
    lives: 5,
    kondice: 5,
    jidlo: 0,
    voda: 0,
    ...over,
  };
}

describe('prepocitatPostavu', () => {
  it('copies base stats when nothing is worn', () => {
    const h = human();
    prepocitatPostavu(h, []);
    expect(h.vlastnosti[0]).toBe(10);
    expect(h.vlastnosti[VLS_DAMAGE]).toBe(10);
  });

  it('adds item bonuses, ors spells, combines resistances', () => {
    const items: StatItem[] = [
      { druh: 0, zmeny: zmeny({ 0: 5, [VLS_OHEN]: 10, [VLS_DAMAGE]: 3, [VLS_KOUZLA]: 4 }) },
    ];
    const h = human({ wearing: [1, 0, 0, 0, 0, 0, 0, 0, 0], prsteny: [1, 0, 0, 0] });
    prepocitatPostavu(h, items);
    expect(h.vlastnosti[0]).toBe(20);
    expect(h.vlastnosti[VLS_DAMAGE]).toBe(16);
    expect(h.vlastnosti[VLS_KOUZLA]).toBe(10 | 4);
    expect(h.vlastnosti[VLS_OHEN]).toBe(combineResistance(combineResistance(10, 10), 10));
  });

  it('ignores attack bonus of throwing weapons', () => {
    const items: StatItem[] = [{ druh: 2, zmeny: zmeny({ [VLS_UTOK_L]: 7, 0: 1 }) }];
    const h = human({ wearing: [1, 0, 0, 0, 0, 0, 0, 0, 0] });
    prepocitatPostavu(h, items);
    expect(h.vlastnosti[VLS_UTOK_L]).toBe(10);
    expect(h.vlastnosti[0]).toBe(11);
  });

  it('clamps stats and dependent values', () => {
    const items: StatItem[] = [{ druh: 0, zmeny: zmeny({ 0: 500, [VLS_MAXHIT]: -50 }) }];
    const h = human({
      wearing: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      lives: 50,
      jidlo: 1_000_000,
      voda: 1_000_000,
      inv_size: 99,
    });
    prepocitatPostavu(h, items);
    expect(h.vlastnosti[0]).toBe(200);
    expect(h.vlastnosti[VLS_MAXHIT]).toBe(1);
    expect(h.lives).toBe(1);
    expect(h.inv_size).toBe(30);
    expect(h.jidlo).toBe(48 * HODINA);
    expect(h.voda).toBe(24 * HODINA);
  });
});
