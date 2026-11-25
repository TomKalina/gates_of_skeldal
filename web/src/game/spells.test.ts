import { describe, expect, it } from 'vitest';
import {
  SPELL_RECORD_SIZE,
  getSpellMana,
  getSpellTeleport,
  getSpellTrack,
  getSpellUm,
  getSpellUsed,
  hodNaUspech,
  mgochrana,
  parseLegacySpellTable,
} from './spells';

function record(view: DataView, i: number, o: { um: number; mge: number; start: number; traceon: number; name: string }) {
  const b = i * SPELL_RECORD_SIZE;
  view.setUint16(b, i, true);
  view.setUint16(b + 2, o.um, true);
  view.setUint16(b + 4, o.mge, true);
  view.setInt32(b + 12, o.start, true);
  view.setInt8(b + 18, 1);
  view.setUint16(b + 19, 7, true);
  view.setUint16(b + 21, 3, true);
  view.setUint16(b + 23, 4, true);
  view.setInt8(b + 25, o.traceon);
  for (let k = 0; k < o.name.length; k++) view.setUint8(b + 26 + k, o.name.charCodeAt(k));
}

function fixture(): Uint8Array {
  const data = new Uint8Array(SPELL_RECORD_SIZE * 3 + 8);
  const view = new DataView(data.buffer);
  const codeStart = SPELL_RECORD_SIZE * 3;
  record(view, 0, { um: 5, mge: 10, start: codeStart, traceon: 1, name: 'Blesk' });
  record(view, 1, { um: 9, mge: 20, start: codeStart + 4, traceon: 2, name: 'Teleport' });
  record(view, 2, { um: 0, mge: 0, start: 0, traceon: 0, name: '' });
  view.setInt32(2 * SPELL_RECORD_SIZE + 12, codeStart, true);
  return data;
}

describe('parseLegacySpellTable', () => {
  it('counts records up to smallest code offset and remaps traceon', () => {
    const t = parseLegacySpellTable(fixture());
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ num: 0, um: 5, mge: 10, povaha: 1, bkdm: 7, wait: 3, delay: 4, traceon: 1, spellname: 'Blesk' });
    expect(t[1]?.spellname).toBe('Teleport');
  });

  it('overrides names from string table', () => {
    const t = parseLegacySpellTable(fixture(), ['Lightning']);
    expect(t[0]?.spellname).toBe('Lightning');
    expect(t[1]?.spellname).toBe('Teleport');
  });

  it('exposes accessors', () => {
    const t = parseLegacySpellTable(fixture());
    expect(getSpellMana(t, 1)).toBe(20);
    expect(getSpellUm(t, 0)).toBe(5);
    expect(getSpellUsed(t, 0)).toBe(true);
    expect(getSpellTrack(t, 0)).toBe(true);
    expect(getSpellTeleport(t, 0)).toBe(false);
    expect(getSpellTeleport(t, 1)).toBe(true);
  });
});

describe('hodNaUspech', () => {
  it('follows mgochrana roll', () => {
    expect(mgochrana(150)).toBe(100);
    expect(mgochrana(30)).toBe(70);
    const res = () => [30, 0];
    expect(hodNaUspech(1, { povaha: 0, pc: 0 }, res, () => 99)).toBe(true);
    expect(hodNaUspech(0, { povaha: 1, pc: 0 }, res, () => 0)).toBe(false);
    expect(hodNaUspech(1, { povaha: 1, pc: 0 }, res, () => 70)).toBe(true);
    expect(hodNaUspech(1, { povaha: 1, pc: 0 }, res, () => 71)).toBe(false);
  });
});
