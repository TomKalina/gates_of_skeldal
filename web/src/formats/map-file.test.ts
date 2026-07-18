import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, parseMapFile, sideAt, toggleDoor, SD_HAS_NICHE, SD_PLAY_IMPS, SD_PRIM_VIS, type MapSide } from './map-file';

// Builds a synthetic .MAP buffer following the real block layout (tag +
// type + size + ignored int32 + payload) — no copyrighted map data involved.
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

function mapGlobalPayload(startSector: number, direction: number, mapName: string): Uint8Array {
  const payload = new Uint8Array(104);
  const view = new DataView(payload.buffer);
  view.setInt32(64, startSector, true);
  view.setInt32(68, direction, true);
  new TextEncoder().encodeInto(mapName, payload.subarray(72, 102));
  return payload;
}

function sectorPayload(floor: number, ceil: number, stepNext: [number, number, number, number]): Uint8Array {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  payload[0] = floor;
  payload[1] = ceil;
  payload[3] = 1; // sectorType
  view.setUint16(6, stepNext[0], true);
  view.setUint16(8, stepNext[1], true);
  view.setUint16(10, stepNext[2], true);
  view.setUint16(12, stepNext[3], true);
  return payload;
}

function sidePayload(prim: number, flags: number, oblouk = 0, action = 0): Uint8Array {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  payload[0] = prim;
  payload[2] = oblouk;
  view.setUint32(8, flags, true);
  payload[15] = action;
  return payload;
}

function buildMapBuffer(): ArrayBuffer {
  const chunks = [
    block(0x800a, mapGlobalPayload(0, 2, 'Test Map')),
    block(0x8002, sectorPayload(3, 4, [0, 0, 0, 0])),
    block(
      0x8001,
      new Uint8Array([
        ...sidePayload(1, 0),
        ...sidePayload(2, SD_PLAY_IMPS | SD_PRIM_VIS),
        ...sidePayload(3, 0, SD_HAS_NICHE),
        ...sidePayload(4, 0),
      ]),
    ),
    block(0x8003, nulSeparated(['WALL01.PCX', 'WALL02.PCX'])),
    block(0x8007, nulSeparated(['FLOOR01.PCX'])),
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

describe('parseMapFile', () => {
  it('parses map globals, sectors, sides and texture lists', () => {
    const map = parseMapFile(buildMapBuffer());

    expect(map.mapName).toBe('Test Map');
    expect(map.startSector).toBe(0);
    expect(map.startDirection).toBe(2);
    expect(map.sectors).toEqual([{ floor: 3, ceil: 4, sectorType: 1, stepNext: [0, 0, 0, 0] }]);
    expect(map.mainTextures).toEqual(['WALL01.PCX', 'WALL02.PCX']);
    expect(map.floorTextures).toEqual(['FLOOR01.PCX']);
  });

  it('exposes sides indexed by sector*4+direction via sideAt', () => {
    const map = parseMapFile(buildMapBuffer());
    expect(sideAt(map, 0, 0)).toEqual({ prim: 1, sec: 0, oblouk: 0, flags: 0, primAnim: 0, secAnim: 0, action: 0 });
    expect(sideAt(map, 0, 1)).toEqual({ prim: 2, sec: 0, oblouk: 0, flags: SD_PLAY_IMPS | SD_PRIM_VIS, primAnim: 0, secAnim: 0, action: 0 });
  });

  it('parses oblouk, whose SD_HAS_NICHE bit flags a side with a TVYKLENEK niche attached', () => {
    const map = parseMapFile(buildMapBuffer());
    expect(sideAt(map, 0, 2)?.oblouk).toBe(SD_HAS_NICHE);
  });

  it('parses the action byte at TSTENA offset 15', () => {
    const buffer = buildMapBufferWithAction();
    const map = parseMapFile(buffer);
    expect(sideAt(map, 0, 3)?.action).toBe(A_OPEN_CLOSE);
  });
});

// A second buffer with side 3's action byte set — kept separate from
// buildMapBuffer() so the main fixture's existing assertions don't need to
// account for a new non-zero field on an already-asserted side.
function buildMapBufferWithAction(): ArrayBuffer {
  const chunks = [
    block(0x800a, mapGlobalPayload(0, 2, 'Test Map')),
    block(0x8002, sectorPayload(3, 4, [0, 0, 0, 0])),
    block(
      0x8001,
      new Uint8Array([...sidePayload(1, 0), ...sidePayload(2, SD_PLAY_IMPS | SD_PRIM_VIS), ...sidePayload(3, 0, SD_HAS_NICHE), ...sidePayload(0, SD_PLAY_IMPS, 0, A_OPEN_CLOSE)]),
    ),
    block(0x8003, nulSeparated(['WALL01.PCX', 'WALL02.PCX'])),
    block(0x8007, nulSeparated(['FLOOR01.PCX'])),
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

describe('toggleDoor', () => {
  function door(): MapSide {
    return { prim: 0, sec: 15, oblouk: 0, flags: SD_PLAY_IMPS, primAnim: 0, secAnim: 7, action: A_OPEN_CLOSE };
  }

  it('opens a closed door: clears SD_PLAY_IMPS and steps secAnim to the open frame offset', () => {
    const side = door();
    toggleDoor(side);
    expect(side.flags & SD_PLAY_IMPS).toBe(0);
    expect(side.secAnim >> 4).toBe(6);
    expect(side.secAnim & 0xf).toBe(7); // low nibble (delay/other data) preserved
  });

  it('closes an open door back: sets SD_PLAY_IMPS and reverts the frame offset', () => {
    const side = door();
    toggleDoor(side);
    toggleDoor(side);
    expect(side.flags & SD_PLAY_IMPS).toBe(SD_PLAY_IMPS);
    expect(side.secAnim >> 4).toBe(0);
  });

  it('does nothing on a side without A_OPEN_CLOSE', () => {
    const side = { ...door(), action: 0 };
    toggleDoor(side);
    expect(side.flags & SD_PLAY_IMPS).toBe(SD_PLAY_IMPS);
    expect(side.secAnim >> 4).toBe(0);
  });
});
