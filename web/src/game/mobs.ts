export const MOBS_INV = 16;
export const MAX_MOBS = 255;
export const MOB_START = 1;
export const TMOB_SIZE = 380;

export interface Mob {
  name: string;
  casting: number;
  adjusting: number[];
  sector: number;
  dir: number;
  locx: number;
  locy: number;
  headx: number;
  heady: number;
  animCounter: number;
  vlastnosti: number[];
  inv: number[];
  lives: number;
  cisloVzoru: number;
  speed: number;
  dohled: number;
  dosah: number;
  stayStrategy: number;
  walkData: number;
  bonus: number;
  fleeNum: number;
  animCounts: number[];
  mobsName: string;
  vlajky2: number;
  id: number;
  experience: number;
  vlajky: number;
  animPhase: number;
  csektor: number;
  homePos: number;
  next: number;
  actions: number;
  hitPos: number;
  sounds: number[];
  palette: number;
  mode: number;
  dialog: number;
  dialogFlags: number;
  money: number;
  specproc: number;
  dostal: number;
  userData: number;
}

function cString(bytes: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export function parseMob(data: Uint8Array, offset = 0): Mob {
  const v = new DataView(data.buffer, data.byteOffset + offset, TMOB_SIZE);
  const bytes = data.subarray(offset, offset + TMOB_SIZE);
  const s16 = (o: number): number => v.getInt16(o, true);
  const u16 = (o: number): number => v.getUint16(o, true);
  const s8 = (o: number): number => v.getInt8(o);
  const u8 = (o: number): number => v.getUint8(o);
  const s16arr = (o: number, n: number): number[] => Array.from({ length: n }, (_, i) => s16(o + i * 2));
  return {
    name: cString(bytes, 0, 30),
    casting: s16(30),
    adjusting: s16arr(32, 96),
    sector: u16(224),
    dir: u16(226),
    locx: s8(228),
    locy: s8(229),
    headx: s8(230),
    heady: s8(231),
    animCounter: s16(232),
    vlastnosti: s16arr(234, 24),
    inv: s16arr(282, MOBS_INV),
    lives: s16(314),
    cisloVzoru: s16(316),
    speed: s16(318),
    dohled: s16(320),
    dosah: s16(322),
    stayStrategy: s8(324),
    walkData: s8(325),
    bonus: u16(326),
    fleeNum: s8(328),
    animCounts: Array.from({ length: 6 }, (_, i) => s8(329 + i)),
    mobsName: cString(bytes, 335, 7),
    vlajky2: s8(342),
    id: u8(343),
    experience: v.getInt32(344, true),
    vlajky: s8(348),
    animPhase: s8(349),
    csektor: s16(350),
    homePos: s16(352),
    next: s16(354),
    actions: s8(356),
    hitPos: s8(357),
    sounds: Array.from({ length: 4 }, (_, i) => u16(358 + i * 2)),
    palette: s8(366),
    mode: s8(367),
    dialog: s16(368),
    dialogFlags: s8(370),
    money: u16(372),
    specproc: u16(374),
    dostal: u16(376),
    userData: s8(378),
  };
}

export function parseMobTable(data: Uint8Array): Mob[] {
  const count = Math.floor(data.byteLength / TMOB_SIZE);
  return Array.from({ length: count }, (_, i) => parseMob(data, i * TMOB_SIZE));
}

export interface MobPlacement {
  sector: number;
  templateNumber: number;
  dir: number;
}

export function parseMobPlacements(data: Uint8Array): MobPlacement[] {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = Math.min(data.byteLength >> 2, MAX_MOBS - MOB_START);
  return Array.from({ length: count }, (_, i) => {
    const raw = v.getUint16(i * 4 + 2, true);
    return { sector: v.getInt16(i * 4, true), templateNumber: raw & 0xfff, dir: (raw >> 14) & 0x3 };
  });
}

export function createMob(fields: Partial<Mob> & Pick<Mob, 'name' | 'sector'>): Mob {
  return {
    casting: 0,
    adjusting: new Array<number>(96).fill(0),
    dir: 0,
    locx: 0,
    locy: 0,
    headx: 0,
    heady: 0,
    animCounter: 0,
    vlastnosti: new Array<number>(24).fill(0),
    inv: new Array<number>(MOBS_INV).fill(0),
    lives: 1,
    cisloVzoru: 0,
    speed: 1,
    dohled: 0,
    dosah: 1,
    stayStrategy: 0,
    walkData: 0,
    bonus: 0,
    fleeNum: 0,
    animCounts: new Array<number>(6).fill(0),
    mobsName: '',
    vlajky2: 0,
    id: 0,
    experience: 0,
    vlajky: 0,
    animPhase: 0,
    csektor: 0,
    homePos: 0,
    next: 0,
    actions: 1,
    hitPos: 0,
    sounds: new Array<number>(4).fill(0),
    palette: 0,
    mode: 0,
    dialog: 0,
    dialogFlags: 0,
    money: 0,
    specproc: 0,
    dostal: 0,
    userData: 0,
    ...fields,
  };
}
