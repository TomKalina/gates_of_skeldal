import { describe, expect, it } from 'vitest';
import { parseItemsFile } from './items-file';

// Builds a synthetic ITEMS.DAT buffer following the real block layout (tag +
// type + size + ignored int32 + payload) — no copyrighted item data involved.
function block(type: number, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(20);
  const view = new DataView(header.buffer);
  new TextEncoder().encodeInto('<BLOCK>\0', header);
  view.setInt32(8, type, true);
  view.setInt32(12, payload.length, true);
  view.setInt32(16, 0, true); // ignored
  return new Uint8Array([...header, ...payload]);
}

function nulSeparated(names: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts = names.map((n) => [...encoder.encode(n), 0]).flat();
  return new Uint8Array(parts);
}

// TITEM is 222 bytes; only vzhled (offset 140, u16) matters here.
function titemPayload(vzhledValues: number[]): Uint8Array {
  const payload = new Uint8Array(vzhledValues.length * 222);
  const view = new DataView(payload.buffer);
  vzhledValues.forEach((vzhled, i) => view.setUint16(i * 222 + 140, vzhled, true));
  return payload;
}

function buildItemsBuffer(): ArrayBuffer {
  const chunks = [
    block(0x8001, titemPayload([1, 2, 0])),
    block(1, nulSeparated(['ITEM01.PCX', 'ITEM02.PCX'])),
    block(0x8000, new Uint8Array(0)),
  ];
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer.buffer;
}

describe('parseItemsFile', () => {
  it('resolves each item number to its face-0 appearance texture via vzhled', () => {
    const items = parseItemsFile(buildItemsBuffer());
    expect(items.itemAppearance).toEqual(['ITEM01.PCX', 'ITEM02.PCX', null]);
  });

  it('is order-independent between the TITEM list and the face-0 name list blocks', () => {
    const buffer = new Uint8Array([
      ...block(1, nulSeparated(['ITEM01.PCX', 'ITEM02.PCX'])),
      ...block(0x8001, titemPayload([2, 1])),
      ...block(0x8000, new Uint8Array(0)),
    ]).buffer;
    const items = parseItemsFile(buffer);
    expect(items.itemAppearance).toEqual(['ITEM02.PCX', 'ITEM01.PCX']);
  });
});
