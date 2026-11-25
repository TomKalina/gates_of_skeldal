import { describe, expect, it } from 'vitest';
import { ItemType, parseItems, TITEM_SIZE } from './items';

function makeItem(name: string): Uint8Array {
  const b = new Uint8Array(TITEM_SIZE);
  const v = new DataView(b.buffer);
  for (let i = 0; i < name.length; i++) b[i] = name.charCodeAt(i);
  b[32] = 'X'.charCodeAt(0);
  v.setInt16(64, 5, true);
  v.setInt16(64 + 23 * 2, -3, true);
  v.setInt16(112, 10, true);
  v.setInt16(120, 7, true);
  v.setInt16(124, ItemType.ZBROJ, true);
  v.setInt16(126, 4, true);
  v.setUint16(128, 0x8001, true);
  v.setUint16(138, 300, true);
  v.setInt16(146, 11, true);
  v.setInt16(152, 22, true);
  b[154] = 2;
  v.setInt16(156, 9, true);
  v.setInt16(158 + 15 * 2, 77, true);
  v.setUint16(190, 1, true);
  v.setUint16(192, 2, true);
  v.setInt8(194, -1);
  return b;
}

describe('parseItems', () => {
  it('parses TITEM fields at C offsets', () => {
    const [it0] = parseItems(makeItem('Sword'));
    expect(it0).toMatchObject({
      jmeno: 'Sword',
      popis: 'X',
      podminky: [10, 0, 0, 0],
      hmotnost: 7,
      druh: ItemType.ZBROJ,
      umisteni: 4,
      flags: 0x8001,
      ikona: 300,
      polohy: [
        [11, 0],
        [0, 22],
      ],
      typZbrane: 2,
      sound: 9,
      cena: 1 + 2 * 65536,
      weaponAttack: -1,
    });
    expect(it0?.zmeny[0]).toBe(5);
    expect(it0?.zmeny[23]).toBe(-3);
    expect(it0?.vLetu[15]).toBe(77);
  });

  it('parses a table and ignores trailing partial record', () => {
    const a = makeItem('A');
    const bb = makeItem('B');
    const buf = new Uint8Array(TITEM_SIZE * 2 + 10);
    buf.set(a, 0);
    buf.set(bb, TITEM_SIZE);
    const items = parseItems(buf);
    expect(items.map((i) => i.jmeno)).toEqual(['A', 'B']);
  });
});
