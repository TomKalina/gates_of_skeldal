// game/clk_map.c's real per-pixel hit-testing mechanism, used by the main
// menu (MENUVOL5.PCX, game/menu.c's promacknuti()) and the character-
// creation action buttons (CHARGENM.PCX, game/chargen.c's go_next_page()) —
// NOT libs/gui.c's OBJREC/WINDOW object model, which turned out to be a
// dead end for these two screens (confirmed by reading both C files:
// neither calls into gui.c/basicobj.c's define()/button()/etc. at all).
//
// Both real functions do the exact same thing: index directly into the
// decoded mask PCX's raw palette-index bytes at the click's position
// relative to a loose, generously-sized outer T_CLK_MAP rectangle —
// `z=ablock(mask); z+=6+512; z+=xr+yr*width; if (*z!=0) id=*z-1;` — value
// 0 means "no hotspot here" (reject), any other value N means "hotspot
// N-1" (0-based). The mask's shapes are hand-painted and non-rectangular
// (confirmed by decoding MENUVOL5.PCX/CHARGENM.PCX directly: each is a
// small palette of maximally-distinct marker colors — e.g. pure red/
// yellow/green/magenta/cyan — filling wavy, hand-drawn bands, not clean
// rectangles), which is exactly why a plain rect-per-button split (this
// port's earlier approximation) can never be pixel-exact.
//
// codecs/pcx.ts's decodePcx() already produces the raw index array as a
// byproduct of building rgba — this module never renders these PCX
// assets, only reads their index bytes, matching the source (neither
// mask is ever passed to put_picture() in the real engine either).
export interface HotspotMask {
  width: number;
  height: number;
  indices: Uint8Array;
}

// `regionX/regionY` is the outer T_CLK_MAP rectangle's top-left corner —
// the same coordinate frame the real xr/yr relative offsets use. Returns
// the 0-based hotspot ID, or null for "no hotspot" (raw index 0) or
// out-of-bounds.
export function hotspotAt(mask: HotspotMask, regionX: number, regionY: number, x: number, y: number): number | null {
  const mx = x - regionX;
  const my = y - regionY;
  if (mx < 0 || mx >= mask.width || my < 0 || my >= mask.height) return null;
  const value = mask.indices[my * mask.width + mx] ?? 0;
  return value === 0 ? null : value - 1;
}
