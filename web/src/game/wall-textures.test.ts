import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DungeonTextureSet } from './dungeon-view';
import { orientWallTextures, primaryWallRect, secondaryWallRect } from './wall-textures';

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

function column(top: number, bottom: number): ImageData {
  return new FakeImageData(new Uint8ClampedArray([top, 0, 0, 255, bottom, 0, 0, 255]), 1, 2) as unknown as ImageData;
}

const one = (image: ImageData) => new Map([[1, image]]);

describe('orientWallTextures', () => {
  const original = (globalThis as { ImageData?: unknown }).ImageData;
  beforeAll(() => {
    (globalThis as { ImageData?: unknown }).ImageData = FakeImageData;
  });
  afterAll(() => {
    (globalThis as { ImageData?: unknown }).ImageData = original;
  });

  it('puts the first PCX row at the bottom for every wall bank, like sikma_zleva', () => {
    const set: DungeonTextureSet = {
      main: one(column(10, 20)),
      left: one(column(10, 20)),
      right: one(column(10, 20)),
      archLeft: one(column(10, 20)),
      archRight: one(column(10, 20)),
      floor: one(column(10, 20)),
      ceil: one(column(10, 20)),
      item: one(column(10, 20)),
    };
    const oriented = orientWallTextures(set);
    for (const bank of ['main', 'left', 'right', 'archLeft', 'archRight'] as const) {
      expect(Array.from(oriented[bank].get(1)!.data)).toEqual([20, 0, 0, 255, 10, 0, 0, 255]);
    }
    for (const bank of ['floor', 'ceil', 'item'] as const) {
      expect(oriented[bank]).toBe(set[bank]);
    }
  });
});

describe('front wall placement', () => {
  const cell = { x: 100, y: 50, width: 250, height: 160 };

  it('anchors a primary texture at the cell floor in native 500x320 units', () => {
    expect(primaryWallRect(cell, 500, 510, 0)).toEqual({ x: 100, y: 210 - 255, width: 250, height: 255 });
    expect(primaryWallRect(cell, 500, 320, 1).y).toBe(50 - 160);
    expect(primaryWallRect(cell, 250, 320, 0, true).x).toBe(225);
  });

  it('centres a secondary texture on xsec*2/ysec*2 like show_cel2 rev 0', () => {
    expect(secondaryWallRect(cell, 500, 400, 125, 60)).toEqual({ x: 100, y: 50, width: 250, height: 200 });
  });
});
