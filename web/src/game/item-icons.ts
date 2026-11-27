export const ICONS_PER_LIB = 18;
export const ICON_BYTES = 2 + 2 + 2 + 2 * 256 + 55 * 45;
const PIXELS_OFFSET = 6 + 512;

function channel(v: number): number {
  return (v << 3) | (v >> 2);
}

export function iconLibName(icon: number): string {
  return `IKONY${String(Math.floor(icon / ICONS_PER_LIB)).padStart(2, '0')}.LIB`;
}

export function decodeIcon(lib: Uint8Array, icon: number): ImageData | undefined {
  const base = (icon % ICONS_PER_LIB) * ICON_BYTES;
  if (base + ICON_BYTES > lib.length) return undefined;
  const view = new DataView(lib.buffer, lib.byteOffset + base, ICON_BYTES);
  const width = view.getUint16(0, true);
  const height = view.getUint16(2, true);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const index = lib[base + PIXELS_OFFSET + i]!;
    if (index === 0) continue;
    const color = view.getUint16(6 + index * 2, true);
    rgba[i * 4] = channel((color >> 10) & 31);
    rgba[i * 4 + 1] = channel((color >> 5) & 31);
    rgba[i * 4 + 2] = channel(color & 31);
    rgba[i * 4 + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}
