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
const BLOCK_STR_ARC = 0x8008;
const BLOCK_MAP_INFO = 0x8009;
const BLOCK_MAP_GLOB = 0x800a;
const BLOCK_STR_ARC2 = 0x800b;
const BLOCK_MAP_END = 0x8000;

const TSTENA_SIZE = 16;
const TSECTOR_SIZE = 16;
const MAPGLOBAL_SIZE = 105;
// TMAP_EDIT_INFO (game/globals.h): short x,y,layer,flags — 8 bytes/sector,
// one entry per sector in the same order as A_SECTOR_MAP. Only `flags`
// (offset 6) is used here, for MC_SHADING.
const MAP_EDIT_INFO_SIZE = 8;
// game/globals.h: `#define MC_SHADING 0x100` ("druhe stinovani (do tmy)" —
// "second shading, toward darkness") — a per-sector override selecting
// palette_shadow's fade-to-black half instead of the default fade-to-the-
// map's-own-ambient-color half. Set by render_scene per visible sector
// (`if (map_coord[s].flags & MC_SHADING) secnd_shade=1; else secnd_shade=0;`
// game/builder.c) — real, load-bearing per-sector map data (up to 29% of
// sectors in some shipped maps), not a debug/cheat toggle.
const MC_SHADING = 0x100;

// Side (TSTENA) flag bits relevant to rendering/movement (game/globals.h).
export const SD_PLAY_IMPS = 0x2;
export const SD_TRANSPARENT = 0x80;
export const SD_PRIM_ANIM = 0x100;
export const SD_PRIM_VIS = 0x200;
export const SD_PRIM_GAB = 0x400;
export const SD_PRIM_FORV = 0x800;
export const SD_SEC_ANIM = 0x1000;
export const SD_SEC_VIS = 0x2000;
export const SD_SEC_GAB = 0x4000;
export const SD_SEC_FORV = 0x8000;
// do_action()'s trailing forward, verified set on both the sector 14 and
// sector 15 sides of the real door: `if (q->flags & SD_APPLY_2ND &&
// s->step_next[direct]) do_action(action_numb, s->step_next[direct],
// (direct+2)&3, flags, 1);` — after acting on one side, the same action
// replays on the *opposite* side of the sector across it, keeping a
// mirrored door pair in sync (open one face, the far face opens too).
export const SD_APPLY_2ND = 0x400000;
// draw_basic_sector's gate for drawing an arch-texture overlay on a side's
// front wall (game/globals.h) — separate 32-bit flags bits, NOT part of
// oblouk. Verified against real LESPRED.MAP data: 623/1204 sides have a
// non-zero oblouk&0xf (arch index), but only 218 of those also carry one of
// these flags — the other 405 have an inert, never-drawn index. Both bits
// can be set independently (a side can draw both halves at once).
export const SD_LEFT_ARC = 0x10000;
export const SD_RIGHT_ARC = 0x20000;

// `oblouk` (TSTENA byte offset 2, game/globals.h's struct tstena) packs
// several unrelated sub-fields into one byte; builder.c reads them as
// `oblouk & 0xf` (an arch-texture index, gated by SD_LEFT_ARC/SD_RIGHT_ARC
// above — see GET_OBLOUK/draw_basic_sector), `oblouk & 0x10` (has this side
// got a TVYKLENEK niche attached — `if (q->oblouk & 0x10) draw_vyklenek(...)`),
// and `oblouk & SD_POSITION` (0x60, a 2-bit vertical-anchor selector for
// show_cel2's `plac`). The niche bit isn't a named constant in the source;
// SD_HAS_NICHE here is this port's own name for it (the C source calls it
// SD_RECESS).
export const SD_HAS_NICHE = 0x10;

