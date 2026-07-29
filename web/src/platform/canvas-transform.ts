// The game canvas is displayed via CSS object-fit: contain (see
// canvas-context.ts), so its layout box is generally larger than the
// letterboxed area it actually draws into. Shared here because both mouse
// hit-testing (main-menu.ts) and DOM-overlay positioning (character-creation.ts)
// need to convert between canvas-pixel space and CSS client space.
export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function getCanvasTransform(canvas: HTMLCanvasElement): CanvasTransform {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const displayWidth = canvas.width * scale;
  const displayHeight = canvas.height * scale;
  return {
    scale,
    offsetX: rect.left + (rect.width - displayWidth) / 2,
    offsetY: rect.top + (rect.height - displayHeight) / 2,
  };
}

export function clientToCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const t = getCanvasTransform(canvas);
  return { x: (clientX - t.offsetX) / t.scale, y: (clientY - t.offsetY) / t.scale };
}

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function canvasRectToClientRect(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): ClientRect {
  const t = getCanvasTransform(canvas);
  return {
    left: t.offsetX + x * t.scale,
    top: t.offsetY + y * t.scale,
    width: width * t.scale,
    height: height * t.scale,
  };
}
