export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 480;

export function createScreenCanvas(root: HTMLElement): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  root.replaceChildren(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}
