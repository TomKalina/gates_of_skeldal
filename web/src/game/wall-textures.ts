import { flipImageDataVertically } from '../codecs/pcx';
import type { DungeonTextureSet } from './dungeon-view';

function flipSet(textures: ReadonlyMap<number, ImageData>): ReadonlyMap<number, ImageData> {
  const flipped = new Map<number, ImageData>();
  for (const [key, image] of textures) flipped.set(key, flipImageDataVertically(image));
  return flipped;
}

export function orientWallTextures(textures: DungeonTextureSet): DungeonTextureSet {
  return {
    ...textures,
    main: flipSet(textures.main),
    left: flipSet(textures.left),
    right: flipSet(textures.right),
    archLeft: flipSet(textures.archLeft),
    archRight: flipSet(textures.archRight),
  };
}

export const TXT_SIZE_X = 500;
export const TXT_SIZE_Y = 320;

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function primaryWallRect(cell: WallRect, width: number, height: number, plac: number, fromRight = false): WallRect {
  const w = (width * cell.width) / TXT_SIZE_X;
  const h = (height * cell.height) / TXT_SIZE_Y;
  const shift = plac === 1 ? -cell.height : plac === 2 ? cell.height : 0;
  const x = fromRight ? cell.x + cell.width - w : cell.x;
  return { x, y: cell.y + cell.height + shift - h, width: w, height: h };
}

export function secondaryWallRect(cell: WallRect, width: number, height: number, xsec: number, ysec: number): WallRect {
  const w = (width * cell.width) / TXT_SIZE_X;
  const h = (height * cell.height) / TXT_SIZE_Y;
  const left = cell.x + ((2 * xsec - Math.trunc(width / 2)) * cell.width) / TXT_SIZE_X;
  const bottom = cell.y + cell.height - ((2 * ysec - Math.trunc(height / 2)) * cell.height) / TXT_SIZE_Y;
  return { x: left, y: bottom - h, width: w, height: h };
}
