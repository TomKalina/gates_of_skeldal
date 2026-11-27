import { unicodeToKamenicky } from '../formats/enc-file';

export const COLOR_SKIP = 0xffff;
export const BG_BLEND = 0x8000;

export type FontColors = readonly number[];

export interface BitmapFont {
  data: Uint8Array;
}

export function rgb555(r: number, g: number, b: number): number {
  return ((r << 10) | (g << 5) | b) & 0x7fff;
}

export const FONT_TSHADOW = 0x10000;
export const FONT_TSHADOW_GRAY = 0x30000;

export function fontColors(c1: number): FontColors {
  if (c1 & BG_BLEND) {
    const color = c1 & 0x7fff;
    return [COLOR_SKIP, color, color, color, color, 0, 0];
  }
  const color = c1 & ~0x20 & 0xffff;
  if (c1 & FONT_TSHADOW) {
    const shadow = (c1 & FONT_TSHADOW_GRAY) === FONT_TSHADOW_GRAY ? rgb555(16, 16, 15) | BG_BLEND : BG_BLEND;
    return [shadow, color, color, color, color, 0, 0];
  }
  return [0, color, color, color, color, 0, 0];
}

export function parseBitmapFont(data: Uint8Array): BitmapFont {
  return { data };
}

function glyphOffset(font: BitmapFont, code: number): number {
  return font.data[code * 2]! | (font.data[code * 2 + 1]! << 8);
}

export function glyphSize(font: BitmapFont, code: number): { width: number; height: number } {
  const offset = glyphOffset(font, code);
  if (offset === 0) return { width: 0, height: 0 };
  return { width: font.data[offset]!, height: font.data[offset + 1]! };
}

export function textWidth(font: BitmapFont, text: string): number {
  let width = 0;
  for (const code of unicodeToKamenicky(text)) width += glyphSize(font, code).width;
  return width;
}

export function textHeight(font: BitmapFont, text: string): number {
  let height = 0;
  for (const code of unicodeToKamenicky(text)) height = Math.max(height, glyphSize(font, code).height);
  return height;
}

function channel(v: number): number {
  return (v << 3) | (v >> 2);
}

function blend(target: Uint8ClampedArray, at: number, color: number): void {
  if (color & BG_BLEND) {
    const back = rgb555(target[at]! >> 3, target[at + 1]! >> 3, target[at + 2]! >> 3);
    color = ((back & 0x7bde) + (color & 0x7bde)) >> 1;
  }
  target[at] = channel((color >> 10) & 31);
  target[at + 1] = channel((color >> 5) & 31);
  target[at + 2] = channel(color & 31);
  target[at + 3] = 255;
}

export function drawGlyphs(image: ImageData, font: BitmapFont, codes: Uint8Array, x: number, y: number, colors: FontColors): number {
  const data = font.data;
  let penX = x;
  for (const code of codes) {
    const offset = glyphOffset(font, code);
    if (offset === 0) continue;
    const columns = data[offset]!;
    const rows = data[offset + 1]!;
    let p = offset + 2;
    let skip = 0;
    let done = false;
    for (let cx = 0; cx < columns && !done; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if (skip > 0) {
          skip--;
          continue;
        }
        const value = data[p++]!;
        if (value === 0) continue;
        if (value === 255) {
          done = true;
          break;
        }
        if (value >= 8) {
          skip = value - 7;
          continue;
        }
        const color = colors[value - 1] ?? 0;
        const px = penX + cx;
        const py = y + cy;
        if (color === COLOR_SKIP || px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
        blend(image.data, (py * image.width + px) * 4, color);
      }
    }
    penX += columns;
  }
  return penX - x;
}

export function drawBitmapText(ctx: CanvasRenderingContext2D, font: BitmapFont, text: string, x: number, y: number, colors: FontColors): number {
  const codes = unicodeToKamenicky(text);
  let width = 0;
  let height = 0;
  for (const code of codes) {
    const size = glyphSize(font, code);
    width += size.width;
    height = Math.max(height, size.height);
  }
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(ctx.canvas.width, Math.floor(x) + width);
  const bottom = Math.min(ctx.canvas.height, Math.floor(y) + height);
  if (right <= left || bottom <= top) return width;
  const image = ctx.getImageData(left, top, right - left, bottom - top);
  drawGlyphs(image, font, codes, Math.floor(x) - left, Math.floor(y) - top, colors);
  ctx.putImageData(image, left, top);
  return width;
}

export type Align = 0 | 1 | 2;

export function drawAlignedText(
  ctx: CanvasRenderingContext2D,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  alignX: Align,
  alignY: Align,
  colors: FontColors,
): void {
  if (alignX === 1) x -= textWidth(font, text) >> 1;
  else if (alignX === 2) x -= textWidth(font, text);
  if (alignY === 1) y -= textHeight(font, text) >> 1;
  else if (alignY === 2) y -= textHeight(font, text);
  drawBitmapText(ctx, font, text, x, y, colors);
}

export function transBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: number): void {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(ctx.canvas.width, x + width);
  const bottom = Math.min(ctx.canvas.height, y + height);
  if (right <= left || bottom <= top) return;
  const image = ctx.getImageData(left, top, right - left, bottom - top);
  for (let at = 0; at < image.data.length; at += 4) blend(image.data, at, color | BG_BLEND);
  ctx.putImageData(image, left, top);
}
