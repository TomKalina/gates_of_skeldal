import { describe, expect, it } from 'vitest';
import { decodeMus, readMusInfo } from './mus';
import { decodeWav } from './wav';

function musFixture(): Uint8Array {
  const block = [3, 1, 2, 0];
  const buf = new Uint8Array(534 + 8 + block.length);
  const dv = new DataView(buf.buffer);
  dv.setInt16(0, 2, true);
  dv.setInt32(2, 22050, true);
  dv.setInt32(10, 1, true);
  dv.setInt16(22 + 1 * 2, 100, true);
  dv.setInt16(22 + 2 * 2, -50, true);
  dv.setInt16(22 + 3 * 2, 10, true);
  dv.setInt32(534, block.length, true);
  buf.set(block, 542);
  return buf;
}

describe('MUS decoder', () => {
  it('reads header', () => {
    expect(readMusInfo(musFixture())).toEqual({ channels: 2, freq: 22050, blocks: 1 });
  });
  it('delta-decodes interleaved channels with the zero-code quirk', () => {
    const d = decodeMus(musFixture());
    expect(Array.from(d.samples[0] ?? [])).toEqual([10, 100, -40, 100 - 31767]);
  });
});

describe('WAV decoder', () => {
  it('parses fmt and data chunks', () => {
    const buf = new Uint8Array(12 + 8 + 16 + 8 + 4);
    const dv = new DataView(buf.buffer);
    buf.set([82, 73, 70, 70], 0);
    buf.set([87, 65, 86, 69], 8);
    buf.set([102, 109, 116, 32], 12);
    dv.setInt32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setInt32(24, 11025, true);
    dv.setInt32(28, 22050, true);
    buf.set([100, 97, 116, 97], 36);
    dv.setInt32(40, 4, true);
    buf.set([1, 2, 3, 4], 44);
    const w = decodeWav(buf);
    expect(w.format).toEqual({ wavMode: 1, chans: 1, freq: 11025, bps: 22050 });
    expect(Array.from(w.data)).toEqual([1, 2, 3, 4]);
  });
});
