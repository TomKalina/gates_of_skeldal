import { describe, expect, it } from 'vitest';
import {
  calculateWeight,
  celkovaVaha,
  countItemsInside,
  countItemsTotal,
  countItemsVisible,
  muzeNosit,
  PL_BATOH,
  PL_SIP,
  putItemToInv,
  weightDefect,
  type InvHuman,
  type InvItem,
} from './inventory-logic';

const mk = (hmotnost: number, umisteni = PL_BATOH, user_value = 0): InvItem => ({
  hmotnost,
  umisteni,
  user_value,
  podminky: [10, 0, 0, 0],
  zmeny: [-5, 0, 0, 0],
});
const items = [mk(100), mk(200), mk(1, PL_SIP, 10)];
const human = (): InvHuman => ({
  inv: Array<number>(30).fill(0),
  inv_size: 4,
  wearing: Array<number>(9).fill(0),
  prsteny: Array<number>(4).fill(0),
  vlastnosti: [12, 0, 0, 0],
  sipy: 0,
});

describe('inventory-logic', () => {
  it('counts item stacks', () => {
    const s = [1, -2, -2, 2, 0];
    expect(countItemsTotal(s)).toBe(4);
    expect(countItemsVisible(s)).toBe(2);
    expect(countItemsInside(s)).toBe(3);
    expect(celkovaVaha(items, s)).toBe(700);
  });
  it('weighs backpack 1.5x plus worn items', () => {
    const h = human();
    h.inv[0] = 1;
    h.wearing[2] = 2;
    h.prsteny[0] = 1;
    expect(calculateWeight(items, h)).toBe(450);
    expect(weightDefect(items, h)).toBe(1);
  });
  it('checks requirements including stat changes', () => {
    const h = human();
    expect(muzeNosit(items, h, 1)).toBe(false);
    h.vlastnosti[0] = 15;
    expect(muzeNosit(items, h, 1)).toBe(true);
  });
  it('puts items into free slots, arrows into quiver', () => {
    const h = human();
    h.inv[0] = 2;
    const picked = [1, -2, 0];
    expect(putItemToInv(items, h, picked)).toBe(true);
    expect(h.inv.slice(0, 4)).toEqual([2, 2, 1, 0]);
    expect(putItemToInv(items, h, [3, 0])).toBe(true);
    expect(h.sipy).toBe(10);
    expect(putItemToInv(items, h, [1, 1, 0])).toBe(false);
  });
});
