// Shared portrait-thumbnail helper used by both the character-creation
// roster box and the dungeon view's party status bar. No separate
// bust-portrait asset exists in the archive — the small face crops shown
// in both places are really just a fixed region of the desk-panel
// background art (POSTAVY.PCX), at the same coordinates the chargen face
// grid uses to pick a portrait.
import { PORTRAIT_DISPLAY_ORDER } from './party';

// Matches character-creation.ts's DESK/FACE_GRID layout constants (POSTAVY.PCX
// is drawn at DESK.x/DESK.y, so these crop coordinates are relative to that).
const DESK_ORIGIN = { x: 266, y: 17 };
const FACE_GRID = { x: 294, y: 35, step: 40, width: 27, height: 37 };

// putImageData() can't scale, and cropping needs drawImage()'s source-rect
// form — cache a same-size canvas per ImageData so repeated draws don't
// re-upload the pixels every frame.
const canvasCache = new WeakMap<ImageData, HTMLCanvasElement>();
export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  let canvas = canvasCache.get(data);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);
    canvasCache.set(data, canvas);
  }
  return canvas;
}

const faceCropCache = new Map<number, HTMLCanvasElement>();
export function faceThumbnail(deskPanel: ImageData | undefined, portraitIndex: number): HTMLCanvasElement | undefined {
  if (!deskPanel) return undefined;
  const cached = faceCropCache.get(portraitIndex);
  if (cached) return cached;
  const slot = PORTRAIT_DISPLAY_ORDER.indexOf(portraitIndex as (typeof PORTRAIT_DISPLAY_ORDER)[number]);
  if (slot === -1) return undefined;
  const localX = FACE_GRID.x - DESK_ORIGIN.x + slot * FACE_GRID.step;
  const localY = FACE_GRID.y - DESK_ORIGIN.y;
  const crop = document.createElement('canvas');
  crop.width = FACE_GRID.width;
  crop.height = FACE_GRID.height;
  const c = crop.getContext('2d');
  if (!c) return undefined;
  c.drawImage(imageDataToCanvas(deskPanel), localX, localY, FACE_GRID.width, FACE_GRID.height, 0, 0, FACE_GRID.width, FACE_GRID.height);
  faceCropCache.set(portraitIndex, crop);
  return crop;
}
