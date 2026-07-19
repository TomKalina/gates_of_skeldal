// Decoder for the game's 256-color PCX assets (libs/pcx.c: load_pcx + the
// decomprimate_line_256 RLE codec). Standard 128-byte PCX header, RLE-compressed
// 8bpp scanlines, 256-entry RGB palette in the last 768 bytes of the file
// (libs/pcx.c: `paleta1 = pcx + fsize - 768`). Decodes straight to RGBA since
// the browser has no use for the game's internal 8-bit/hicolor storage variants.
export interface PcxImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

const HEADER_SIZE = 128;
const PALETTE_SIZE = 768;

function decompressLine(src: Uint8Array, srcPos: number, outLen: number): { row: Uint8Array; bytesConsumed: number } {
  const row = new Uint8Array(outLen);
  let outPos = 0;
  let pos = srcPos;
  while (outPos < outLen) {
    const b = src[pos++];
    if (b === undefined) throw new Error('PCX: unexpected end of data while decompressing scanline');
    if (b >= 0xc0) {
      const count = b & 0x3f;
      const value = src[pos++];
      if (value === undefined) throw new Error('PCX: unexpected end of data while decompressing scanline');
      const n = Math.min(count, outLen - outPos);
      row.fill(value, outPos, outPos + n);
      outPos += n;
    } else {
      row[outPos++] = b;
    }
  }
  return { row, bytesConsumed: pos - srcPos };
}

export interface DecodePcxOptions {
  // Sprite/wall-decoration assets use a reserved palette index as a colorkey
  // background that the original blitter skips; plain full-bleed background
  // art has no such convention, so this is opt-in per call site. The index
  // isn't a single constant across asset types — verified index 0 for
  // CHAR*.PCX body sprites, index 1 for map wall/decoration textures (both
  // main and side sets) via a direct pixel-count survey: across 102 real
  // wall textures, index 1's share was either exactly 0% (never used —
  // full-bleed art) or >11% (clearly the reserved background), with no
  // textures in between. So it's safe to always pass the asset type's
  // known index; when a given image doesn't use it, nothing gets punched
  // out, since no pixel matches.
  //
  // A niche-flagged wall side's prop texture (see dungeon.ts's
  // frontWallFlipped) reserves *two* indices for background — verified
  // against LES1A23A.PCX (a table): index 1 is the usual wall/decoration
  // colorkey (61% of pixels), but index 0 is a second, separately-painted
  // "background" color (here, opaque red, 27% of pixels) that isn't real
  // content either. Passing an array punches out all of them.
  transparentIndex?: number | number[];
}

export function decodePcx(data: Uint8Array, options: DecodePcxOptions = {}): PcxImage {
  if (data.length < HEADER_SIZE + PALETTE_SIZE) {
    throw new Error('PCX: data too small to contain a header and palette');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const xmin = view.getUint16(4, true);
  const ymin = view.getUint16(6, true);
  const xmax = view.getUint16(8, true);
  const ymax = view.getUint16(10, true);
  const bytesPerLine = view.getUint16(66, true);
  const width = xmax - xmin + 1;
  const height = ymax - ymin + 1;

  const paletteOffset = data.length - PALETTE_SIZE;
  const palette = data.subarray(paletteOffset, paletteOffset + PALETTE_SIZE);

  const transparentIndices = new Set(
    options.transparentIndex === undefined
      ? []
      : Array.isArray(options.transparentIndex)
        ? options.transparentIndex
        : [options.transparentIndex],
  );

  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  let srcPos = HEADER_SIZE;
  for (let y = 0; y < height; y++) {
    const { row, bytesConsumed } = decompressLine(data, srcPos, bytesPerLine);
    srcPos += bytesConsumed;
    for (let x = 0; x < width; x++) {
      const paletteIndex = row[x] ?? 0;
      const out = (y * width + x) * 4;
      if (transparentIndices.has(paletteIndex)) {
        rgba[out + 3] = 0;
        continue;
      }
      const p = paletteIndex * 3;
      rgba[out] = palette[p] ?? 0;
      rgba[out + 1] = palette[p + 1] ?? 0;
      rgba[out + 2] = palette[p + 2] ?? 0;
      rgba[out + 3] = 255;
    }
  }

  return { width, height, rgba };
}

export function pcxToImageData(image: PcxImage): ImageData {
  return new ImageData(image.rgba, image.width, image.height);
}

// A subset of the game's wall/door/decoration PCX assets are authored
// stored top-to-bottom flipped relative to the rest — see main.ts's
// VERTICALLY_FLIPPED_TEXTURES for which ones and how that was determined
// (no map-data flag or file-header field predicts it; verified per-file by
// visual inspection). This is the mechanical flip they get baked through
// once, at texture-load time.
export function flipImageDataVertically(image: ImageData): ImageData {
  const { width, height, data } = image;
  const flipped = new Uint8ClampedArray(data.length);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const srcStart = y * rowBytes;
    const dstStart = (height - 1 - y) * rowBytes;
    flipped.set(data.subarray(srcStart, srcStart + rowBytes), dstStart);
  }
  return new ImageData(flipped, width, height);
}
