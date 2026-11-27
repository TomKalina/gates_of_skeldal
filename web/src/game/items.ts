import { kamenickyToUnicode } from '../formats/enc-file';

export const TITEM_SIZE = 222;

export const ItemType = {
  NESPEC: 0,
  UTOC: 1,
  VRHACI: 2,
  STRELNA: 3,
  ZBROJ: 4,
  SVITEK: 5,
  LEKTVAR: 6,
  MECH: 7,
  VODA: 7,
  JIDLO: 8,
  SPECIALNI: 9,
  RUNA: 10,
  PENIZE: 11,
  SVITXT: 12,
  PRACH: 13,
  OTHER: 14,
} as const;

export const ItemPlace = {
  NIKAM: 0,
  BATOH: 1,
  TELO_H: 2,
  TELO_D: 3,
  HLAVA: 4,
  NOHY: 5,
  KUTNA: 6,
  KRK: 7,
  RUKA: 8,
  OBOUR: 9,
  PRSTEN: 10,
  SIP: 11,
} as const;

export interface ItemDef {
  jmeno: string;
  popis: string;
  zmeny: number[];
  podminky: number[];
  hmotnost: number;
  nosnost: number;
  druh: number;
  umisteni: number;
  flags: number;
  spell: number;
  magie: number;
  soundHandle: number;
  useEvent: number;
  ikona: number;
  vzhled: number;
  userValue: number;
  keynum: number;
  polohy: [[number, number], [number, number]];
  typZbrane: number;
  sound: number;
  vLetu: number[];
  cena: number;
  weaponAttack: number;
  hitpos: number;
  shiftup: number;
}

function cString(bytes: Uint8Array, offset: number, len: number): string {
  let end = offset;
  while (end < offset + len && end < bytes.length && bytes[end] !== 0) end++;
  return kamenickyToUnicode(bytes.subarray(offset, end));
}

function shorts(view: DataView, offset: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(view.getInt16(offset + i * 2, true));
  return out;
}

export function parseItem(bytes: Uint8Array, base = 0): ItemDef {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const s = (o: number): number => v.getInt16(base + o, true);
  const u = (o: number): number => v.getUint16(base + o, true);
  const c = (o: number): number => v.getInt8(base + o);
  return {
    jmeno: cString(bytes, base, 32),
    popis: cString(bytes, base + 32, 32),
    zmeny: shorts(v, base + 64, 24),
    podminky: shorts(v, base + 112, 4),
    hmotnost: s(120),
    nosnost: s(122),
    druh: s(124),
    umisteni: s(126),
    flags: u(128),
    spell: s(130),
    magie: s(132),
    soundHandle: s(134),
    useEvent: s(136),
    ikona: u(138),
    vzhled: u(140),
    userValue: s(142),
    keynum: s(144),
    polohy: [
      [s(146), s(148)],
      [s(150), s(152)],
    ],
    typZbrane: v.getUint8(base + 154),
    sound: s(156),
    vLetu: shorts(v, base + 158, 16),
    cena: u(190) + u(192) * 65536,
    weaponAttack: c(194),
    hitpos: c(195),
    shiftup: c(196),
  };
}

export function parseItems(bytes: Uint8Array): ItemDef[] {
  const count = Math.floor(bytes.byteLength / TITEM_SIZE);
  const out: ItemDef[] = [];
  for (let i = 0; i < count; i++) out.push(parseItem(bytes, i * TITEM_SIZE));
  return out;
}
