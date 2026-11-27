import { BG_BLEND, drawAlignedText, fontColors, glyphSize, rgb555, transBar, type Align, type BitmapFont, type FontColors } from '../gfx/bitmap-font';
import { baseVlastnosti, VLS } from './inventory';
import type { Character, PrimaryStat } from './party';

export const SHEET_ORIGIN = { x: 325, y: 67 };
const COL_STEP = 8;
const LINE_STEP = 6;
const FIRST_LEVEL_EXP = 400;
const AP_MULTIPLIER = 15;
const MAX_PRIMARY_FOR_BONUS = 100;

const BLACK_NO_SHADOW = BG_BLEND;
const BONUS_LABEL = rgb555(0, 0, 15) | BG_BLEND;
const BONUS_VALUE = rgb555(31, 24, 0);
const PLUS_COLORS: FontColors = [0, rgb555(25, 23, 16), rgb555(18, 17, 14), rgb555(10, 10, 5), rgb555(31, 27, 14), 0, 0];
const FOOD_COLOR = rgb555(18, 17, 14);
const WATER_COLOR = rgb555(14, 17, 18);

export interface SheetFonts {
  text: BitmapFont;
  symbols: BitmapFont;
}

interface SheetEntry {
  col: number;
  line: number;
  text: (c: Character, v: readonly number[]) => string;
  align: Align;
  label?: boolean;
  bonus?: boolean;
}

const PRIMARY: readonly { line: number; stat: PrimaryStat; vls: number; label: string }[] = [
  { line: 12, stat: 'strength', vls: VLS.SILA, label: 'Síla' },
  { line: 14, stat: 'magic', vls: VLS.SMAGIE, label: 'Umění magie' },
  { line: 16, stat: 'speed', vls: VLS.POHYB, label: 'Pohyblivost' },
  { line: 18, stat: 'dexterity', vls: VLS.OBRAT, label: 'Obratnost' },
];

const value = (fn: (c: Character, v: readonly number[]) => string | number) => (c: Character, v: readonly number[]) => String(fn(c, v));
const fixed = (text: string) => () => text;
const label = (col: number, line: number, text: string, bonus = false): SheetEntry => ({ col, line, text: fixed(text), align: 0, label: true, bonus });
const right = (col: number, line: number, text: (c: Character, v: readonly number[]) => string, bonus = false): SheetEntry => ({ col, line, text, align: 2, bonus });

const WEAPONS = ['Meč:', 'Sekera:', 'Kladivo:', 'Hůl:', 'Dýka:', 'Střelné:', 'Specialní:'];
const RESISTANCES = ['Oheň', 'Voda', 'Země', 'Vzduch', 'Mysl'];

const SCRIPT: readonly SheetEntry[] = [
  ...PRIMARY.map((p) => right(15, p.line, value((_, v) => v[p.vls]!), true)),
  right(15, 5, value((_, v) => `${v[VLS.MAXHIT]}/${v[VLS.MAXHIT]}`)),
  right(15, 7, value((_, v) => `${v[VLS.MAXMANA]}/${v[VLS.MAXMANA]}`)),
  right(15, 9, value((_, v) => `${v[VLS.KONDIC]}/${v[VLS.KONDIC]}`)),
  right(15, 20, value((c) => c.bonusPoints)),
  ...WEAPONS.map((_, i) => right(15, 25 + i * 2, fixed('0'))),
  label(0, 0, 'Úroveň'),
  label(0, 2, 'Zk.'),
  right(15, 0, value((c) => c.level)),
  right(30, 2, value((c) => `${c.exp} [${c.level === 1 ? FIRST_LEVEL_EXP - c.exp : 0}]`)),
  label(0, 5, 'Životy'),
  label(0, 7, 'Mana'),
  label(0, 9, 'Kondice'),
  ...PRIMARY.map((p) => label(0, p.line, p.label, true)),
  label(0, 20, 'Bonus'),
  label(0, 23, 'Bonusy zbraní:'),
  ...WEAPONS.map((w, i) => label(0, 25 + i * 2, w)),
  right(30, 5, value((_, v) => `${v[VLS.UTOK_L]}-${v[VLS.UTOK_H]}`)),
  right(30, 7, value((_, v) => `${v[VLS.OBRAN_L]}-${v[VLS.OBRAN_H]}`)),
  right(30, 9, value((_, v) => Math.floor(v[VLS.POHYB]! / AP_MULTIPLIER))),
  label(17, 5, 'Útok'),
  label(17, 7, 'Obrana'),
  label(17, 9, 'Akce'),
  ...RESISTANCES.map((_, i) => right(30, 14 + i * 2, value((_c, v) => v[VLS.OHEN + i]!))),
  label(17, 12, 'Ochrany:'),
  ...RESISTANCES.map((r, i) => label(17, 14 + i * 2, r)),
];

