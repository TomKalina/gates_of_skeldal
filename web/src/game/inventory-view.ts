import { drawStatsSheet, type SheetFonts } from './chargen-sheet';
import { BG_BLEND, drawAlignedText, drawBitmapText, fontColors, FONT_TSHADOW, rgb555, type BitmapFont } from '../gfx/bitmap-font';
import { PO } from './inventory';
import type { ItemDef } from './items';
import type { Character } from './party';
import { imageDataToCanvas } from './portraits';

export interface InventoryAssets {
  arch?: ImageData | undefined;
  deskPanel?: ImageData | undefined;
  bagGrid?: ImageData | undefined;
  svitek?: ImageData | undefined;
  frame?: ImageData | undefined;
  bodySprites?: ReadonlyMap<number, ImageData> | undefined;
  icon?: ((icon: number) => ImageData | undefined) | undefined;
  wornMale?: ReadonlyMap<number, ImageData> | undefined;
  wornFemale?: ReadonlyMap<number, ImageData> | undefined;
  boldFont?: BitmapFont | undefined;
  sheetFonts?: SheetFonts | undefined;
}

export interface InfoBox {
  title: string;
  description: string;
  requirements: string | null;
  warn: boolean;
}

export interface InventoryScene {
  character: Character;
  vls: readonly number[];
  items: readonly ItemDef[];
  statsMode: boolean;
  info: InfoBox | null;
}

const TOP_OFS = 17;
export const INV_X = 285;
export const INV_Y = TOP_OFS + 29;
export const INV_XS = 55;
export const INV_YS = 60;
const HUMAN_X = 35;
const HUMAN_Y = 348;
const PO_XS = 194;
const PO_XSS = PO_XS >> 1;
const NAME_X = 129;
const NAME_Y = 349;
const NAME_COLOR = rgb555(10, 31, 31) | FONT_TSHADOW;
const INFO_X = 298;
const INFO_Y = 343;
const INFO_XS = 300;
const INFO_YS = 20;
const INFO_XP = 12;
const VEL_RAMEC = 12;
const COL_RAMEC = 'rgb(255, 255, 214)';
const RING_CENTERS: readonly (readonly [number, number])[] = [
  [245, 194],
  [245, 229],
  [245, 264],
  [245, 299],
];

export const BAG_RECT = { x: INV_X, y: INV_Y, width: INV_XS * 6, height: INV_YS * 5 };
export const RING_RECTS = [185, 220, 255, 290].map((y) => ({ x: 236, y, width: 20, height: 20 }));
export const HUMAN_RECT = { x: 37, y: 34, width: 189, height: 303 };
export const SWAP_DESK_RECT = { x: 45, y: 339, width: 168, height: 20 };

function wornSprite(character: Character, items: readonly ItemDef[], assets: InventoryAssets, id: number): ImageData | undefined {
  const vzhled = items[id - 1]?.vzhled ?? 0;
  if (!vzhled) return undefined;
  return (character.female ? assets.wornFemale : assets.wornMale)?.get(vzhled);
}

function wornPosition(items: readonly ItemDef[], id: number, slot: number): readonly [number, number] {
  const polohy = items[id - 1]?.polohy;
  return (slot === PO.RUKA_L ? polohy?.[1] : polohy?.[0]) ?? [0, 0];
}

function wornRect(sprite: ImageData, pos: readonly [number, number]): { x: number; y: number } {
  return { x: HUMAN_X + PO_XSS + pos[0] - Math.trunc(sprite.width / 2), y: HUMAN_Y - pos[1] - 20 - sprite.height };
}

export function wornSlotAt(character: Character, items: readonly ItemDef[], assets: InventoryAssets, x: number, y: number): number | null {
  for (let slot = character.wearing.length - 1; slot >= 0; slot--) {
    const id = character.wearing[slot] ?? 0;
    if (!id) continue;
    const sprite = wornSprite(character, items, assets, id);
    if (!sprite) continue;
    const r = wornRect(sprite, wornPosition(items, id, slot));
    const px = Math.floor(x - r.x);
    const py = Math.floor(y - r.y);
    if (px < 0 || py < 0 || px >= sprite.width || py >= sprite.height) continue;
    if (sprite.data[(py * sprite.width + px) * 4 + 3]! > 0) return slot;
  }
  return null;
}

function drawBag(ctx: CanvasRenderingContext2D, scene: InventoryScene, assets: InventoryAssets): void {
  const { character, items } = scene;
  if (assets.deskPanel) ctx.putImageData(assets.deskPanel, 266, TOP_OFS);
  if (assets.bagGrid) {
    const height = Math.min(INV_YS * Math.floor((character.invSize - 1) / 6) + 58, assets.bagGrid.height);
    ctx.drawImage(imageDataToCanvas(assets.bagGrid), 0, 0, assets.bagGrid.width, height, INV_X, INV_Y, assets.bagGrid.width, height);
  }
  for (let i = 0; i < character.invSize; i++) {
    const id = character.inv[i] ?? 0;
    if (!id) continue;
    const icon = assets.icon?.(items[id - 1]?.ikona ?? -1);
    if (icon) ctx.drawImage(imageDataToCanvas(icon), INV_X + (i % 6) * INV_XS, INV_Y + Math.floor(i / 6) * INV_YS);
  }
}

