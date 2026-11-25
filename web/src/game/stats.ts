export const VLS_MAX = 24;
export const VLS_MAXHIT = 4;
export const VLS_KONDIC = 5;
export const VLS_UTOK_L = 9;
export const VLS_UTOK_H = 10;
export const VLS_OHEN = 11;
export const VLS_MYSL = 15;
export const VLS_MGSIL_L = 19;
export const VLS_DAMAGE = 22;
export const VLS_KOUZLA = 23;
export const HUMAN_PLACES = 9;
export const MAX_INV = 30;
export const TYP_VRHACI = 2;
export const HODINA = 360;

export const VLS_MIN: readonly number[] = [
  0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
export const VLS_MAX_LIMITS: readonly number[] = [
  200, 200, 200, 200, 32767, 32767, 32767, 190, 199, 190, 199, 99, 99, 99, 99, 99, 90, 90, 90, 90,
  99, 4,
];

export interface StatItem {
  readonly druh: number;
  readonly zmeny: readonly number[];
}

export interface StatHuman {
  vlastnosti: number[];
  stare_vls: readonly number[];
  wearing: readonly number[];
  prsteny: readonly number[];
  inv_size: number;
  lives: number;
  kondice: number;
  jidlo: number;
  voda: number;
}

const toShort = (v: number): number => ((v << 16) >> 16);

export function maxHlad(vls: readonly number[]): number {
  return (Math.trunc((vls[VLS_MAXHIT] ?? 0) / 2) + 2 * 24) * HODINA;
}

export function maxZizen(vls: readonly number[]): number {
  return (Math.trunc((vls[VLS_MAXHIT] ?? 0) / 3) + 24) * HODINA;
}

export function combineResistance(base: number, add: number): number {
  return Math.floor((base + add) / (1 + (base * add) / (90.0 * 90.0)) + 0.5);
}

export function prepocitatPostavu(h: StatHuman, items: readonly StatItem[]): void {
  if (h.inv_size > MAX_INV) h.inv_size = MAX_INV;
  const sr = Array.from({ length: VLS_MAX }, (_, k) => h.stare_vls[k] ?? 0);
  for (let i = 0; i < HUMAN_PLACES + 4; i++) {
    const c = i < HUMAN_PLACES ? (h.wearing[i] ?? 0) : (h.prsteny[i - HUMAN_PLACES] ?? 0);
    if (!c) continue;
    const it = items[c - 1];
    if (!it) continue;
    const q = it.zmeny;
    for (let j = 0; j < VLS_MGSIL_L; j++) {
      if (it.druh !== TYP_VRHACI || (j !== VLS_UTOK_L && j !== VLS_UTOK_H)) {
        const pj = sr[j] ?? 0;
        const qj = q[j] ?? 0;
        sr[j] = toShort(j >= VLS_OHEN && j <= VLS_MYSL ? combineResistance(pj, qj) : pj + qj);
      }
    }
    sr[VLS_DAMAGE] = toShort((sr[VLS_DAMAGE] ?? 0) + (q[VLS_DAMAGE] ?? 0));
    sr[VLS_KOUZLA] = toShort((sr[VLS_KOUZLA] ?? 0) | (q[VLS_KOUZLA] ?? 0));
  }
  for (let j = 0; j < VLS_MGSIL_L; j++) {
    const lo = VLS_MIN[j] ?? 0;
    const hi = VLS_MAX_LIMITS[j] ?? 32767;
    let v = sr[j] ?? 0;
    if (v < lo) v = lo;
    if (v > hi) v = hi;
    sr[j] = v;
  }
  h.vlastnosti = sr;
  const maxHit = sr[VLS_MAXHIT] ?? 0;
  if (h.lives > maxHit) h.lives = maxHit;
  const kond = sr[VLS_KONDIC] ?? 0;
  if (h.kondice > kond) h.kondice = kond;
  h.jidlo = Math.min(h.jidlo, maxHlad(sr));
  h.voda = Math.min(h.voda, maxZizen(sr));
}
