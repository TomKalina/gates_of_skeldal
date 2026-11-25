export const S_SAVE_SIZE = 76;
export const SSAVE_VERSION = 0;
export const GM_MAPENABLE = 0x1;
export const GM_FASTBATTLES = 0x2;
export const GM_GAMESPEED_SHIFT = 2;
export const GM_GAMESPEED_MASK = 0x1f;

export interface SSave {
  viewsector: number;
  viewdir: number;
  version: number;
  gold: number;
  curGroup: number;
  autosave: number;
  enableSort: number;
  shownames: number;
  showlives: number;
  zoomSpeed: number;
  turnSpeed: number;
  autoattack: number;
  musicVol: number;
  sampleVol: number;
  xbass: number;
  bass: number;
  treble: number;
  stereing: number;
  swapchans: number;
  outFilter: number;
  globFlags: number;
  gameTime: number;
  runes: number[];
  levelName: string;
  picks: number;
  itemsAdded: number;
  sleepLong: number;
  gameFlags: number;
}

const BYTE_FIELDS = [
  ['autosave', 18],
  ['enableSort', 19],
  ['shownames', 20],
  ['showlives', 21],
  ['zoomSpeed', 22],
  ['turnSpeed', 23],
  ['autoattack', 24],
  ['musicVol', 25],
  ['sampleVol', 26],
  ['xbass', 27],
  ['bass', 28],
  ['treble', 29],
  ['stereing', 30],
  ['swapchans', 31],
  ['outFilter', 32],
] as const;

export function serializeSSave(s: SSave): Uint8Array {
  const buf = new Uint8Array(S_SAVE_SIZE);
  const v = new DataView(buf.buffer);
  v.setInt32(0, s.viewsector, true);
  v.setInt8(4, s.viewdir);
  v.setInt16(6, s.version, true);
  v.setInt32(12, s.gold, true);
  v.setInt16(16, s.curGroup, true);
  for (const [k, off] of BYTE_FIELDS) v.setUint8(off, s[k] & 0xff);
  v.setInt32(36, s.globFlags, true);
  v.setInt32(40, s.gameTime, true);
  for (let i = 0; i < 5; i++) v.setInt8(44 + i, s.runes[i] ?? 0);
  for (let i = 0; i < 12 && i < s.levelName.length; i++) buf[49 + i] = s.levelName.charCodeAt(i) & 0xff;
  v.setInt16(62, s.picks, true);
  v.setInt16(64, s.itemsAdded, true);
  v.setInt32(68, s.sleepLong, true);
  v.setInt32(72, s.gameFlags, true);
  return buf;
}

export function deserializeSSave(buf: Uint8Array): SSave {
  if (buf.length < S_SAVE_SIZE) throw new Error(`S_SAVE needs ${S_SAVE_SIZE} bytes, got ${buf.length}`);
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let levelName = '';
  for (let i = 49; i < 62 && buf[i] !== 0; i++) levelName += String.fromCharCode(buf[i] ?? 0);
  const s: SSave = {
    viewsector: v.getInt32(0, true),
    viewdir: v.getInt8(4),
    version: v.getInt16(6, true),
    gold: v.getInt32(12, true),
    curGroup: v.getInt16(16, true),
    autosave: 0,
    enableSort: 0,
    shownames: 0,
    showlives: 0,
    zoomSpeed: 0,
    turnSpeed: 0,
    autoattack: 0,
    musicVol: 0,
    sampleVol: 0,
    xbass: 0,
    bass: 0,
    treble: 0,
    stereing: 0,
    swapchans: 0,
    outFilter: 0,
    globFlags: v.getInt32(36, true),
    gameTime: v.getInt32(40, true),
    runes: [0, 1, 2, 3, 4].map((i) => v.getInt8(44 + i)),
    levelName,
    picks: v.getInt16(62, true),
    itemsAdded: v.getInt16(64, true),
    sleepLong: v.getInt32(68, true),
    gameFlags: v.getInt32(72, true),
  };
  for (const [k, off] of BYTE_FIELDS) s[k] = v.getUint8(off);
  return s;
}
