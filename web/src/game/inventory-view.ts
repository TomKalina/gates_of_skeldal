// TS counterpart of game/inv.c's inventory/equipment screen — this first
// slice ports the real screen chrome (paper-doll arch, backpack-grid
// background, info panel, character name) and the open/close flow only.
// No item is ever reachable yet (no pickup-from-floor, no chests, no shops
// wired), so a fresh character's backpack/equipment/rings are always empty
// — real per generuj_postavu, not a stub — and this doesn't attempt to
// draw item icons, backpack contents, or worn-item compositing at all yet.
// Equip/unequip, drag-and-drop, rings, arrows, and item combinations
// (COMBITEM.DAT) are real, separate follow-up work — see docs/port-graph.md.
import type { Character } from './party';
import { imageDataToCanvas } from './portraits';

export interface InventoryAssets {
  arch?: ImageData; // IOBLOUK.PCX — same asset/position as chargen's own arch
  deskPanel?: ImageData; // IDESKA.PCX — info-panel background
  bagGrid?: ImageData; // IMRIZ1.PCX — backpack-grid background
  bodySprites?: ReadonlyMap<number, ImageData>;
}

// game/inv.c's real layout constants (TOP_OFS=17, INV_X=285, INV_Y=TOP_OFS+29,
// INV_XS=55, INV_YS=60, HUMAN_X=35, HUMAN_Y=348, PO_XS=194 so PO_XSS=97,
// INV_NAME_X=129, INV_NAME_Y=349).
const TOP_OFS = 17;
const ARCH_POS = { x: 4, y: TOP_OFS };
const DESK_PANEL_POS = { x: 266, y: TOP_OFS };
const INV_X = 285;
const INV_Y = TOP_OFS + 29;
const INV_YS = 60;
const HUMAN_X = 35;
const HUMAN_Y = 348;
const PO_XSS = 97;
const NAME_X = 129;
const NAME_Y = 349;

export function drawInventoryScreen(ctx: CanvasRenderingContext2D, character: Character, assets: InventoryAssets): void {
  const canvas = ctx.canvas;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (assets.arch) ctx.putImageData(assets.arch, ARCH_POS.x, ARCH_POS.y);
  if (assets.deskPanel) ctx.putImageData(assets.deskPanel, DESK_PANEL_POS.x, DESK_PANEL_POS.y);

  if (assets.bagGrid) {
    // display_items_in_inv: `p[1]=INV_YS*((h->inv_size-1)/6)+58` patches the
    // decoded PCX's own height word before blitting, to fit exactly the
    // number of backpack rows (inv_size/6, rounded up). Only the 1-row
    // (inv_size=6) case matters here — growing the backpack via a worn
    // PL_BATOH item isn't wired yet.
    const rows = Math.floor((character.invSize - 1) / 6);
    const height = Math.min(INV_YS * rows + 58, assets.bagGrid.height);
    const source = imageDataToCanvas(assets.bagGrid);
    ctx.drawImage(source, 0, 0, assets.bagGrid.width, height, INV_X, INV_Y, assets.bagGrid.width, height);
  }

  const bodySprite = assets.bodySprites?.get(character.portraitIndex);
  if (bodySprite) {
    // build_items_wearing: `put_picture2picture(p,ob,PO_XSS-(hx/2),PO_YS-hy-20)`
    // into a PO_XS×PO_YS offscreen buffer, then that buffer is drawn at
    // native scale anchored bottom-left at (HUMAN_X,HUMAN_Y) — combined
    // into one direct screen position since there's no item to composite
    // onto the buffer yet (an unequipped character shows only the body).
    const x = HUMAN_X + PO_XSS - bodySprite.width / 2;
    const y = HUMAN_Y - bodySprite.height - 20;
    ctx.drawImage(imageDataToCanvas(bodySprite), x, y);
  }

  ctx.fillStyle = 'rgb(82, 255, 255)';
  ctx.font = 'bold 16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(character.name, NAME_X, NAME_Y);
  ctx.textAlign = 'left';
}