// realgame.c's do_action() action codes (TSTENA byte offset 15, `action`).
// A_OPEN_CLOSE toggles a door: verified against LESPRED.MAP sector 14's
// east side (mirrored with sector 15's west side) — prim=0, sec=15
// (LES1A11A.PCX, a closed wooden door) with SD_PLAY_IMPS set. secAnim's
// low nibble (7 here) is the frame count (`pk`/`sk` in calc_animations,
// realgame.c) — the real engine steps the upper nibble through it one
// frame per tick (LES1A11A..17A.PCX) via SD_PRIM_FORV/SD_SEC_FORV; see
// game/animation.ts (Phase A3) for that stepper. This function only
// starts/reverses the swing (flips the FORV direction flags, matching
// do_action's A_OPEN_CLOSE case exactly) — it doesn't touch the frame or
// passability directly; those change gradually as the animation steps.
export const A_OPEN_CLOSE = 3;

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
  action: number;
}

// do_action's A_OPEN_CLOSE case exactly: `if (!(q->flags & SD_PRIM_ANIM))
// q->flags ^= SD_PRIM_FORV | SD_SEC_FORV; else q->flags ^= SD_SEC_FORV;` —
// a continuously-cycling side (SD_PRIM_ANIM set, e.g. an idle swinging
// decoration) only reverses its secondary channel; a one-shot side (an
// ordinary door, SD_PRIM_ANIM unset) reverses both.
function reverseDoorDirection(side: MapSide): void {
  if ((side.flags & SD_PRIM_ANIM) === 0) side.flags ^= SD_PRIM_FORV | SD_SEC_FORV;
  else side.flags ^= SD_SEC_FORV;
}

// A_OPEN_CLOSE toggle for the side at (sector, direction), plus its
// mirrored opposite side if SD_APPLY_2ND is set (see the constant's own
// comment) — verified against the real sector 14/15 door, where both
// sides carry the flag, so opening it from either side opens both. Only
// starts the swing; game/animation.ts's per-tick stepper carries it
// through to completion. Mutates the map's sides in place — this port
// treats a parsed DungeonMap as live session state, not immutable data,
// the same way character stats mutate in place during chargen.
export function toggleDoor(map: DungeonMap, sector: number, direction: number): void {
  const side = sideAt(map, sector, direction);
  if (!side || side.action !== A_OPEN_CLOSE) return;

  reverseDoorDirection(side);

  if (side.flags & SD_APPLY_2ND) {
    const mirrorSector = map.sectors[sector]?.stepNext[direction];
    if (mirrorSector !== undefined) {
      const mirrorSide = sideAt(map, mirrorSector, (direction + 2) & 3);
      if (mirrorSide && mirrorSide.action === A_OPEN_CLOSE) reverseDoorDirection(mirrorSide);
    }
  }
}

export interface MapSector {
  floor: number;
  ceil: number;
  sectorType: number;
  stepNext: readonly [number, number, number, number];
  // A_MAPINFO's per-sector MC_SHADING bit — see the constant's own comment.
  // Selects palette_shadow's fade-to-black variant for this sector's walls
  // instead of the map's default fade-to-DungeonMap.fadeColor variant.
  shaded: boolean;
}

export interface DungeonMap {
  mapName: string;
  startSector: number;
  startDirection: number;
  // A_MAPGLOB's fade_r/g/b — the per-map ambient/fog color every wall/door/
  // arch texture's distance shading fades toward (see dungeon-view.ts's
  // depth-shade overlay). Real, per-map-authored art direction: outdoor
  // maps fade to a sky haze, underwater maps to deep blue, dungeons to
  // black — verified across all 22 shipped maps' real A_MAPGLOB data.
  fadeColor: { r: number; g: number; b: number };
  sectors: readonly MapSector[];
  // sides[sector * 4 + direction]; direction order matches step_next: 0=N,1=E,2=S,3=W.
  sides: readonly MapSide[];
  mainTextures: readonly string[];
  leftTextures: readonly string[];
  rightTextures: readonly string[];
  ceilTextures: readonly string[];
  floorTextures: readonly string[];
  // OBL_NUM/OBL2_NUM banks (A_STRARC/A_STRARC2) — a side's decorative arch
  // overlay, drawn before its main wall texture when SD_LEFT_ARC/
  // SD_RIGHT_ARC is set (see dungeon.ts's archTextureIndex). Same
  // NUL-separated-filename-list format as every other texture bank above,
  // just gated by different flags/indices at render time.
  archLeftTextures: readonly string[];
  archRightTextures: readonly string[];
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
      // Filled in by parseMapFile once A_MAPINFO (a separate, order-
      // independent block) has also been read — see the merge step there.
      shaded: false,
    });
  }
  return sectors;
}

