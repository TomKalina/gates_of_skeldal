// TS counterpart of realgame.c's calc_animations() — the per-tick stepper
// for TSTENA.prim_anim/sec_anim. Each side packs two independent animation
// channels into one byte: upper nibble = current frame index, lower
// nibble = frame count (the "pk"/"sk" locals in the real function) — this
// port already relies on the upper nibble for static frame selection
// (dungeon.ts's visibleTexture/visibleSecTexture); this module is what
// actually advances it over time.
//
// Two distinct behaviors per channel, selected by SD_PRIM_ANIM/SD_SEC_ANIM:
//  - unset (a triggered one-shot, e.g. an ordinary door): step toward
//    SD_*_FORV's direction, clamp at the ends (0 = closed, count = open).
//  - set (a continuously idling decoration): step and wrap/ping-pong
//    (SD_*_GAB) forever, never stopping.
//
// Not ported: the real function's `call_macro(i, MC_ANIM|...)` mid-step
// triggers (needs the Phase A2b macro VM) and the `flag_map` restore that
// re-applies a pre-computed baseline flags byte exactly when a one-shot
// animation reaches its endpoint (computed by do_action's `actn_flags()`
// from the *triggering action's own parameter*, which this port doesn't
// trace — see EXECUTION-PLAN.md's A3 notes). In its place, this port
// directly syncs SD_PLAY_IMPS for A_OPEN_CLOSE doors when their secondary
// channel (the one real door's data uses; prim is unused, pk=0) reaches
// an endpoint — the same *observable* result (passable exactly once the
// door visually finishes opening) without the generic mechanism.
import {
  A_OPEN_CLOSE,
  SD_PLAY_IMPS,
  SD_PRIM_ANIM,
  SD_PRIM_FORV,
  SD_PRIM_GAB,
  SD_SEC_ANIM,
  SD_SEC_FORV,
  SD_SEC_GAB,
  type DungeonMap,
  type MapSide,
} from '../formats/map-file';

interface ChannelResult {
  packed: number;
  flags: number;
  reachedOpen: boolean;
  reachedClosed: boolean;
  changed: boolean;
}

// One channel's worth of calc_animations' body (the prim block and the
// sec block are the same shape, just different flag bits and packed
// field) — continuous vs one-shot, exactly as the source branches. Takes
// and returns `flags` by value (this is JS, not a TSTENA pointer) since
// the source mutates p->flags directly (e.g. `p->flags ^= SD_PRIM_FORV`)
// as part of the same step.
function stepChannel(packed: number, animFlag: number, forvFlag: number, gabFlag: number, flags: number): ChannelResult {
  let j = packed >> 4;
  const k = packed & 0xf;
  const forv = (flags & forvFlag) !== 0;

  if (flags & animFlag) {
    if ((flags & gabFlag) !== 0 && (j === 0 || j === k)) {
      flags ^= forvFlag;
    }
    j += flags & forvFlag ? 1 : -1;
    if (j > k) j = 0;
    if (j < 0) j = k;
  } else {
    j += forv ? 1 : -1;
    if (j > k) j = k;
    else if (j < 0) j = 0;
    if (j === k && (flags & gabFlag) !== 0) flags &= ~forvFlag;
  }

  return { packed: (j << 4) | k, flags, reachedOpen: k > 0 && j === k, reachedClosed: j === 0, changed: (packed >> 4) !== j };
}

// Mutates the side in place. Returns whether either channel's frame
// actually changed (callers use this to decide whether a redraw/further
// tick is warranted).
export function stepSide(side: MapSide): boolean {
  const pk = side.primAnim & 0xf;
  const sk = side.secAnim & 0xf;
  if (pk === 0 && sk === 0) return false;

  const prim = stepChannel(side.primAnim, SD_PRIM_ANIM, SD_PRIM_FORV, SD_PRIM_GAB, side.flags);
  const sec = stepChannel(side.secAnim, SD_SEC_ANIM, SD_SEC_FORV, SD_SEC_GAB, prim.flags);
  side.primAnim = prim.packed;
  side.secAnim = sec.packed;
  side.flags = sec.flags;

  // Door passability: see this module's header comment for why this is a
  // targeted stand-in for the source's generic actn_flags/flag_map
  // mechanism rather than a port of it.
  if (side.action === A_OPEN_CLOSE) {
    const forvOpening = (side.flags & SD_SEC_FORV) !== 0;
    if (forvOpening && sec.reachedOpen) side.flags &= ~SD_PLAY_IMPS;
    else if (!forvOpening && sec.reachedClosed) side.flags |= SD_PLAY_IMPS;
  }

  return prim.changed || sec.changed;
}

// calc_animations() iterates every side in the map once per tick.
export function stepAllAnimations(map: DungeonMap): boolean {
  let changed = false;
  for (const side of map.sides) {
    if (stepSide(side)) changed = true;
  }
  return changed;
}
