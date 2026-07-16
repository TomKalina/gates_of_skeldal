// Parser for the game's .MAP binary format (game/realgame.c: load_map /
// load_section). A .MAP is a flat sequence of tag-prefixed blocks:
//   char[8]  tag = "<BLOCK>\0"
//   int32    blockType   (one of the A_* constants below, LE)
//   int32    payloadSize (LE)
//   int32    <ignored — not a length; safe to skip, see load_section>
//   uint8[payloadSize] payload
// terminated by a block of type A_MAPEND (payload ignored).
const BLOCK_TAG = '<BLOCK>\0';
const TAG_LENGTH = 8;

// Block type tags (game/globals.h: A_* constants).
const BLOCK_SIDE_MAP = 0x8001;
const BLOCK_SECTOR_MAP = 0x8002;
const BLOCK_STR_MAIN = 0x8003;
const BLOCK_STR_LEFT = 0x8004;
const BLOCK_STR_RIGHT = 0x8005;
const BLOCK_STR_CEIL = 0x8006;
const BLOCK_STR_FLOOR = 0x8007;
const BLOCK_MAP_GLOB = 0x800a;
const BLOCK_MAP_END = 0x8000;

const TSTENA_SIZE = 16;
const TSECTOR_SIZE = 16;
const MAPGLOBAL_SIZE = 105;

// Side (TSTENA) flag bits relevant to rendering/movement (game/globals.h).
export const SD_PLAY_IMPS = 0x2;
export const SD_TRANSPARENT = 0x80;
export const SD_PRIM_VIS = 0x200;
export const SD_SEC_VIS = 0x2000;

// `oblouk` (TSTENA byte offset 2, game/globals.h's struct tstena) packs
// several unrelated sub-fields into one byte; builder.c reads them as
// `oblouk & 0xf` (an arch-texture index), `oblouk & 0x10` (has this side got
// a TVYKLENEK niche attached — `if (q->oblouk & 0x10) draw_vyklenek(...)`),
// and `oblouk & SD_POSITION` (0x60, a 2-bit vertical-anchor selector for
// show_cel2's `plac`). The niche bit isn't a named constant in the source;
// SD_HAS_NICHE here is this port's own name for it.
export const SD_HAS_NICHE = 0x10;

export interface MapSide {
  prim: number;
  sec: number;
  flags: number;
  // Upper nibble is an animation-frame offset added to prim/sec at render
  // time (builder.c's draw_basic_sector: `q->prim + (q->prim_anim >> 4)`) —
  // verified against real data: LESPRED.MAP sector 18's west side has
  // prim=24 pointing at a 4-frame swinging-decoration sequence
  // (LES1A21A..LES1A24A.PCX at consecutive indices) and primAnim=35
  // (0x23, upper nibble 2), so the frame actually shown is prim+2, not
  // prim itself.
  primAnim: number;
  secAnim: number;
  oblouk: number;
}

export interface MapSector {
  floor: number;
  ceil: number;
  sectorType: number;
  stepNext: readonly [number, number, number, number];
}

export interface DungeonMap {
  mapName: string;
  startSector: number;
  startDirection: number;
  sectors: readonly MapSector[];
  // sides[sector * 4 + direction]; direction order matches step_next: 0=N,1=E,2=S,3=W.
  sides: readonly MapSide[];
  mainTextures: readonly string[];
  leftTextures: readonly string[];
  rightTextures: readonly string[];
  ceilTextures: readonly string[];
  floorTextures: readonly string[];
}

function readCString(bytes: Uint8Array, start: number, end: number): string {
  let i = start;
  while (i < end && bytes[i] !== 0) i++;
  return new TextDecoder('ascii').decode(bytes.subarray(start, i));
}

function readNulSeparatedList(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      if (i > start) names.push(readCString(bytes, start, i));
      start = i + 1;
    }
  }
  return names;
}

function parseSectors(bytes: Uint8Array, view: DataView): MapSector[] {
  const count = Math.floor(bytes.length / TSECTOR_SIZE);
  const sectors: MapSector[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * TSECTOR_SIZE;
    sectors.push({
      floor: bytes[o] ?? 0,
      ceil: bytes[o + 1] ?? 0,
      sectorType: bytes[o + 3] ?? 0,
      stepNext: [
        view.getUint16(o + 6, true),
        view.getUint16(o + 8, true),
        view.getUint16(o + 10, true),
        view.getUint16(o + 12, true),
      ],
    });
  }
  return sectors;
}

