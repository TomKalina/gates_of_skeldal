import { ItemPlace, ItemType, type ItemDef } from './items';
import type { Character } from './party';

export const VLS = {
  SILA: 0,
  SMAGIE: 1,
  POHYB: 2,
  OBRAT: 3,
  MAXHIT: 4,
  KONDIC: 5,
  MAXMANA: 6,
  OBRAN_L: 7,
  OBRAN_H: 8,
  UTOK_L: 9,
  UTOK_H: 10,
  OHEN: 11,
  VODA: 12,
  ZEME: 13,
  VZDUCH: 14,
  MYSL: 15,
  HPREG: 16,
  MPREG: 17,
  VPREG: 18,
  MGSIL_L: 19,
  DAMAGE: 22,
  KOUZLA: 23,
} as const;

export const PO = { BATOH: 0, TELO_H: 1, TELO_D: 2, HLAVA: 3, NOHY: 4, KUTNA: 5, KRK: 6, RUKA_L: 7, RUKA_R: 8 } as const;

const VLS_COUNT = 24;
const HUMAN_PLACES = 9;
const MAX_INV = 30;
const BASE_INV = 6;
const VLS_MIN = [0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
const VLS_MAX = [200, 200, 200, 200, 32767, 32767, 32767, 190, 199, 190, 199, 99, 99, 99, 99, 99, 90, 90, 90];
const ITF_NOREMOVE = 0x2;

export type Held = readonly number[] | null;

export interface InventoryResult {
  character: Character;
  held: Held;
  dropped: readonly (readonly number[])[];
}

interface Work {
  base: Character;
  items: readonly ItemDef[];
  inv: number[];
  invSize: number;
  wearing: number[];
  rings: number[];
  dropped: number[][];
  partyIndex: number | undefined;
}

function item(items: readonly ItemDef[], id: number): ItemDef | undefined {
  return items[Math.abs(id) - 1];
}

export function baseVlastnosti(character: Character, partyIndex?: number): number[] {
  const v = new Array<number>(VLS_COUNT).fill(0);
  const s = character.stats;
  v[VLS.SILA] = s.strength;
  v[VLS.SMAGIE] = s.magic;
  v[VLS.POHYB] = s.speed;
  v[VLS.OBRAT] = s.dexterity;
  v[VLS.HPREG] = s.hpRegen;
  v[VLS.MPREG] = s.mpRegen;
  v[VLS.VPREG] = s.staminaRegen;
  v[VLS.MAXHIT] = s.maxHp;
  v[VLS.MAXMANA] = s.maxMana;
  v[VLS.KONDIC] = s.stamina;
  v[VLS.OBRAN_L] = 1;
  v[VLS.OBRAN_H] = 2;
  v[VLS.UTOK_L] = 1;
  v[VLS.UTOK_H] = 2;
  if (partyIndex !== undefined && partyIndex < 3) {
    if (s.strength > 20) v[VLS.UTOK_H] = 3;
    if (s.dexterity > 20) v[VLS.OBRAN_H] = 3;
  }
  return v;
}

function recompute(base: Character, items: readonly ItemDef[], wearing: readonly number[], rings: readonly number[], partyIndex?: number): number[] {
  const v = baseVlastnosti(base, partyIndex);
  for (const id of [...wearing.slice(0, HUMAN_PLACES), ...rings.slice(0, 4)]) {
    if (!id) continue;
    const it = item(items, id);
    if (!it) continue;
    for (let j = 0; j < VLS.MGSIL_L; j++) {
      if (it.druh === ItemType.VRHACI && (j === VLS.UTOK_L || j === VLS.UTOK_H)) continue;
      const q = it.zmeny[j] ?? 0;
      if (j >= VLS.OHEN && j <= VLS.MYSL) v[j] = Math.floor((v[j]! + q) / (1 + (v[j]! * q) / (90 * 90)) + 0.5);
      else v[j] = v[j]! + q;
    }
    v[VLS.DAMAGE] = v[VLS.DAMAGE]! + (it.zmeny[VLS.DAMAGE] ?? 0);
    v[VLS.KOUZLA] = v[VLS.KOUZLA]! | (it.zmeny[VLS.KOUZLA] ?? 0);
  }
  for (let j = 0; j < VLS.MGSIL_L; j++) v[j] = Math.min(VLS_MAX[j]!, Math.max(VLS_MIN[j]!, v[j]!));
  return v;
}

export function computeVlastnosti(character: Character, items: readonly ItemDef[], partyIndex?: number): number[] {
  return recompute(character, items, character.wearing, character.rings, partyIndex);
}

export function canWear(vls: readonly number[], items: readonly ItemDef[], id: number): boolean {
  const it = item(items, id);
  if (!it) return false;
  for (let i = 0; i < 4; i++) {
    const v = vls[i] ?? 0;
    const q = it.podminky[i] ?? 0;
    if (v < q) return false;
    if (v + (it.zmeny[i] ?? 0) < q) return false;
  }
  return true;
}

function start(character: Character, items: readonly ItemDef[], partyIndex?: number): Work {
  const pad = (a: readonly number[], n: number) => Array.from({ length: n }, (_, i) => a[i] ?? 0);
  return {
    base: character,
    items,
    inv: pad(character.inv, MAX_INV),
    invSize: Math.min(character.invSize, MAX_INV),
    wearing: pad(character.wearing, HUMAN_PLACES),
    rings: pad(character.rings, 4),
    dropped: [],
    partyIndex,
  };
}

function vlsOf(w: Work): number[] {
  return recompute(w.base, w.items, w.wearing, w.rings, w.partyIndex);
}

function finish(w: Work, held: Held): InventoryResult {
  return {
    character: { ...w.base, inv: w.inv, invSize: w.invSize, wearing: w.wearing, rings: w.rings },
    held: held && held.length > 0 && held[0] ? held : null,
    dropped: w.dropped,
  };
}

function removeItem(w: Work, what: number): void {
  const id = w.wearing[what]!;
  if (!id) return;
  if (!((item(w.items, id)?.flags ?? 0) & ITF_NOREMOVE)) {
    let i = 0;
    while (i < w.invSize && w.inv[i]) i++;
    if (i !== w.invSize) w.inv[i] = id;
    else w.dropped.push([id]);
  }
  w.wearing[what] = 0;
}

function checkDoubleWield(w: Work, vls: readonly number[]): boolean {
  const a = item(w.items, w.wearing[PO.RUKA_L]!);
  const b = item(w.items, w.wearing[PO.RUKA_R]!);
  if (!w.wearing[PO.RUKA_L] || !w.wearing[PO.RUKA_R] || !a || !b) return false;
  if (a.druh !== ItemType.UTOC || b.druh !== ItemType.UTOC) return false;
  for (let i = VLS.SILA; i <= VLS.OBRAT; i++) {
    const pa = a.podminky[i] ?? 0;
    const pb = b.podminky[i] ?? 0;
    if (pa + pb > vls[i]! && Math.max(pa, pb) > vls[VLS.OBRAT]!) return true;
  }
  return false;
}

function checkCharacter(w: Work): void {
  const vls = vlsOf(w);
  for (let i = 0; i < HUMAN_PLACES; i++) {
    const id = w.wearing[i]!;
    if (id && !canWear(vls, w.items, id)) removeItem(w, i);
  }
  if (checkDoubleWield(w, vls)) removeItem(w, PO.RUKA_L);
}

function freeSlotsShort(w: Work, count: number): boolean {
  let left = count;
  for (let i = w.invSize - 1; i >= 0; i--) if (!w.inv[i]) left--;
  return left > 0;
}

export function bagClick(character: Character, held: Held, slot: number, items: readonly ItemDef[], partyIndex?: number): InventoryResult | null {
  const w = start(character, items, partyIndex);
  if (slot < 0 || slot >= w.invSize) return null;
  if (held) {
    const picked = [...held];
    if (picked.length > 1 && freeSlotsShort(w, picked.length)) return null;
    let id = slot;
    for (let k = 0; k < picked.length && picked[k]; ) {
      const displaced = w.inv[id]!;
      w.inv[id] = Math.abs(picked[k]!);
      picked[k] = displaced;
      k++;
      if (k < picked.length && picked[k]) {
        while (w.inv[id]) {
          id++;
          if (id >= w.invSize) id = 0;
        }
      }
    }
    return finish(w, picked[0] ? [picked[0]] : null);
  }
  const taken = w.inv[slot]!;
  w.inv[slot] = 0;
  return finish(w, taken ? [taken] : null);
}

export function ringClick(character: Character, held: Held, index: number, items: readonly ItemDef[], partyIndex?: number): InventoryResult | null {
  const w = start(character, items, partyIndex);
  const ring = w.rings[index]!;
  let next: Held = held;
  if (!held) {
    if (!ring) return null;
    next = [ring];
    w.rings[index] = 0;
  } else if (held.length === 1) {
    if (item(items, held[0]!)?.umisteni !== ItemPlace.PRSTEN) return finish(w, held);
    w.rings[index] = held[0]!;
    next = ring ? [ring] : null;
  }
  checkCharacter(w);
  return finish(w, next);
}

export function swapBackpack(character: Character, held: Held, items: readonly ItemDef[], partyIndex?: number): InventoryResult {
  const w = start(character, items, partyIndex);
  const old: number[] = [w.wearing[PO.BATOH]!];
  for (let i = BASE_INV; i < w.invSize; i++) if (w.inv[i]) old.push(-w.inv[i]!);
  for (let i = BASE_INV; i < MAX_INV; i++) w.inv[i] = 0;
  if (held && held[0]) {
    const pack = held[0];
    w.wearing[PO.BATOH] = pack;
    let i = BASE_INV;
    for (let k = 1; k < held.length && held[k] && i < MAX_INV; k++) w.inv[i++] = -held[k]!;
    w.invSize = Math.min((item(items, pack)?.nosnost ?? 0) + BASE_INV, MAX_INV);
  } else {
    w.invSize = BASE_INV;
    w.wearing[PO.BATOH] = 0;
  }
  checkCharacter(w);
  return finish(w, old[0] ? old : null);
}

export function humanClick(
  character: Character,
  held: Held,
  xr: number,
  pointed: number | null,
  items: readonly ItemDef[],
  partyIndex?: number,
): InventoryResult | null {
  const w = start(character, items, partyIndex);
  let place = -1;
  let um = 0;
  let itsave = 0;
  let next: number[] | null = held ? [...held] : null;
  if (held) {
    const first = held[0]!;
    const it = item(items, first);
    if (!it || !canWear(vlsOf(w), items, first)) return null;
    if (it.umisteni === ItemPlace.BATOH) return swapBackpack(character, held, items, partyIndex);
    if (held.length !== 1) return null;
    um = place = it.umisteni;
    if (!place) return null;
    if (place === ItemPlace.RUKA) place = xr < 94 ? PO.RUKA_R : PO.RUKA_L;
    else if (place === ItemPlace.OBOUR) place = PO.RUKA_R;
    else place--;
    if (place >= HUMAN_PLACES) return null;
    itsave = w.wearing[place]!;
  } else {
    if (pointed === null) return null;
    if (pointed === PO.BATOH) return swapBackpack(character, null, items, partyIndex);
    next = [w.wearing[pointed]!];
    w.wearing[pointed] = 0;
  }
  if (um) {
    switch (um) {
      case ItemPlace.KUTNA:
        removeItem(w, PO.HLAVA);
        removeItem(w, PO.TELO_D);
        removeItem(w, PO.TELO_H);
        break;
      case ItemPlace.OBOUR:
        removeItem(w, PO.RUKA_L);
        break;
      case ItemPlace.TELO_H:
      case ItemPlace.TELO_D:
      case ItemPlace.HLAVA:
        removeItem(w, PO.KUTNA);
        break;
      case ItemPlace.RUKA: {
        const right = w.wearing[PO.RUKA_R]!;
        if (place === PO.RUKA_L && right && item(items, right)?.umisteni === ItemPlace.OBOUR) removeItem(w, PO.RUKA_R);
        break;
      }
    }
    w.wearing[place] = next![0]!;
    next = itsave ? [itsave] : null;
  }
  if (next && next[0] && (item(items, next[0])?.flags ?? 0) & ITF_NOREMOVE) next = null;
  if (checkDoubleWield(w, vlsOf(w))) removeItem(w, place === PO.RUKA_L ? PO.RUKA_R : PO.RUKA_L);
  checkCharacter(w);
  return finish(w, next);
}

export function bagSlotAt(xr: number, yr: number): number {
  return Math.floor(xr / 55) + 6 * Math.floor(yr / 60);
}

const REQUIREMENT_TEXTS = ['Síla: ', 'Magie: ', 'Pohyb: ', 'Obrat: '];

export function itemRequirements(items: readonly ItemDef[], id: number): string | null {
  const it = item(items, id);
  if (!it) return null;
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const q = it.podminky[i] ?? 0;
    if (q) parts.push(REQUIREMENT_TEXTS[i] + String(q).padStart(2, ' '));
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
