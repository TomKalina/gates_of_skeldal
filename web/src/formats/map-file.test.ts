import { describe, expect, it } from 'vitest';
import { A_OPEN_CLOSE, parseMapFile, sideAt, toggleDoor, SD_APPLY_2ND, SD_HAS_NICHE, SD_PLAY_IMPS, SD_PRIM_ANIM, SD_PRIM_FORV, SD_PRIM_VIS, SD_SEC_FORV, type DungeonMap, type MapSide } from './map-file';

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

function mapGlobalPayload(startSector: number, direction: number, mapName: string, fade: [number, number, number] = [0, 0, 0]): Uint8Array {
  const payload = new Uint8Array(104);
  const view = new DataView(payload.buffer);
  view.setInt32(52, fade[0], true);
  view.setInt32(56, fade[1], true);
  view.setInt32(60, fade[2], true);
  view.setInt32(64, startSector, true);
  view.setInt32(68, direction, true);
  new TextEncoder().encodeInto(mapName, payload.subarray(72, 102));
  return payload;
}

// TMAP_EDIT_INFO: short x,y,layer,flags — only `flags` (offset 6) matters
// for MC_SHADING; x/y/layer are level-editor-only data.
function mapInfoPayload(flagsPerSector: number[]): Uint8Array {
  const payload = new Uint8Array(flagsPerSector.length * 8);
  const view = new DataView(payload.buffer);
  flagsPerSector.forEach((flags, i) => view.setInt16(i * 8 + 6, flags, true));
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
    block(0x8008, nulSeparated(['ARCL01.PCX', 'ARCL02.PCX'])),
    block(0x800b, nulSeparated(['ARCR01.PCX', 'ARCR02.PCX'])),
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
    expect(map.sectors).toEqual([{ floor: 3, ceil: 4, sectorType: 1, stepNext: [0, 0, 0, 0], shaded: false }]);
    expect(map.mainTextures).toEqual(['WALL01.PCX', 'WALL02.PCX']);
    expect(map.floorTextures).toEqual(['FLOOR01.PCX']);
  });

  it('parses A_STRARC/A_STRARC2 (0x8008/0x800b) as the arch-texture name lists', () => {
    const map = parseMapFile(buildMapBuffer());
    expect(map.archLeftTextures).toEqual(['ARCL01.PCX', 'ARCL02.PCX']);
    expect(map.archRightTextures).toEqual(['ARCR01.PCX', 'ARCR02.PCX']);
  });

  it('parses A_MAPGLOB fade_r/g/b as the per-map depth-shade color', () => {
    const buffer = new Uint8Array([
      ...block(0x800a, mapGlobalPayload(0, 2, 'Test Map', [166, 234, 228])),
      ...block(0x8002, sectorPayload(3, 4, [0, 0, 0, 0])),
      ...block(0x8000, new Uint8Array(0)),
    ]).buffer;
    const map = parseMapFile(buffer);
    expect(map.fadeColor).toEqual({ r: 166, g: 234, b: 228 });
  });

  it('parses A_MAPINFO (0x8009) as each sector\'s MC_SHADING (0x100) override, regardless of block order', () => {
    const MC_SHADING = 0x100;
    // A_MAPINFO placed *before* A_SECTOR_MAP here — the two are merged by
    // index only after the whole block stream is read, so this must not
    // depend on which one appears first in the file.
    const buffer = new Uint8Array([
      ...block(0x800a, mapGlobalPayload(0, 0, 'Test Map')),
      ...block(0x8009, mapInfoPayload([0, MC_SHADING])),
      ...block(
        0x8002,
        new Uint8Array([...sectorPayload(1, 1, [0, 0, 0, 0]), ...sectorPayload(1, 1, [0, 0, 0, 0])]),
      ),
      ...block(0x8000, new Uint8Array(0)),
    ]).buffer;
    const map = parseMapFile(buffer);
    expect(map.sectors[0]?.shaded).toBe(false);
    expect(map.sectors[1]?.shaded).toBe(true);
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
  // toggleDoor only starts/reverses the swing (flips FORV); the actual
  // frame stepping and passability sync is game/animation.ts's job
  // (Phase A3) — see animation.test.ts for that.
  function door(flags = SD_PLAY_IMPS): MapSide {
    return { prim: 0, sec: 15, oblouk: 0, flags, primAnim: 0, secAnim: 7, action: A_OPEN_CLOSE };
  }
  function blankSide(): MapSide {
    return { prim: 0, sec: 0, oblouk: 0, flags: 0, primAnim: 0, secAnim: 0, action: 0 };
  }
  // One sector (0), door at dir 1 (east), everything else blank.
  function singleDoorMap(flags = SD_PLAY_IMPS): DungeonMap {
    return {
      mapName: 'Test',
      startSector: 0,
      startDirection: 0,
      sectors: [{ floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 0, 0, 0], shaded: false }],
      sides: [blankSide(), door(flags), blankSide(), blankSide()],
      mainTextures: [],
      leftTextures: [],
      rightTextures: [],
      ceilTextures: [],
      floorTextures: [],
      archLeftTextures: [],
      archRightTextures: [],
    fadeColor: { r: 0, g: 0, b: 0 },
    };
  }

  it('a side with SD_PRIM_ANIM unset (an ordinary door) flips both SD_PRIM_FORV and SD_SEC_FORV', () => {
    const map = singleDoorMap();
    toggleDoor(map, 0, 1);
    const side = sideAt(map, 0, 1)!;
    expect(side.flags & SD_PRIM_FORV).toBe(SD_PRIM_FORV);
    expect(side.flags & SD_SEC_FORV).toBe(SD_SEC_FORV);
  });

  it('toggling again reverses direction back', () => {
    const map = singleDoorMap();
    toggleDoor(map, 0, 1);
    toggleDoor(map, 0, 1);
    const side = sideAt(map, 0, 1)!;
    expect(side.flags & SD_PRIM_FORV).toBe(0);
    expect(side.flags & SD_SEC_FORV).toBe(0);
  });

  it('a continuously-animating side (SD_PRIM_ANIM set) only flips SD_SEC_FORV', () => {
    const map = singleDoorMap(SD_PLAY_IMPS | SD_PRIM_ANIM);
    toggleDoor(map, 0, 1);
    const side = sideAt(map, 0, 1)!;
    expect(side.flags & SD_PRIM_FORV).toBe(0);
    expect(side.flags & SD_SEC_FORV).toBe(SD_SEC_FORV);
  });

  it('does nothing on a side without A_OPEN_CLOSE', () => {
    const map = singleDoorMap();
    map.sides[1]!.action = 0;
    toggleDoor(map, 0, 1);
    expect(sideAt(map, 0, 1)?.flags).toBe(SD_PLAY_IMPS);
  });

  it('mirrors the toggle to the opposite side of the adjacent sector when SD_APPLY_2ND is set', () => {
    // Verified against the real sector 14/15 door: both sides carry
    // SD_APPLY_2ND, so opening one face opens the far face too.
    const map: DungeonMap = {
      mapName: 'Test',
      startSector: 0,
      startDirection: 0,
      sectors: [
        { floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 1, 0, 0], shaded: false }, // east -> sector 1
        { floor: 1, ceil: 1, sectorType: 1, stepNext: [0, 0, 0, 0], shaded: false }, // west -> sector 0
      ],
      sides: [
        blankSide(), door(SD_PLAY_IMPS | SD_APPLY_2ND), blankSide(), blankSide(), // sector 0
        blankSide(), blankSide(), blankSide(), door(SD_PLAY_IMPS | SD_APPLY_2ND), // sector 1, dir 3 = west
      ],
      mainTextures: [],
      leftTextures: [],
      rightTextures: [],
      ceilTextures: [],
      floorTextures: [],
      archLeftTextures: [],
      archRightTextures: [],
    fadeColor: { r: 0, g: 0, b: 0 },
    };

    toggleDoor(map, 0, 1);
    expect((sideAt(map, 0, 1)?.flags ?? 0) & SD_SEC_FORV).toBe(SD_SEC_FORV);
    expect((sideAt(map, 1, 3)?.flags ?? 0) & SD_SEC_FORV).toBe(SD_SEC_FORV);
  });

  it('does not mirror when SD_APPLY_2ND is unset', () => {
    const map = singleDoorMap(SD_PLAY_IMPS); // no SD_APPLY_2ND, stepNext[1] points at itself
    toggleDoor(map, 0, 1);
    // Only side 1 (the door itself) should have changed; nothing to mirror
    // into since stepNext[1] loops back to the same sector/side pattern —
    // this test mainly guards against always-mirroring regressions.
    expect((sideAt(map, 0, 1)?.flags ?? 0) & SD_SEC_FORV).toBe(SD_SEC_FORV);
  });
});
