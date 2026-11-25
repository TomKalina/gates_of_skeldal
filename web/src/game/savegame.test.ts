import { describe, expect, it } from 'vitest';
import { deserializeSSave, S_SAVE_SIZE, serializeSSave, type SSave } from './savegame';

const sample: SSave = {
  viewsector: 1234,
  viewdir: 2,
  version: 0,
  gold: 5000,
  curGroup: 1,
  autosave: 1,
  enableSort: 1,
  shownames: 0,
  showlives: 1,
  zoomSpeed: 3,
  turnSpeed: 4,
  autoattack: 1,
  musicVol: 200,
  sampleVol: 255,
  xbass: 10,
  bass: 20,
  treble: 30,
  stereing: 40,
  swapchans: 0,
  outFilter: 1,
  globFlags: 0x12345678,
  gameTime: 987654,
  runes: [1, 2, 3, 4, 5],
  levelName: 'LESPOD.MAP',
  picks: 2,
  itemsAdded: 3,
  sleepLong: 600,
  gameFlags: 0x5,
};

describe('S_SAVE', () => {
  it('round-trips', () => {
    const buf = serializeSSave(sample);
    expect(buf.length).toBe(S_SAVE_SIZE);
    expect(deserializeSSave(buf)).toEqual(sample);
  });

  it('places fields at C struct offsets', () => {
    const buf = serializeSSave(sample);
    const v = new DataView(buf.buffer);
    expect(v.getInt32(0, true)).toBe(1234);
    expect(v.getInt32(12, true)).toBe(5000);
    expect(buf[25]).toBe(200);
    expect(String.fromCharCode(...buf.slice(49, 59))).toBe('LESPOD.MAP');
    expect(v.getInt32(72, true)).toBe(5);
  });

  it('rejects short buffers', () => {
    expect(() => deserializeSSave(new Uint8Array(10))).toThrow();
  });
});
