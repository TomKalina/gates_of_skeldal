import { describe, expect, it } from 'vitest';
import { MA, MC, loadMacros, runMacros, textIndex, twoParms, type MacroHost } from './macros';

function gen(action: number, flags: number, cancel = false, once = false): number[] {
  const b0 = action | (cancel ? 0x40 : 0) | (once ? 0x80 : 0);
  return [b0, flags & 0xff, (flags >> 8) & 0xff];
}
function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
}
function i16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}
function text(action: number, flags: number, idx: number): number[] {
  return [...gen(action, flags), 0, ...u32(idx)];
}
function twop(action: number, flags: number, p1: number, p2: number): number[] {
  return [...gen(action, flags), ...i16(p1), ...i16(p2)];
}
function file(records: [number, number[][]][]): Uint8Array {
  const out: number[] = [];
  for (const [side, items] of records) {
    out.push(...u32(side));
    for (const it of items) out.push(...u32(it.length), ...it);
    out.push(...u32(0));
  }
  out.push(...u32(0));
  return new Uint8Array(out);
}
function host(over: Partial<MacroHost> = {}): MacroHost & { log: number[] } {
  const log: number[] = [];
  return {
    log,
    sideFlags: () => 0,
    monsterInGame: () => false,
    monsterInRoom: () => false,
    haveItem: () => false,
    testFlag: () => false,
    random100: () => 50,
    lastSendAction: 0,
    exec: (a) => {
      log.push(a.action === MA.TEXTG ? textIndex(a) : -a.action);
    },
    ...over,
  };
}

describe('loadMacros', () => {
  it('parses records and fixes padding for two-param actions', () => {
    const t = loadMacros(
      file([
        [9, [text(MA.TEXTG, MC.TOUCHSUC, 1234), twop(MA.IFJMP, MC.TOUCHSUC, -3, 2)]],
        [17, [gen(MA.GEN, MC.EXIT, true, true)]],
      ]),
    );
    expect(t.count).toBe(3);
    const r = t.records.get(9)!;
    expect(textIndex(r[0]!)).toBe(1234);
    expect(r[1]!.action).toBe(MA.IFJMP);
    expect(twoParms(r[1]!)).toEqual({ parm1: -3, parm2: 2 });
    const g = t.records.get(17)![0]!;
    expect(g).toMatchObject({ cancel: true, once: true, flags: MC.EXIT, index: 2 });
  });
});

describe('runMacros', () => {
  it('dispatches only actions matching trigger flags', () => {
    const t = loadMacros(file([[4, [text(MA.TEXTG, MC.TOUCHSUC, 1), text(MA.TEXTG, MC.EXIT, 2)]]]));
    const h = host();
    runMacros(t, new Uint8Array(t.count), 4, MC.EXIT, h);
    expect(h.log).toEqual([2]);
  });

  it('respects once and cancel', () => {
    const t = loadMacros(
      file([[4, [[...gen(MA.SOUND, 1, false, true)], gen(MA.GEN, 1, true), text(MA.TEXTG, 1, 7)]]]),
    );
    const st = new Uint8Array(t.count);
    const h = host();
    runMacros(t, st, 4, 1, h);
    runMacros(t, st, 4, 1, h);
    expect(h.log).toEqual([-MA.SOUND]);
  });

  it('IFJMP jumps relative to program counter', () => {
    const t = loadMacros(
      file([[4, [twop(MA.IFJMP, 1, 1, 2), text(MA.TEXTG, 1, 1), text(MA.TEXTG, 1, 2)]]]),
    );
    const h = host({ sideFlags: () => 1 });
    runMacros(t, new Uint8Array(t.count), 4, 1, h);
    expect(h.log).toEqual([2]);
    const h2 = host();
    runMacros(t, new Uint8Array(t.count), 4, 1, h2);
    expect(h2.log).toEqual([1, 2]);
  });

  it('RANDJ caches the random value within one run', () => {
    let calls = 0;
    const t = loadMacros(
      file([[4, [twop(MA.RANDJ, 1, 60, 2), text(MA.TEXTG, 1, 1), twop(MA.RANDJ, 1, 40, 2), text(MA.TEXTG, 1, 2)]]]),
    );
    const h = host({ random100: () => (calls++, 50) });
    runMacros(t, new Uint8Array(t.count), 4, 1, h);
    expect(h.log).toEqual([2]);
    expect(calls).toBe(1);
  });
});
