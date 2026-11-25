export const SPELL_RECORD_SIZE = 56;
export const SPELL_NAME_SIZE = 28;

export interface SpellDef {
  num: number;
  um: number;
  mge: number;
  pc: number;
  owner: number;
  accnum: number;
  start: number;
  cil: number;
  povaha: number;
  traceon: number;
  bkdm: number;
  wait: number;
  delay: number;
  spellname: string;
  teleportTarget: number;
}

function readName(bytes: Uint8Array, offset: number): string {
  let end = offset;
  const limit = offset + SPELL_NAME_SIZE;
  while (end < limit && bytes[end] !== 0) end++;
  let s = '';
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

export function countLegacySpells(view: DataView): number {
  let end = view.getInt32(12, true);
  let count = 1;
  let ofs = SPELL_RECORD_SIZE;
  while (ofs < end && ofs + SPELL_RECORD_SIZE <= view.byteLength) {
    count++;
    const end2 = view.getInt32(ofs + 12, true);
    if (end2 < end) end = end2;
    ofs += SPELL_RECORD_SIZE;
  }
  return count;
}

export function parseLegacySpellTable(
  data: Uint8Array,
  names?: readonly (string | undefined)[],
): SpellDef[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = countLegacySpells(view);
  const spells: SpellDef[] = [];
  for (let i = 0; i < count; i++) {
    const b = i * SPELL_RECORD_SIZE;
    const name = names?.[i];
    spells.push({
      num: view.getUint16(b, true),
      um: view.getUint16(b + 2, true),
      mge: view.getUint16(b + 4, true),
      pc: view.getUint16(b + 6, true),
      owner: view.getInt16(b + 8, true),
      accnum: view.getInt16(b + 10, true),
      start: view.getInt32(b + 12, true),
      cil: view.getInt16(b + 16, true),
      povaha: view.getInt8(b + 18),
      bkdm: view.getUint16(b + 19, true),
      wait: view.getUint16(b + 21, true),
      delay: view.getUint16(b + 23, true),
      traceon: view.getInt8(b + 25),
      spellname: name !== undefined ? name.slice(0, SPELL_NAME_SIZE - 1) : readName(data, b + 26),
      teleportTarget: view.getUint16(b + 54, true),
    });
  }
  return spells;
}

export const getSpellMana = (t: readonly SpellDef[], n: number): number => t[n]?.mge ?? 0;
export const getSpellUm = (t: readonly SpellDef[], n: number): number => t[n]?.um ?? 0;
export const getSpellUsed = (t: readonly SpellDef[], n: number): boolean => (t[n]?.start ?? 0) !== 0;
export const getSpellTrack = (t: readonly SpellDef[], n: number): boolean => ((t[n]?.traceon ?? 0) & 1) !== 0;
export const getSpellTeleport = (t: readonly SpellDef[], n: number): boolean =>
  ((t[n]?.traceon ?? 0) & 2) !== 0;

export function mgochrana(x: number): number {
  if (x > 100) return 100;
  return 100 - x;
}

export function hodNaUspech(
  cil: number,
  spell: Pick<SpellDef, 'povaha' | 'pc'>,
  resistances: (cil: number) => readonly number[],
  rnd: (max: number) => number,
): boolean {
  if (!spell.povaha) return true;
  if (cil) {
    const zv = mgochrana(resistances(cil)[spell.pc] ?? 0);
    const z = rnd(100);
    return z <= zv;
  }
  return false;
}
