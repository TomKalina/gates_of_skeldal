export const MA = {
  GEN: 0, SOUND: 1, TEXTG: 2, TEXTL: 3, SENDA: 4, FIREB: 5, DESTI: 6, LOADL: 7,
  DROPI: 8, DIALG: 9, SSHOP: 10, CLOCK: 11, CACTN: 12, LOCK: 13, SWAPS: 14, WOUND: 15,
  IFJMP: 16, CALLS: 17, HAVIT: 18, STORY: 19, IFACT: 20, SNDEX: 21, MOVEG: 22, PLAYA: 23,
  CREAT: 24, ISFLG: 25, CHFLG: 26, CUNIQ: 27, MONEY: 28, GUNIQ: 29, PICKI: 30, WBOOK: 31,
  RANDJ: 32, ENDGM: 33, GOMOB: 34, SHRMA: 35, MUSIC: 36, GLOBE: 37, IFSEC: 38, IFSTP: 39,
} as const;

export const MC = {
  PASSSUC: 0x1, PASSFAIL: 0x2, TOUCHSUC: 0x4, TOUCHFAIL: 0x8, LOCKINFO: 0x10, EXIT: 0x20,
  INCOMING: 0x40, STARTLEV: 0x80, CLOSEDOOR: 0x100, ANIM: 0x200, ANIM2: 0x400,
  SUCC_DONE: 0x800, SPEC_SUCC: 0x1000, OPENDOOR: 0x2000, VYKEVENT: 0x4000, WALLATTACK: 0x8000,
} as const;

const FIXPAD = new Set<number>([
  MA.FIREB, MA.LOADL, MA.DROPI, MA.CREAT, MA.LOCK, MA.CUNIQ, MA.GUNIQ, MA.IFJMP, MA.HAVIT,
  MA.RANDJ, MA.ISFLG, MA.PICKI, MA.SNDEX, MA.IFACT, MA.CALLS, MA.MOVEG, MA.CHFLG, MA.WBOOK,
  MA.GOMOB, MA.SHRMA, MA.MONEY, MA.PLAYA,
]);

export interface MacroAction {
  action: number;
  cancel: boolean;
  once: boolean;
  flags: number;
  data: Uint8Array;
  index: number;
}

export interface MacroTable {
  records: Map<number, MacroAction[]>;
  count: number;
}

export function readMacroItem(src: Uint8Array, index: number): MacroAction {
  const action = src[0]! & 0x3f;
  let data: Uint8Array;
  if (FIXPAD.has(action)) {
    data = new Uint8Array(src.length + 1);
    data.set(src.subarray(0, 3), 0);
    data.set(src.subarray(3), 4);
  } else {
    data = src.slice();
  }
  const g = data[0]! | (data[1]! << 8) | ((data[2] ?? 0) << 16);
  return {
    action,
    cancel: (g & 0x40) !== 0,
    once: (g & 0x80) !== 0,
    flags: (g >>> 8) & 0xffff,
    data,
    index,
  };
}

export function loadMacros(buf: Uint8Array): MacroTable {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const records = new Map<number, MacroAction[]>();
  let pos = 0;
  let count = 0;
  for (;;) {
    const side = dv.getUint32(pos, true);
    pos += 4;
    if (side === 0) break;
    const list: MacroAction[] = [];
    for (;;) {
      const sz = dv.getUint32(pos, true);
      pos += 4;
      if (sz === 0) break;
      list.push(readMacroItem(buf.subarray(pos, pos + sz), count++));
      pos += sz;
    }
    records.set(side, list);
  }
  return { records, count };
}

export function twoParms(a: MacroAction): { parm1: number; parm2: number } {
  const dv = new DataView(a.data.buffer, a.data.byteOffset, a.data.byteLength);
  return { parm1: dv.getInt16(4, true), parm2: dv.getInt16(6, true) };
}

export function textIndex(a: MacroAction): number {
  const dv = new DataView(a.data.buffer, a.data.byteOffset, a.data.byteLength);
  return dv.getInt32(4, true);
}

export interface MacroHost {
  sideFlags(side: number): number;
  monsterInGame(): boolean;
  monsterInRoom(sector: number): boolean;
  haveItem(item: number): boolean;
  testFlag(flag: number): boolean;
  random100(): number;
  lastSendAction: number;
  exec(action: MacroAction, side: number): boolean | void;
}

export function runMacros(
  table: MacroTable,
  states: Uint8Array,
  side: number,
  flags: number,
  host: MacroHost,
  runAtSide: number = side,
): number {
  const list = table.records.get(runAtSide);
  if (!list) return 0;
  let randValue = -1;
  let pc = 0;
  let base = 0;
  let remaining = list.length;
  let executed = 0;
  while (remaining !== 0) {
    const z = list[base]!;
    if (z.flags & flags) {
      let jmp = -1;
      let cancel = false;
      if (!z.once || !states[z.index]) {
        states[z.index] = 1;
        cancel = z.cancel;
        executed++;
        switch (z.action) {
          case MA.GEN:
            break;
          case MA.IFJMP: {
            const { parm1, parm2 } = twoParms(z);
            const test = Math.abs(parm1) - 1;
            let ok = false;
            if (test < 32) ok = (host.sideFlags(side) & (1 << test)) !== 0;
            else if (test === 32) ok = host.monsterInGame();
            else if (test === 33) ok = host.monsterInRoom(side >> 2);
            if (parm1 < 0) ok = !ok;
            if (ok) jmp = parm2 + pc;
            break;
          }
          case MA.HAVIT: {
            const { parm1, parm2 } = twoParms(z);
            let ok = host.haveItem(Math.abs(parm1));
            if (parm1 < 0) ok = !ok;
            if (ok) jmp = parm2 + pc;
            break;
          }
          case MA.IFACT: {
            const { parm1, parm2 } = twoParms(z);
            let ok = Math.abs(parm1) - 1 === host.lastSendAction;
            if (parm1 < 0) ok = !ok;
            if (ok) jmp = parm2 + pc;
            break;
          }
          case MA.ISFLG: {
            const { parm1, parm2 } = twoParms(z);
            let ok = host.testFlag(Math.abs(parm1) - 1);
            if (parm1 < 0) ok = !ok;
            if (ok) jmp = parm2 + pc;
            break;
          }
          case MA.RANDJ: {
            const { parm1, parm2 } = twoParms(z);
            if (randValue === -1) randValue = host.random100();
            if (randValue < parm1) jmp = parm2 + pc;
            break;
          }
          default: {
            const r = host.exec(z, side);
            if (typeof r === 'boolean') cancel = r;
          }
        }
      }
      if (jmp !== -1) {
        if (list.length > jmp) {
          base = jmp;
          remaining = list.length - jmp;
        } else {
          base = 0;
          remaining = list.length;
        }
        pc = jmp;
      } else if (cancel) {
        break;
      } else {
        pc++;
        base++;
        remaining--;
      }
    } else {
      pc++;
      base++;
      remaining--;
    }
  }
  return executed;
}