function parseSides(bytes: Uint8Array, view: DataView): MapSide[] {
  const count = Math.floor(bytes.length / TSTENA_SIZE);
  const sides: MapSide[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * TSTENA_SIZE;
    sides.push({
      prim: bytes[o] ?? 0,
      sec: bytes[o + 1] ?? 0,
      oblouk: bytes[o + 2] ?? 0,
      flags: view.getUint32(o + 8, true),
      primAnim: bytes[o + 12] ?? 0,
      secAnim: bytes[o + 13] ?? 0,
    });
  }
  return sides;
}

function parseMapGlobal(bytes: Uint8Array): { mapName: string; startSector: number; startDirection: number } {
  // load_map zero-fills MAPGLOBAL then memcpy's min(size, sizeof) — some map
  // files' payload is a byte short of the full 105-byte struct, so every read
  // here must tolerate a truncated buffer the same way.
  const padded = new Uint8Array(MAPGLOBAL_SIZE);
  padded.set(bytes.subarray(0, Math.min(bytes.length, MAPGLOBAL_SIZE)));
  const paddedView = new DataView(padded.buffer);
  // MAPGLOBAL layout: back_fnames[4][13]=52B, fade_r/g/b=3*4B (@52,56,60),
  // start_sector (@64), direction (@68), mapname[30] (@72..101).
  return {
    startSector: paddedView.getInt32(64, true),
    startDirection: paddedView.getInt32(68, true),
    mapName: readCString(padded, 72, 102),
  };
}

export function parseMapFile(buffer: ArrayBuffer): DungeonMap {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tagBytes = new TextEncoder().encode(BLOCK_TAG);

  let pos = 0;
  let sectors: MapSector[] = [];
  let sides: MapSide[] = [];
  let mapName = '';
  let startSector = 0;
  let startDirection = 0;
  let mainTextures: string[] = [];
  let leftTextures: string[] = [];
  let rightTextures: string[] = [];
  let ceilTextures: string[] = [];
  let floorTextures: string[] = [];

  for (;;) {
    if (pos + TAG_LENGTH + 12 > bytes.length) break;
    for (let i = 0; i < TAG_LENGTH; i++) {
      if (bytes[pos + i] !== tagBytes[i]) {
        throw new Error(`.MAP: expected block tag "<BLOCK>" at offset ${pos}`);
      }
    }
    const blockType = view.getInt32(pos + TAG_LENGTH, true);
    const payloadSize = view.getInt32(pos + TAG_LENGTH + 4, true);
    const payloadStart = pos + TAG_LENGTH + 12;
    if (blockType === BLOCK_MAP_END) break;
    const payload = bytes.subarray(payloadStart, payloadStart + payloadSize);
    const payloadView = new DataView(buffer, payloadStart, payloadSize);

    switch (blockType) {
      case BLOCK_SECTOR_MAP:
        sectors = parseSectors(payload, payloadView);
        break;
      case BLOCK_SIDE_MAP:
        sides = parseSides(payload, payloadView);
        break;
      case BLOCK_MAP_GLOB: {
        const glob = parseMapGlobal(payload);
        mapName = glob.mapName;
        startSector = glob.startSector;
        startDirection = glob.startDirection;
        break;
      }
      case BLOCK_STR_MAIN:
        mainTextures = readNulSeparatedList(payload);
        break;
      case BLOCK_STR_LEFT:
        leftTextures = readNulSeparatedList(payload);
        break;
      case BLOCK_STR_RIGHT:
        rightTextures = readNulSeparatedList(payload);
        break;
      case BLOCK_STR_CEIL:
        ceilTextures = readNulSeparatedList(payload);
        break;
      case BLOCK_STR_FLOOR:
        floorTextures = readNulSeparatedList(payload);
        break;
      default:
        break;
    }

    pos = payloadStart + payloadSize;
  }

  return {
    mapName,
    startSector,
    startDirection,
    sectors,
    sides,
    mainTextures,
    leftTextures,
    rightTextures,
    ceilTextures,
    floorTextures,
  };
}

export function sideAt(map: DungeonMap, sector: number, direction: number): MapSide | undefined {
  return map.sides[sector * 4 + direction];
}
