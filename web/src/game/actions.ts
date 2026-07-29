// TS counterpart of the visibility-toggle cases in realgame.c's do_action()
// switch (game/realgame.c, action codes in the #define block right above
// it). Scope note (see web/docs/EXECUTION-PLAN.md's A2a): only the action
// codes whose entire effect is "toggle a flag dungeon.ts/dungeon-view.ts
// already renders" are ported here. A_OPEN_DOOR/A_CLOSE_DOOR/A_RUN_PRIM/
// A_RUN_SEC set animation-direction flags (SD_PRIM_FORV/SD_SEC_FORV/
// SD_PRIM_ANIM/SD_SEC_ANIM) that only mean something once the per-tick
// animation stepper (A3) exists to consume them — implementing the flag
// set now with no consumer would be inert, unverifiable code.
// A_OPEN_TELEPORT/A_CLOSE_TELEPORT and A_CODELOCK_LOG* need their own
// trigger/chaining logic this port doesn't have yet either. A_DISPLAY_TEXT
// needs level-text decode (D4). None of realgame.c's `call_macro(sid,
// MC_INCOMING)`/`MC_SUCC_DONE` triggering is ported (that's the A2b macro
// VM) — these functions only reproduce the direct state mutation.
//
// No real side in LESPRED.MAP (the only currently-loadable map) uses any
// of these action codes — a full-map scan found exactly one action code
// in use (A_OPEN_CLOSE=3, the door; see map-file.ts's toggleDoor). These
// are therefore verified against the C source directly and with synthetic
// fixtures, not against real map data, unlike this port's rendering code.
import { SD_PRIM_VIS, SD_SEC_VIS, sideAt, type DungeonMap } from '../formats/map-file';

export const A_SHOW_PRIM = 5;
export const A_HIDE_PRIM = 6;
export const A_SHOW_HIDE_PRIM = 7;
export const A_SHOW_SEC = 9;
export const A_HIDE_SEC = 10;
export const A_SHOW_HIDE_SEC = 11;
export const A_HIDE_PRIM_SEC = 12;

// realgame.c's `ok` return value: whether the action actually changed
// anything (A_HIDE_PRIM on an already-hidden side is a no-op, `ok` stays
// 0). do_action() uses this to decide whether to fire MC_SUCC_DONE; this
// port has no macro VM to fire that into yet, but callers may still want
// to know whether a redraw is warranted.
export function applyAction(map: DungeonMap, sector: number, direction: number, action: number): boolean {
  const side = sideAt(map, sector, direction);
  if (!side) return false;

  switch (action) {
    case A_HIDE_PRIM:
      if ((side.flags & SD_PRIM_VIS) === 0) return false;
      side.flags &= ~SD_PRIM_VIS;
      return true;
    case A_SHOW_PRIM:
      if ((side.flags & SD_PRIM_VIS) !== 0) return false;
      side.flags |= SD_PRIM_VIS;
      return true;
    case A_SHOW_HIDE_PRIM:
      side.flags ^= SD_PRIM_VIS;
      return true;
    case A_HIDE_SEC:
      if ((side.flags & SD_SEC_VIS) === 0) return false;
      side.flags &= ~SD_SEC_VIS;
      return true;
    case A_SHOW_SEC:
      if ((side.flags & SD_SEC_VIS) !== 0) return false;
      side.flags |= SD_SEC_VIS;
      return true;
    case A_SHOW_HIDE_SEC:
      side.flags ^= SD_SEC_VIS;
      return true;
    case A_HIDE_PRIM_SEC:
      if ((side.flags & (SD_SEC_VIS | SD_PRIM_VIS)) === 0) return false;
      side.flags &= ~(SD_SEC_VIS | SD_PRIM_VIS);
      return true;
    default:
      return false;
  }
}
