import { describe, expect, it } from 'vitest';
import {
  mgochrana,
  rozhodniOPoradi,
  SPL_HSANC,
  SPL_INVIS,
  SPL_SANC,
  SPL_TVAR,
  TURN_ORDER_END,
  VLS_DAMAGE,
  VLS_KOUZLA,
  VLS_MAX,
  VLS_MGSIL_H,
  VLS_MGSIL_L,
  VLS_MGZIVEL,
  VLS_OBRAN_H,
  VLS_OBRAN_L,
  VLS_OBRAT,
  VLS_OHEN,
  VLS_SILA,
  VLS_SMAGIE,
  VLS_UTOK_H,
  VLS_UTOK_L,
  vypocetZasahu,
} from './combat';

const zero = () => 0;
const stats = (s: Record<number, number>): Int16Array => {
  const a = new Int16Array(VLS_MAX);
  for (const [k, v] of Object.entries(s)) a[Number(k)] = v;
  return a;
};

describe('mgochrana', () => {
  it('matches C', () => {
    expect(mgochrana(0)).toBe(100);
    expect(mgochrana(30)).toBe(70);
    expect(mgochrana(150)).toBe(100);
  });
});

describe('vypocetZasahu', () => {
  const att = stats({ [VLS_SILA]: 20, [VLS_OBRAT]: 30, [VLS_UTOK_L]: 10, [VLS_UTOK_H]: 15, [VLS_DAMAGE]: 3 });
  const def = stats({ [VLS_OBRAT]: 10, [VLS_OBRAN_L]: 4, [VLS_OBRAN_H]: 8 });

  it('physical hit with min rolls', () => {
    expect(vypocetZasahu(att, def, 1, 2, 0, false, zero)).toBe(10 + 4 - (4 + 2) + 5);
  });

  it('finesse rule uses max(str,dex)', () => {
    expect(vypocetZasahu(att, def, 1, 0, 0, true, zero)).toBe(10 + 6 - 6 + 3);
  });

  it('chaos divides lower defense', () => {
    expect(vypocetZasahu(att, def, 3, 0, 0, false, zero)).toBe(10 + 4 - (2 + 2) + 3);
  });

  it('no damage bonus when miss', () => {
    const d = stats({ [VLS_OBRAN_L]: 50, [VLS_OBRAN_H]: 50 });
    expect(vypocetZasahu(att, d, 1, 5, 0, false, zero)).toBe(0);
  });

  it('invisibility, sanctuary and set-face', () => {
    const inv = stats({ [VLS_OBRAN_L]: 4, [VLS_OBRAN_H]: 8, [VLS_OBRAT]: 10, [VLS_KOUZLA]: SPL_INVIS });
    expect(vypocetZasahu(att, inv, 1, 0, 0, false, zero)).toBe(0);
    const sanc = stats({ [VLS_KOUZLA]: SPL_SANC });
    expect(vypocetZasahu(att, sanc, 1, 0, 0, false, zero)).toBe(Math.trunc((14 + 3) / 2));
    const tvar = stats({ [VLS_KOUZLA]: SPL_TVAR });
    expect(vypocetZasahu(att, tvar, 1, 0, 0, false, zero)).toBe(-17);
  });

  it('magic hit with resistance and half-sanctuary', () => {
    const mag = stats({ [VLS_SMAGIE]: 25, [VLS_MGSIL_L]: 20, [VLS_MGSIL_H]: 30, [VLS_MGZIVEL]: 1 });
    const d = stats({ [VLS_OHEN + 1]: 50 });
    expect(vypocetZasahu(mag, d, 1, 0, 0, false, zero)).toBe(12);
    const h = stats({ [VLS_OHEN + 1]: 50, [VLS_KOUZLA]: SPL_HSANC });
    expect(vypocetZasahu(mag, h, 1, 0, 0, false, zero)).toBe(6);
  });

  it('uses rnd range', () => {
    const calls: number[] = [];
    vypocetZasahu(att, def, 1, 0, 0, false, (n) => {
      calls.push(n);
      return 0;
    });
    expect(calls).toEqual([6, 5, 1]);
  });
});

describe('rozhodniOPoradi', () => {
  it('builds action list with terminator', () => {
    const order = rozhodniOPoradi(
      [
        { live: true, inBattle: true, actions: 2 },
        { live: false, inBattle: true, actions: 1 },
      ],
      [
        { used: true, onCurrentMap: true, programovano: 1 },
        { used: true, onCurrentMap: false, programovano: 1 },
      ],
      (n) => n - 1,
    );
    expect(order.slice(-2)).toEqual([TURN_ORDER_END, 0]);
    expect([...order.slice(0, 3)].sort()).toEqual([-1, 1, 1].sort());
  });
});
