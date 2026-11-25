import { describe, expect, it } from 'vitest';
import { parseMob, parseMobPlacements, parseMobTable, TMOB_SIZE } from './mobs';

function fixture(): Uint8Array {
  const buf = new Uint8Array(TMOB_SIZE);
  const v = new DataView(buf.buffer);
  buf.set([...'Skeleton'].map((c) => c.charCodeAt(0)), 0);
  v.setInt16(32, -5, true);
  v.setUint16(224, 1234, true);
  v.setUint16(226, 2, true);
  v.setInt8(228, -3);
  v.setInt16(234, 77, true);
  v.setInt16(282, 99, true);
  v.setInt16(314, 40, true);
  buf.set([...'SKEL'].map((c) => c.charCodeAt(0)), 335);
  v.setUint8(343, 200);
  v.setInt32(344, 123456, true);
  v.setUint16(364, 7, true);
  v.setInt16(368, -1, true);
  v.setUint16(372, 500, true);
  v.setInt8(378, 9);
  return buf;
}

describe('parseMob', () => {
  it('reads TMOB fields at C struct offsets', () => {
    const m = parseMob(fixture());
    expect(m.name).toBe('Skeleton');
    expect(m.adjusting[0]).toBe(-5);
    expect(m.sector).toBe(1234);
    expect(m.dir).toBe(2);
    expect(m.locx).toBe(-3);
    expect(m.vlastnosti[0]).toBe(77);
    expect(m.inv[0]).toBe(99);
    expect(m.lives).toBe(40);
    expect(m.mobsName).toBe('SKEL');
    expect(m.id).toBe(200);
    expect(m.experience).toBe(123456);
    expect(m.sounds[3]).toBe(7);
    expect(m.dialog).toBe(-1);
    expect(m.money).toBe(500);
    expect(m.userData).toBe(9);
  });

  it('splits a table into records', () => {
    const table = new Uint8Array(TMOB_SIZE * 2 + 10);
    table.set(fixture(), TMOB_SIZE);
    const mobs = parseMobTable(table);
    expect(mobs).toHaveLength(2);
    expect(mobs[0]?.name).toBe('');
    expect(mobs[1]?.name).toBe('Skeleton');
  });
});

describe('parseMobPlacements', () => {
  it('decodes sector, template number and dir like load_enemies', () => {
    const buf = new Uint8Array(8);
    const v = new DataView(buf.buffer);
    v.setInt16(0, 42, true);
    v.setUint16(2, (3 << 14) | 0x123, true);
    v.setInt16(4, 7, true);
    v.setUint16(6, 5, true);
    expect(parseMobPlacements(buf)).toEqual([
      { sector: 42, templateNumber: 0x123, dir: 3 },
      { sector: 7, templateNumber: 5, dir: 0 },
    ]);
  });
});