// A_MAPINFO: one TMAP_EDIT_INFO (4 LE int16s: x,y,layer,flags) per sector,
// same order/count as A_SECTOR_MAP. Only `flags`' MC_SHADING bit matters
// here — x/y/layer are level-editor-only data with no rendering effect.
function parseSectorShading(bytes: Uint8Array, view: DataView): boolean[] {
  const count = Math.floor(bytes.length / MAP_EDIT_INFO_SIZE);
  const shaded: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const flags = view.getInt16(i * MAP_EDIT_INFO_SIZE + 6, true);
    shaded.push((flags & MC_SHADING) !== 0);
  }
  return shaded;
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
      action: bytes[o + 15] ?? 0,
    });
  }
  return sides;
}

function parseMapGlobal(bytes: Uint8Array): { mapName: string; startSector: number; startDirection: number; fadeColor: { r: number; g: number; b: number } } {
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
    fadeColor: {
      r: paddedView.getInt32(52, true),
      g: paddedView.getInt32(56, true),
      b: paddedView.getInt32(60, true),
    },
  };
}

export function parseMapFile(buffer: ArrayBuffer): DungeonMap {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tagBytes = new TextEncoder().encode(BLOCK_TAG);

  let pos = 0;
  let sectors: MapSector[] = [];
  let sectorShading: boolean[] = [];
  let sides: MapSide[] = [];
  let mapName = '';
  let startSector = 0;
  let startDirection = 0;
  let fadeColor = { r: 0, g: 0, b: 0 };
  let mainTextures: string[] = [];
  let leftTextures: string[] = [];
  let rightTextures: string[] = [];
  let ceilTextures: string[] = [];
  let floorTextures: string[] = [];
  let archLeftTextures: string[] = [];
  let archRightTextures: string[] = [];

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
      case BLOCK_MAP_INFO:
        sectorShading = parseSectorShading(payload, payloadView);
        break;
      case BLOCK_SIDE_MAP:
        sides = parseSides(payload, payloadView);
        break;
      case BLOCK_MAP_GLOB: {
        const glob = parseMapGlobal(payload);
        mapName = glob.mapName;
        startSector = glob.startSector;
        startDirection = glob.startDirection;
        fadeColor = glob.fadeColor;
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
      case BLOCK_STR_ARC:
        archLeftTextures = readNulSeparatedList(payload);
        break;
      case BLOCK_STR_ARC2:
        archRightTextures = readNulSeparatedList(payload);
        break;
      default:
        break;
    }

    pos = payloadStart + payloadSize;
  }

  // A_MAPINFO can appear before or after A_SECTOR_MAP in the block stream —
  // merge the two by index only once both are fully read, rather than
  // assuming an ordering.
  if (sectorShading.length > 0) {
    sectors = sectors.map((sector, i) => ({ ...sector, shaded: sectorShading[i] ?? false }));
  }

  return {
    mapName,
    startSector,
    startDirection,
    fadeColor,
    sectors,
    sides,
    mainTextures,
    leftTextures,
    rightTextures,
    ceilTextures,
    floorTextures,
    archLeftTextures,
    archRightTextures,
  };
}

export function sideAt(map: DungeonMap, sector: number, direction: number): MapSide | undefined {
  return map.sides[sector * 4 + direction];
}