function entryColor(entry: SheetEntry, character: Character): number {
  if (!entry.bonus || character.bonusPoints === 0) return BLACK_NO_SHADOW;
  return entry.label ? BONUS_LABEL : BONUS_VALUE;
}

export function maxFood(vls: readonly number[]): number {
  return Math.floor(vls[VLS.MAXHIT]! / 2) + 48;
}

export function maxWater(vls: readonly number[]): number {
  return Math.floor(vls[VLS.MAXHIT]! / 3) + 24;
}

function sunkenBorder(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  const white = rgb555(31, 31, 31);
  for (let i = 1; i >= 0; i--) {
    transBar(ctx, x + i, y + i, width - 2 * i, 1, 0);
    transBar(ctx, x + i, y + height - i - 1, width - 2 * i, 1, white);
    transBar(ctx, x + i, y + i, 1, height - 2 * i, 0);
    transBar(ctx, x + width - i - 1, y + i, 1, height - 2 * i, white);
  }
}

function fillRgb555(ctx: CanvasRenderingContext2D, color: number, x: number, y: number, width: number, height: number): void {
  const c = (v: number) => (v << 3) | (v >> 2);
  ctx.fillStyle = `rgb(${c((color >> 10) & 31)},${c((color >> 5) & 31)},${c(color & 31)})`;
  ctx.fillRect(x, y, width, height);
}

function percentBar(ctx: CanvasRenderingContext2D, font: BitmapFont, x: number, y: number, current: number, max: number, color: number, caption: string): void {
  const width = 90;
  const height = 10;
  fillRgb555(ctx, color, x, y, Math.floor((width * current) / max) + 1, height + 1);
  sunkenBorder(ctx, x - 2, y - 2, width + 5, height + 5);
  const colors = fontColors(BLACK_NO_SHADOW);
  drawAlignedText(ctx, font, caption, x, y - 5, 0, 2, colors);
  drawAlignedText(ctx, font, `${current}/${max}`, x + width / 2, y + height / 2, 1, 1, colors);
}

function entryPosition(col: number, line: number): { x: number; y: number } {
  return { x: SHEET_ORIGIN.x + col * COL_STEP, y: SHEET_ORIGIN.y + line * LINE_STEP };
}

export function drawStatsSheet(ctx: CanvasRenderingContext2D, fonts: SheetFonts, character: Character, vls: readonly number[] = baseVlastnosti(character)): void {
  for (const entry of SCRIPT) {
    const { x, y } = entryPosition(entry.col, entry.line);
    drawAlignedText(ctx, fonts.text, entry.text(character, vls), x, y, entry.align, 0, fontColors(entryColor(entry, character)));
  }
  percentBar(ctx, fonts.text, SHEET_ORIGIN.x + 140, SHEET_ORIGIN.y + 170, maxFood(vls), maxFood(vls), FOOD_COLOR, 'Jídlo');
  percentBar(ctx, fonts.text, SHEET_ORIGIN.x + 140, SHEET_ORIGIN.y + 210, maxWater(vls), maxWater(vls), WATER_COLOR, 'Voda');
  for (const rect of Object.values(plusButtonRects(fonts, character))) {
    drawAlignedText(ctx, fonts.symbols, '+', rect.x, rect.y, 0, 0, PLUS_COLORS);
  }
}

export function plusButtonRects(
  fonts: SheetFonts,
  character: Character,
): Partial<Record<PrimaryStat, { x: number; y: number; width: number; height: number }>> {
  const rects: Partial<Record<PrimaryStat, { x: number; y: number; width: number; height: number }>> = {};
  if (character.bonusPoints === 0) return rects;
  const size = glyphSize(fonts.symbols, '+'.charCodeAt(0));
  for (const p of PRIMARY) {
    if (character.stats[p.stat] >= MAX_PRIMARY_FOR_BONUS) continue;
    const { x, y } = entryPosition(15, p.line);
    rects[p.stat] = { x: x + 1, y, width: size.width, height: size.height };
  }
  return rects;
}
