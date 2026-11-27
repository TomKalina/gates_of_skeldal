import { describe, expect, it } from 'vitest';
import { BG_BLEND, COLOR_SKIP, drawGlyphs, glyphSize, parseBitmapFont, rgb555, textWidth } from './bitmap-font';
import { unicodeToKamenicky } from '../formats/enc-file';

function fontWithGlyph(code: number, glyph: number[]): Uint8Array {
  const data = new Uint8Array(512 + glyph.length);
  data[code * 2] = 0;
  data[code * 2 + 1] = 2;
  data.set(glyph, 512);
  return data;
}

function blankImage(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' };
}

function pixel(image: ImageData, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return Array.from(image.data.slice(at, at + 4));
}

describe('bitmap font', () => {
  const glyph = [2, 3, 2, 0, 9, 1, 255];
  const font = parseBitmapFont(fontWithGlyph(65, glyph));

  it('reads glyph size and measures text', () => {
    expect(glyphSize(font, 65)).toEqual({ width: 2, height: 3 });
    expect(glyphSize(font, 66)).toEqual({ width: 0, height: 0 });
    expect(textWidth(font, 'AA')).toBe(4);
  });

  it('decodes column-major runs with transparent skips', () => {
    const image = blankImage(4, 3);
    const colors = [rgb555(31, 0, 0), rgb555(0, 31, 0), 0, 0, 0, 0, 0];
    drawGlyphs(image, font, new Uint8Array([65]), 0, 0, colors);
    expect(pixel(image, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(image, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(image, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(image, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(image, 1, 2)).toEqual([255, 0, 0, 255]);
  });

  it('skips and blends colours like charcolors', () => {
    const image = blankImage(2, 3);
    image.data.fill(255);
    drawGlyphs(image, font, new Uint8Array([65]), 0, 0, [BG_BLEND, COLOR_SKIP, 0, 0, 0, 0, 0]);
    expect(pixel(image, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(image, 1, 2)[0]).toBe(123);
  });

  it('encodes Czech text to Kamenický bytes', () => {
    expect(Array.from(unicodeToKamenicky('Aá Ř'))).toEqual([0x41, 0xa0, 0x20, 0x9e]);
  });
});
