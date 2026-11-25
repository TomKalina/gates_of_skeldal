export const VLS_SILA = 0;
export const VLS_SMAGIE = 1;
export const VLS_OBRAT = 3;
export const VLS_OBRAN_L = 7;
export const VLS_OBRAN_H = 8;
export const VLS_UTOK_L = 9;
export const VLS_UTOK_H = 10;
export const VLS_OHEN = 11;
export const VLS_MGSIL_L = 19;
export const VLS_MGSIL_H = 20;
export const VLS_MGZIVEL = 21;
export const VLS_DAMAGE = 22;
export const VLS_KOUZLA = 23;
export const VLS_MAX = 24;

export const SPL_INVIS = 0x1;
export const SPL_TVAR = 0x4;
export const SPL_SANC = 0x20;
export const SPL_HSANC = 0x40;

export type Rnd = (n: number) => number;

export const defaultRnd: Rnd = (n) => (n > 0 ? Math.floor(Math.random() * n) : 0);

const idiv = (a: number, b: number): number => Math.trunc(a / b);

export function mgochrana(x: number): number {
  if (x > 100) return 100;
  return 100 - x;
}

export function vypocetZasahu(
  utocnik: ArrayLike<number>,
  obrance: ArrayLike<number>,
  chaos: number,
  zbran: number,
  externalForce: number,
  enableFinesseRule: boolean,
  rnd: Rnd = defaultRnd,
): number {
  const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;
  const flg = at(obrance, VLS_KOUZLA);
  let attbonus = enableFinesseRule
    ? Math.max(at(utocnik, VLS_SILA), at(utocnik, VLS_OBRAT))
    : at(utocnik, VLS_SILA);
  attbonus = idiv(attbonus, 5);
  const obrbonus = idiv(at(obrance, VLS_OBRAT), 5);
  const magbonus = idiv(at(utocnik, VLS_SMAGIE), 5);

  const disadv = idiv(chaos + 1, 2);
  const ospod = idiv(at(obrance, VLS_OBRAN_L), disadv);
  const attackRoll = at(utocnik, VLS_UTOK_L) + rnd(at(utocnik, VLS_UTOK_H) - at(utocnik, VLS_UTOK_L) + 1);
  const defenseRoll = ospod + rnd(at(obrance, VLS_OBRAN_H) - ospod + 1);
  const magAttRoll = at(utocnik, VLS_MGSIL_L) + rnd(at(utocnik, VLS_MGSIL_H) - at(utocnik, VLS_MGSIL_L) + 1);

  const utok = attackRoll + attbonus + externalForce;
  const obrana = defenseRoll + obrbonus + (flg & SPL_INVIS ? 10 : 0);
  const mutok = magAttRoll + (magAttRoll ? magbonus : 0);
  const mgDef = at(obrance, VLS_OHEN + at(utocnik, VLS_MGZIVEL));
  const dmzhit = idiv(mgochrana(mgDef) * mutok, 100);
  let zasah = utok - obrana;

  if (zasah < 0) zasah = 0;
  let damage = at(utocnik, VLS_DAMAGE) + zbran;
  if (zasah <= 0 || damage <= 0) damage = 0;
  zasah += damage;
  if (flg & SPL_SANC) zasah = idiv(zasah, 2);
  let totalHit = zasah + dmzhit;
  if (flg & SPL_HSANC && dmzhit) totalHit -= idiv(dmzhit, 2);
  if (flg & SPL_TVAR) totalHit = -totalHit;
  return totalHit;
}

export interface BattleMob {
  live: boolean;
  inBattle: boolean;
  actions: number;
}

export interface BattleMember {
  used: boolean;
  onCurrentMap: boolean;
  programovano: number;
}

export const TURN_ORDER_END = -255;

export function rozhodniOPoradi(
  mobs: readonly BattleMob[],
  postavy: readonly BattleMember[],
  rnd: Rnd = defaultRnd,
): number[] {
  const poradi: number[] = [];
  mobs.forEach((m, i) => {
    if (m.live && m.inBattle) for (let j = 0; j < m.actions; j++) poradi.push(i + 1);
  });
  postavy.forEach((p, i) => {
    if (p.used && p.onCurrentMap) for (let j = 0; j < p.programovano; j++) poradi.push(-i - 1);
  });
  const celk = poradi.length;
  for (let i = 0; i < celk; i++) {
    const j = rnd(celk);
    const mem = poradi[j] as number;
    poradi[j] = poradi[i] as number;
    poradi[i] = mem;
  }
  poradi.push(TURN_ORDER_END, 0);
  return poradi;
}
