import { drawAlignedText, fontColors, rgb555, type BitmapFont } from '../gfx/bitmap-font';
import { imageDataToCanvas } from './portraits';

export const PARTY_BAR_Y = 378;
const FACE = { x: 3, y: 12, width: 54, height: 75 };
const SEL_COLOR = rgb555(31, 31, 31);
const BARS = { top: 13, height: 72 };
const BAR_COLUMNS = { lives: [60, 62], stamina: [64, 66], mana: [68, 70] } as const;

export interface PartyBarAssets {
  desk?: ImageData | undefined;
  okno?: ImageData | undefined;
  faces?: ReadonlyMap<number, ImageData> | undefined;
  nameFont?: BitmapFont | undefined;
  death?: ImageData | undefined;
}

export interface PartyBarMember {
  name: string;
  portraitIndex: number;
  group: number;
  fill?: { lives: number; stamina: number; mana: number };
  faceFrame?: number;
  dead?: boolean;
}

export const PARTY_SLOT = { firstX: 54, y: 378 } as const;

export function faceFrameForLives(lives: number, maxLives: number): number {
  if (lives >= maxLives || maxLives <= 0) return 0;
  return 3 - Math.trunc(((lives - 1) * 4) / maxLives);
}

export function partySlotRect(okno: ImageData, slot: number): { x: number; y: number; width: number; height: number } {
  return { x: PARTY_SLOT.firstX + okno.width * slot, y: PARTY_SLOT.y, width: okno.width, height: okno.height };
}

export function drawPartyBar(ctx: CanvasRenderingContext2D, assets: PartyBarAssets, members: readonly PartyBarMember[]): void {
  if (assets.desk) ctx.putImageData(assets.desk, 0, PARTY_BAR_Y);
  const okno = assets.okno;
  if (!okno) return;
  const oknoCanvas = imageDataToCanvas(okno);
  members.forEach((member, slot) => {
    const x = PARTY_SLOT.firstX + okno.width * slot;
    ctx.drawImage(oknoCanvas, x, PARTY_BAR_Y);
    const face = assets.faces?.get(member.portraitIndex);
    if (member.dead) {
      if (assets.death) ctx.drawImage(imageDataToCanvas(assets.death), x + FACE.x, PARTY_BAR_Y + FACE.y);
    } else if (face) {
      const top = (member.faceFrame ?? 0) * FACE.height;
      ctx.drawImage(imageDataToCanvas(face), 0, top, FACE.width, FACE.height, x + FACE.x, PARTY_BAR_Y + FACE.y, FACE.width, FACE.height);
    }
    if (member.fill) {
      ctx.fillStyle = '#000';
      for (const key of ['lives', 'stamina', 'mana'] as const) {
        const empty = BARS.height - Math.trunc(member.fill[key] * BARS.height);
        const [from, to] = BAR_COLUMNS[key];
        if (empty > 0) ctx.fillRect(x + from, PARTY_BAR_Y + BARS.top, to - from + 1, empty + 1);
      }
    }
    const font = assets.nameFont;
    if (!font) return;
    const colors = fontColors(SEL_COLOR);
    drawAlignedText(ctx, font, member.name, x + 36, PARTY_BAR_Y + 92, 1, 0, colors);
    drawAlignedText(ctx, font, String(member.group), x + 5, PARTY_BAR_Y + 86, 0, 2, colors);
  });
}
