export const PL_NIKAM = 0;
export const PL_BATOH = 1;
export const PL_TELO_H = 2;
export const PL_TELO_D = 3;
export const PL_HLAVA = 4;
export const PL_NOHY = 5;
export const PL_KUTNA = 6;
export const PL_KRK = 7;
export const PL_RUKA = 8;
export const PL_OBOUR = 9;
export const PL_PRSTEN = 10;
export const PL_SIP = 11;

export const MAX_INV = 30;
export const HUMAN_PLACES = 9;
export const HUMAN_RINGS = 4;
export const VLS_SILA = 0;

export interface InvItem {
  hmotnost: number;
  umisteni: number;
  user_value: number;
  podminky: readonly number[];
  zmeny: readonly number[];
}

export interface InvHuman {
  inv: number[];
  inv_size: number;
  wearing: number[];
  prsteny: number[];
  vlastnosti: number[];
  sipy: number;
}

function itemAt(items: readonly InvItem[], id: number): InvItem {
  const it = items[Math.abs(id) - 1];
  if (!it) throw new Error(`Unknown item ${id}`);
  return it;
}

function terminated(place: readonly number[]): number[] {
  const end = place.indexOf(0);
  return end < 0 ? [...place] : place.slice(0, end);
}

export function countItemsTotal(place: readonly number[] | null): number {
  return place ? terminated(place).length : 0;
}

export function countItemsVisible(place: readonly number[] | null): number {
  return place ? terminated(place).filter((v) => v > 0).length : 0;
}

export function countItemsInside(place: readonly number[] | null): number {
  if (!place) return 0;
  let c = 1;
  for (let i = 1; i < place.length && (place[i] ?? 0) < 0; i++) c++;
  return c;
}

export function celkovaVaha(items: readonly InvItem[], place: readonly number[]): number {
  return terminated(place).reduce((s, id) => s + itemAt(items, id).hmotnost, 0);
}

export function calculateWeight(items: readonly InvItem[], p: InvHuman): number {
  let suma = 0;
  for (let i = 0; i < p.inv_size; i++) {
    const id = p.inv[i] ?? 0;
    if (id) suma += itemAt(items, id).hmotnost;
  }
  suma = Math.trunc((suma * 3) / 2);
  for (let i = 0; i < HUMAN_PLACES; i++) {
    const id = p.wearing[i] ?? 0;
    if (id) suma += itemAt(items, id).hmotnost;
  }
  for (let i = 0; i < HUMAN_RINGS; i++) {
    const id = p.prsteny[i] ?? 0;
    if (id) suma += itemAt(items, id).hmotnost;
  }
  return suma;
}

export function weightDefect(items: readonly InvItem[], p: InvHuman): number {
  const wh = calculateWeight(items, p);
  const limit = (p.vlastnosti[VLS_SILA] ?? 0) * 20;
  return wh > limit ? Math.trunc((wh - limit) / 200) : 0;
}

export function muzeNosit(items: readonly InvItem[], p: InvHuman, item: number): boolean {
  const it = itemAt(items, item);
  for (let i = 0; i < 4; i++) {
    const v = p.vlastnosti[i] ?? 0;
    const q = it.podminky[i] ?? 0;
    const z = it.zmeny[i] ?? 0;
    if (v < q) return false;
    if (v + z < q) return false;
  }
  return true;
}

export function putItemToInv(
  items: readonly InvItem[],
  p: InvHuman,
  picked: number[] | null,
  opts: { isDemon?: boolean; neprezbrojit?: boolean } = {},
): boolean {
  if (p.inv_size > MAX_INV) p.inv_size = MAX_INV;
  if (!picked) return false;
  if (opts.isDemon) return false;
  const first = picked[0] ?? 0;
  if (first && itemAt(items, first).umisteni === PL_SIP && !opts.neprezbrojit) {
    const u = itemAt(items, first).user_value || 1;
    if (p.sipy + u < 100) {
      p.sipy += u;
      return true;
    }
  }
  let i = countItemsTotal(picked);
  let pos = 0;
  while (i) {
    while (pos < p.inv_size && p.inv[pos]) pos++;
    if (pos >= p.inv_size) break;
    i--;
    p.inv[pos] = Math.abs(picked[i] ?? 0);
    picked[i] = 0;
  }
  return i === 0;
}