function drawStats(ctx: CanvasRenderingContext2D, scene: InventoryScene, assets: InventoryAssets): void {
  if (assets.svitek) ctx.putImageData(assets.svitek, 266, TOP_OFS);
  if (assets.sheetFonts) drawStatsSheet(ctx, assets.sheetFonts, scene.character, scene.vls);
}

function drawHuman(ctx: CanvasRenderingContext2D, scene: InventoryScene, assets: InventoryAssets): void {
  const { character, items } = scene;
  if (assets.arch) ctx.putImageData(assets.arch, 4, TOP_OFS);
  const body = assets.bodySprites?.get(character.portraitIndex);
  if (body) ctx.drawImage(imageDataToCanvas(body), HUMAN_X + PO_XSS - Math.trunc(body.width / 2), HUMAN_Y - body.height - 20);
  const order = [...Array.from({ length: character.wearing.length - 1 }, (_, i) => i + 1), PO.BATOH];
  for (const slot of order) {
    const id = character.wearing[slot] ?? 0;
    if (!id) continue;
    const sprite = wornSprite(character, items, assets, id);
    if (!sprite) continue;
    const r = wornRect(sprite, wornPosition(items, id, slot));
    ctx.drawImage(imageDataToCanvas(sprite), r.x, r.y);
  }
}

function drawRings(ctx: CanvasRenderingContext2D, scene: InventoryScene, assets: InventoryAssets): void {
  scene.character.rings.forEach((id, i) => {
    if (!id) return;
    const icon = assets.icon?.(scene.items[id - 1]?.ikona ?? -1);
    const [cx, cy] = RING_CENTERS[i]!;
    if (icon) ctx.drawImage(imageDataToCanvas(icon), cx - Math.trunc(icon.width / 2), cy - Math.trunc(icon.height / 2));
  });
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: ImageData, x: number, y: number, width: number, height: number): void {
  const tiles = imageDataToCanvas(frame);
  const tile = (index: number, tx: number, ty: number) =>
    ctx.drawImage(tiles, 0, index * VEL_RAMEC, VEL_RAMEC, VEL_RAMEC, tx, ty, VEL_RAMEC, VEL_RAMEC);
  const left = x - VEL_RAMEC;
  const top = y - VEL_RAMEC;
  const xs = Math.trunc((width + VEL_RAMEC - 1) / VEL_RAMEC) + 1;
  const ys = Math.trunc((height + VEL_RAMEC - 1) / VEL_RAMEC) + 1;
  tile(0, left, top);
  for (let i = 1; i < xs; i++) tile(1, left + i * VEL_RAMEC, top);
  tile(2, left + xs * VEL_RAMEC, top);
  for (let j = 1; j < ys; j++) {
    tile(3, left, top + j * VEL_RAMEC);
    tile(4, left + xs * VEL_RAMEC, top + j * VEL_RAMEC);
  }
  const bottom = top + ys * VEL_RAMEC;
  tile(5, left, bottom);
  for (let i = 1; i < xs; i++) tile(6, left + i * VEL_RAMEC, bottom);
  tile(7, left + xs * VEL_RAMEC, bottom);
  ctx.fillStyle = COL_RAMEC;
  ctx.fillRect(x, y, (xs - 1) * VEL_RAMEC, (ys - 1) * VEL_RAMEC);
}

function drawInfoBox(ctx: CanvasRenderingContext2D, info: InfoBox, assets: InventoryAssets): void {
  const height = INFO_YS + (info.requirements !== null ? INFO_XP : 0);
  if (assets.frame) drawFrame(ctx, assets.frame, INFO_X, INFO_Y, INFO_XS, height);
  const font = assets.boldFont;
  if (!font) return;
  const colors = fontColors((info.warn ? rgb555(31, 0, 0) : 0) | BG_BLEND);
  drawBitmapText(ctx, font, info.title, INFO_X, INFO_Y, colors);
  drawBitmapText(ctx, font, info.description, INFO_X, INFO_Y + 12, colors);
  if (info.requirements !== null) drawBitmapText(ctx, font, info.requirements, INFO_X, INFO_Y + 24, colors);
}

export function drawInventoryScreen(ctx: CanvasRenderingContext2D, scene: InventoryScene, assets: InventoryAssets): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 16, 30, 360);
  ctx.fillRect(620, 16, 20, 360);
  if (scene.statsMode) drawStats(ctx, scene, assets);
  else drawBag(ctx, scene, assets);
  drawHuman(ctx, scene, assets);
  if (assets.boldFont) {
    drawAlignedText(ctx, assets.boldFont, scene.character.name, NAME_X, NAME_Y, 1, 1, fontColors(NAME_COLOR));
    if (scene.character.arrows) {
      drawAlignedText(ctx, assets.boldFont, String(scene.character.arrows), 19, 301, 1, 1, fontColors(rgb555(31, 31, 31)));
    }
  }
  drawRings(ctx, scene, assets);
  if (scene.info) drawInfoBox(ctx, scene.info, assets);
}
