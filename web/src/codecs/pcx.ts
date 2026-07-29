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
  // Sprite assets (e.g. the character-generator body sprites) use a solid
  // palette index — verified as index 0 against the real CHAR*.PCX files —
  // as a colorkey background that the original blitter skips. Plain
  // background/UI art has no such convention, so this is opt-in per call
  // site rather than a global default.
  transparentIndex?: number;
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

  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  let srcPos = HEADER_SIZE;
  for (let y = 0; y < height; y++) {
    const { row, bytesConsumed } = decompressLine(data, srcPos, bytesPerLine);
    srcPos += bytesConsumed;
    for (let x = 0; x < width; x++) {
      const paletteIndex = row[x] ?? 0;
      const out = (y * width + x) * 4;
      if (paletteIndex === options.transparentIndex) {
        rgba[out + 3] = 0;
        continue;
      }
      const index = paletteIndex * 3;
      rgba[out] = palette[index] ?? 0;
      rgba[out + 1] = palette[index + 1] ?? 0;
      rgba[out + 2] = palette[index + 2] ?? 0;
      rgba[out + 3] = 255;
    }
  }

  return { width, height, rgba };
}

export function pcxToImageData(image: PcxImage): ImageData {
  return new ImageData(image.rgba, image.width, image.height);
}
