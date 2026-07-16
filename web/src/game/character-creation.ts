import {
  angleAndRadiusFromOffset,
  computeAttributeRanges,
  pearlOffsetFromAngle,
  type AttributeRanges,
} from './attribute-wheel';
import {
  createCharacter,
  createEmptyRoster,
  firstEmptySlot,
  isPartyReady,
  spendBonusPoint,
  validateCharacterName,
  withMember,
  type Character,
  type PartyRoster,
  type PrimaryStat,
} from './party';
import { canvasRectToClientRect, clientToCanvasPoint } from '../platform/canvas-transform';

// chargen.c displays its 8 portraits in this file-index order (poradi[]) —
// see party.ts's PORTRAIT_DISPLAY_ORDER comment for why this isn't 0..7.
const PORTRAIT_DISPLAY_ORDER = [0, 2, 3, 4, 1, 5, 6, 7] as const;

const DESK = { x: 266, y: 17, width: 366, height: 360 };
const ARCH = { x: 4, y: 17, width: 262, height: 360 };
const FACE_GRID = { x: 294, y: 35, step: 40, hitWidth: 27, height: 37 };
const WHEEL_RECT = { x: 344, y: 114, width: 236, height: 243 };
const PEARL_CENTER = { x: 455, y: 234 };
const PANEL = { x: 0, y: 378, width: 640, height: 102 };
// chargen.c's edit_name() calls add_task(16384, type_text_v2,
// postavy[cur_edited].jmeno, 120, 2, 104, ...), but the black field actually
// drawn in the topbar art measures larger than that hit-rect (measured via
// corner-rivet landmarks in a reference screenshot — lower confidence than
// the other fixes here since it's an indirect calibration, not a direct
// source cross-check): flush with the top of the bar and a few px
// wider/taller, roughly x:110, y:0, width:110, height:16.
const NAME_INPUT_RECT = { x: 110, y: 0, width: 110, height: 16 };

const BUTTON_HEIGHT = 18;
const BUTTONS_X = 520;
// Labels and stacked order match the real b_texty[0..3] captured from a
// reference screenshot of the original build. The first three buttons sit
// in one stack separated by hairline seams; "Vše znovu" has a visibly wider
// gap above it and its own separate stone frame — a grouping the uniform
// object below doesn't represent. Width keeps the same right-edge margin as
// the old constants since only the left edge, top edge and per-button
// height were directly measurable from the reference.
const BUTTON_WIDTH = 640 - BUTTONS_X - 14;
const BUTTONS = {
  accept: { x: BUTTONS_X, y: 400, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Přijmout' },
  start: { x: BUTTONS_X, y: 419, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Start hry' },
  erase: { x: BUTTONS_X, y: 438, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Vymazat' },
  resetAll: { x: BUTTONS_X, y: 460, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Vše znovu' },
} as const;

// The real screen has exactly one portrait box in the bottom panel — it
// always tracks whichever character is currently being created (selected
// portrait + live name-input value + pending level), never the accepted
// roster. It's flush with the panel's top and the canvas's bottom edge, and
// splits into a portrait/level/bar cell on top and a separate bordered name
// strip below.
const ROSTER_BOX = { x: 53, y: 378, width: 72, height: 102 };
const ROSTER_PORTRAIT_HEIGHT = 86;
const ROSTER_NAME_STRIP_GAP = 2;
// Static vertical bar along the portrait cell's right edge — present even
// with no portrait picked yet, so it's a fixed box decoration, not a
// per-character resource meter (its value/fill-fraction can't be judged
// from the reference screenshots since it always reads full).
const ROSTER_BAR = { x: 113, y: 389, width: 4, height: 75 };

const DEFAULT_ANGLE = 315;
const DEFAULT_RADIUS = 0;

interface StatRow {
  x: number;
  y: number;
  label: string;
  value: string;
  stat?: PrimaryStat;
}

export interface CharacterCreationAssets {
  topbar?: ImageData;
  deskPanel?: ImageData;
  svitek?: ImageData;
  pearl?: ImageData;
  arch?: ImageData;
  bodySprites?: ReadonlyMap<number, ImageData>;
}

export interface CharacterCreationHandle {
  result: Promise<Character[] | null>;
  dispose(): void;
}

function rectContains(rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

// putImageData() can't scale, but the roster box needs the body-sprite
// ImageData drawn into a much smaller thumbnail — cache a same-size canvas
// per sprite so drawImage() can scale it without re-uploading every frame
// (draw() re-runs on every wheel-drag mousemove).
const spriteCanvasCache = new WeakMap<ImageData, HTMLCanvasElement>();
function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  let canvas = spriteCanvasCache.get(data);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);
    spriteCanvasCache.set(data, canvas);
  }
  return canvas;
}

// TS counterpart of chargen.c's enter_generator(): pick a portrait, drag the
// "pearl" around the attribute wheel to pick a stat-range archetype, name the
// character, allocate bonus points on a stat-review screen, and repeat until
// the party (up to MAX_PARTY_SIZE) is ready. Rebuilt against reference
// screenshots of the real game — see docs/port-graph.md for exactly what's
// still simplified (no per-pixel button masks, native <input>/confirm()
// instead of the real GUI toolkit; equipment/food/water/resistance are
// rendered as the fixed values a fresh level-1 character always has, not
// modeled per-character state, since there's no inventory or game-clock
// system yet).
export function runCharacterCreation(ctx: CanvasRenderingContext2D, assets: CharacterCreationAssets = {}): CharacterCreationHandle {
  const canvas = ctx.canvas;
  const root = canvas.parentElement;
  if (!root) throw new Error('canvas must be attached to a parent element');

  let roster: PartyRoster = createEmptyRoster();
  let mode: 'select' | 'review' = 'select';
  let selectedPortrait: number | null = null;
  let pendingCharacter: Character | null = null;
  let angleDeg = DEFAULT_ANGLE;
  let radius = DEFAULT_RADIUS;
  let dragging = false;
  let statusText = '';

  let resolveResult!: (value: Character[] | null) => void;
  const result = new Promise<Character[] | null>((resolve) => {
    resolveResult = resolve;
  });

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 20;
  nameInput.style.position = 'absolute';
  nameInput.style.font = '11px monospace';
  nameInput.style.padding = '0 2px';
  // Reference shows the name field as a solid black box with bright yellow
  // bitmap-font text and a blinking underscore cursor; a native <input>'s
  // caret is a plain vertical bar and can't reproduce the underscore look,
  // but background/text/caret color should still match.
  nameInput.style.background = '#000';
  nameInput.style.color = '#eee84c';
  nameInput.style.border = 'none';
  nameInput.style.caretColor = '#eee84c';
  root.appendChild(nameInput);

  function currentRanges(): AttributeRanges {
    return computeAttributeRanges(angleDeg, radius);
  }

  function usedPortraitSet(): ReadonlySet<number> {
    const used = new Set<number>();
    for (const member of roster) if (member) used.add(member.portraitIndex);
    if (selectedPortrait !== null) used.add(selectedPortrait);
    return used;
  }

  function positionNameInput(): void {
    const rect = canvasRectToClientRect(canvas, NAME_INPUT_RECT.x, NAME_INPUT_RECT.y, NAME_INPUT_RECT.width, NAME_INPUT_RECT.height);
    nameInput.style.left = `${rect.left}px`;
    nameInput.style.top = `${rect.top}px`;
    nameInput.style.width = `${rect.width}px`;
    nameInput.style.height = `${rect.height}px`;
  }

  // The reference never changes the button frame/border color by state —
  // every button keeps the same carved-stone bezel regardless of which are
  // enabled. The only state indicator is the label text color: gold/brass
  // when the action is available, plain near-black (un-inked carved look)
  // when it isn't.
  function drawButton(rect: { x: number; y: number; width: number; height: number; label: string }, enabled: boolean): void {
    ctx.strokeStyle = '#5a5246';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
    ctx.font = '12px monospace';
    ctx.fillStyle = enabled ? '#f0d750' : '#3e3e3e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.textAlign = 'left';
  }

  function drawTopbar(): void {
    if (assets.topbar) ctx.putImageData(assets.topbar, 0, 0);
    else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, 16);
    }
    ctx.font = '12px monospace';
    ctx.fillStyle = '#d9954a';
    ctx.textBaseline = 'top';
    // x positions match zobraz_staty() in chargen.c exactly — the topbar art
    // reserves the region left of x=230 for the "JMÉNO HRDINY" label + name.
    // Always the wheel-roll range format, even once a character is pending
    // review: a reference screenshot taken on the review/svitek page still
    // shows these as ranges, not the pending character's exact rolled
    // stats — those only appear in the parchment stat sheet.
    const ranges = currentRanges();
    ctx.fillText(`SÍLA: ${ranges.strengthLow}-${ranges.strengthHigh}`, 230, 2);
    ctx.fillText(`U.MAG: ${ranges.magicLow}-${ranges.magicHigh}`, 330, 2);
    ctx.fillText(`POHYB: ${ranges.speedLow}-${ranges.speedHigh}`, 430, 2);
    ctx.fillText(`OBRAT: ${ranges.dexterityLow}-${ranges.dexterityHigh}`, 530, 2);
  }

  function drawSelectPage(): void {
    if (assets.deskPanel) ctx.putImageData(assets.deskPanel, DESK.x, DESK.y);
    else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(DESK.x, DESK.y, DESK.width, DESK.height);
    }

    const used = usedPortraitSet();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    PORTRAIT_DISPLAY_ORDER.forEach((portrait, slot) => {
      if (used.has(portrait) && portrait !== selectedPortrait) {
        ctx.fillRect(FACE_GRID.x + slot * FACE_GRID.step, FACE_GRID.y, FACE_GRID.hitWidth, FACE_GRID.height);
      }
    });
    // No highlight/border is drawn around the selected portrait — the real
    // game leaves every cell looking identical regardless of selection;
    // the choice is communicated by the body sprite in the arch and the
    // roster thumbnail instead.

    const pearlOffset = pearlOffsetFromAngle(angleDeg, radius);
    const pearlX = PEARL_CENTER.x + pearlOffset.dx;
    const pearlY = PEARL_CENTER.y + pearlOffset.dy;
    if (assets.pearl) {
      // drawImage, not putImageData — the pearl's colorkey-punched corners
      // need to composite over the wheel art already drawn, not overwrite it.
      ctx.drawImage(
        imageDataToCanvas(assets.pearl),
        pearlX - Math.floor(assets.pearl.width / 2),
        pearlY - Math.floor(assets.pearl.height / 2),
      );
    } else {
      ctx.fillStyle = '#a9803f';
      ctx.beginPath();
      ctx.arc(pearlX, pearlY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const LEFT_X = DESK.x + 24;
  const RIGHT_X = DESK.x + 190;
  const LINE_HEIGHT = 12.5;
  const BONUS_BUTTON_SIZE = 11.5;
  // Value text on every row right-aligns into a fixed column this far past
  // the row's label start — matches the measured gap between the label
  // start and the [+] button's left edge on the primary-stat rows.
  const VALUE_COLUMN_OFFSET = 120;

  // Single source of truth for the left column's row positions, so the
  // drawn [+] buttons and their hit-test rects can never drift apart.
  function computeLeftRows(character: Character): StatRow[] {
    const s = character.stats;
    let y = DESK.y + 34;
    const rows: StatRow[] = [
      { x: LEFT_X, y, label: 'Úroveň', value: String(character.level) },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Zk.', value: String(character.exp) },
      { x: LEFT_X, y: (y += LINE_HEIGHT * 1.5), label: 'Životy', value: `${s.maxHp}/${s.maxHp}` },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Mana', value: `${s.maxMana}/${s.maxMana}` },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Kondice', value: `${s.stamina}/${s.stamina}` },
      { x: LEFT_X, y: (y += LINE_HEIGHT * 1.5), label: 'Síla', value: String(s.strength), stat: 'strength' },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Umění magie', value: String(s.magic), stat: 'magic' },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Pohyblivost', value: String(s.speed), stat: 'speed' },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Obratnost', value: String(s.dexterity), stat: 'dexterity' },
      { x: LEFT_X, y: (y += LINE_HEIGHT), label: 'Bonus', value: String(character.bonusPoints) },
    ];
    return rows;
  }

  // Útok/Obrana/Akce line up with Životy/Mana/Kondice on the left (same
  // *2.5 starting offset); "Ochrany:" is its own section heading lining up
  // with Síla (the *1.5 gap before it mirrors the left column's gap before
  // its own Síla row), followed by the 5 elemental resistances.
  function computeRightRows(): StatRow[] {
    let y = DESK.y + 34 + LINE_HEIGHT * 2.5;
    return [
      { x: RIGHT_X, y, label: 'Útok', value: '1-2' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Obrana', value: '1-2' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Akce', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT * 1.5), label: 'Ochrany:', value: '' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Oheň', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Voda', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Země', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Vzduch', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Mysl', value: '0' },
    ];
  }

  function bonusButtonRect(row: StatRow): { x: number; y: number; width: number; height: number } {
    return { x: row.x + VALUE_COLUMN_OFFSET, y: row.y - 1, width: BONUS_BUTTON_SIZE, height: BONUS_BUTTON_SIZE };
  }

  // Reference stacks Jídlo above Voda as two full-width boxes, not
  // side-by-side — width is approximate (the label/box gap wasn't precisely
  // measurable), sized to comfortably span the right column.
  const GAUGE_WIDTH = 140;
  const GAUGE_HEIGHT = 24;
  const GAUGE_GAP = 6;

  function drawGauge(x: number, y: number, label: string, value: string, fill: string): void {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2a1e12';
    ctx.font = '12px monospace';
    ctx.fillText(label, x, y);
    const boxY = y + LINE_HEIGHT;
    ctx.fillStyle = fill;
    ctx.fillRect(x, boxY, GAUGE_WIDTH, GAUGE_HEIGHT);
    ctx.strokeStyle = '#2a1e12';
    ctx.strokeRect(x + 0.5, boxY + 0.5, GAUGE_WIDTH, GAUGE_HEIGHT);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x + GAUGE_WIDTH / 2, boxY + GAUGE_HEIGHT / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  // Stat-review page: a parchment sheet (SVITEK.PCX, same slot as the desk
  // panel) with the rolled character's stats and a [+] next to each of the 4
  // primary stats to spend the bonus-point pool. Attack/defense/actions,
  // resistances, weapon-bonuses, and the Jídlo/Voda gauges are the fixed
  // values generuj_postavu always sets for a fresh, unequipped level-1
  // character — not fabricated, just not tracked as per-character state
  // since there's no equipment/game-clock system yet (#13/#14); same for
  // the exp-to-next-level bracket next to "Zk." — no leveling table to
  // compute it from yet.
  function drawReviewPage(character: Character): void {
    if (assets.svitek) ctx.putImageData(assets.svitek, DESK.x, DESK.y);
    else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(DESK.x, DESK.y, DESK.width, DESK.height);
    }

    const leftRows = computeLeftRows(character);
    const rightRows = computeRightRows();
    // Every row is label-left / value-right-aligned-into-a-fixed-column —
    // none of these use a colon, unlike the "Bonusy zbraní:" heading and
    // weapon list below them.
    const leftValueX = LEFT_X + VALUE_COLUMN_OFFSET - 3;
    const rightValueX = RIGHT_X + VALUE_COLUMN_OFFSET - 3;

    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    for (const row of leftRows) {
      // The 4 primary stats get a navy label + bold gold-outlined value;
      // every other row is plain near-black. Font is reset every
      // iteration since drawBonusButton() leaves it changed.
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = row.stat ? '#000076' : '#2a1e12';
      ctx.fillText(row.label, row.x, row.y);

      if (row.stat) {
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(row.value, leftValueX, row.y);
        ctx.lineWidth = 1;
        ctx.fillStyle = '#f6c844';
        ctx.fillText(row.value, leftValueX, row.y);
        ctx.font = '12px monospace';
        drawBonusButton(bonusButtonRect(row), character.bonusPoints > 0);
      } else {
        ctx.fillStyle = '#2a1e12';
        ctx.textAlign = 'right';
        // "Zk." shares the right column's value slot instead of the left
        // one — its rolled '0' lines up with Akce/Obrana/Útok, not with
        // its own label.
        ctx.fillText(row.value, row.label === 'Zk.' ? rightValueX : leftValueX, row.y);
        if (row.label === 'Zk.') {
          ctx.textAlign = 'left';
          ctx.fillText('[400]', rightValueX + 6, row.y);
        }
      }
    }

    ctx.fillStyle = '#2a1e12';
    for (const row of rightRows) {
      ctx.textAlign = 'left';
      ctx.fillText(row.label, row.x, row.y);
      if (row.value) {
        ctx.textAlign = 'right';
        ctx.fillText(row.value, rightValueX, row.y);
      }
    }
    ctx.textAlign = 'left';

    let y = (leftRows[leftRows.length - 1]?.y ?? DESK.y + 34) + LINE_HEIGHT * 1.5;
    ctx.fillText('Bonusy zbraní:', LEFT_X, y);
    for (const label of ['Meč:', 'Sekera:', 'Kladivo:', 'Hůl:', 'Dýka:', 'Střelné:', 'Specialní:']) {
      y += LINE_HEIGHT;
      ctx.textAlign = 'left';
      ctx.fillText(label, LEFT_X, y);
      ctx.textAlign = 'right';
      ctx.fillText('0', leftValueX, y);
    }
    ctx.textAlign = 'left';

    const foodWaterY = (rightRows[rightRows.length - 1]?.y ?? DESK.y + 34) + LINE_HEIGHT * 1.5;
    drawGauge(RIGHT_X, foodWaterY, 'Jídlo', '61/61', '#938c76');
    drawGauge(RIGHT_X, foodWaterY + LINE_HEIGHT + GAUGE_HEIGHT + GAUGE_GAP, 'Voda', '32/32', '#788b93');
  }

  // Reference button is a constant cream/olive 3D bevel — only the '+'
  // glyph's color signals whether a bonus point is available (gold, same
  // hue as the primary-stat values, vs. plain near-black), mirroring the
  // frame-constant/text-only state model used for the bottom action
  // buttons.
  function drawBonusButton(rect: { x: number; y: number; width: number; height: number }, enabled: boolean): void {
    ctx.fillStyle = '#cbbe8b';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    gradient.addColorStop(0, '#b99631');
    gradient.addColorStop(1, '#52522e');
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2 + 1;
    if (enabled) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeText('+', cx, cy);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#f6c844';
    } else {
      ctx.fillStyle = '#3e3e3e';
    }
    ctx.fillText('+', cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  function bonusButtonRects(character: Character): Partial<Record<PrimaryStat, { x: number; y: number; width: number; height: number }>> {
    const rects: Partial<Record<PrimaryStat, { x: number; y: number; width: number; height: number }>> = {};
    for (const row of computeLeftRows(character)) {
      if (row.stat) rects[row.stat] = bonusButtonRect(row);
    }
    return rects;
  }

  // The real game has exactly one portrait box in the bottom panel — it
  // always shows whichever character is currently being created (the
  // selected portrait, the live name-input value, and the pending level),
  // never the accepted roster; there's no row of per-slot boxes at all.
  function drawRosterBox(): void {
    const boxX = ROSTER_BOX.x;
    const boxY = ROSTER_BOX.y;

    ctx.strokeStyle = '#555';
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, ROSTER_BOX.width, ROSTER_PORTRAIT_HEIGHT);

    const sprite = selectedPortrait !== null ? assets.bodySprites?.get(selectedPortrait) : undefined;
    if (sprite) {
      ctx.drawImage(imageDataToCanvas(sprite), boxX, boxY, ROSTER_BOX.width, ROSTER_PORTRAIT_HEIGHT);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(boxX, boxY, ROSTER_BOX.width, ROSTER_PORTRAIT_HEIGHT);
    }

    ctx.fillStyle = '#2c1605';
    ctx.fillRect(ROSTER_BAR.x - 1, ROSTER_BAR.y, ROSTER_BAR.width + 2, ROSTER_BAR.height);
    ctx.fillStyle = '#b05823';
    ctx.fillRect(ROSTER_BAR.x, ROSTER_BAR.y, ROSTER_BAR.width, ROSTER_BAR.height);

    // Level number, bottom-left of the portrait cell — shown as '1' even
    // before a character has been rolled.
    ctx.fillStyle = '#eee';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(String(pendingCharacter?.level ?? 1), boxX + 3, boxY + ROSTER_PORTRAIT_HEIGHT - 11);

    // Name strip: a separate bordered sub-panel below the portrait, not
    // overlaid on it.
    const stripY = boxY + ROSTER_PORTRAIT_HEIGHT + ROSTER_NAME_STRIP_GAP;
    const stripHeight = ROSTER_BOX.height - ROSTER_PORTRAIT_HEIGHT - ROSTER_NAME_STRIP_GAP;
    ctx.fillStyle = '#322d26';
    ctx.fillRect(boxX, stripY, ROSTER_BOX.width, stripHeight);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(boxX + 0.5, stripY + 0.5, ROSTER_BOX.width, stripHeight);
    ctx.fillStyle = '#ccc';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(nameInput.value.slice(0, 10), boxX + ROSTER_BOX.width / 2, stripY + 2);
    ctx.textAlign = 'left';
  }

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The arch is always the background here — the reference always shows
    // the character standing inside it. putImageData() can't be used for
    // the body sprite on top: it overwrites pixels wholesale rather than
    // alpha-compositing, so its colorkey-punched transparent surround would
    // blot out the arch instead of revealing it. drawImage() (via the same
    // canvas cache the roster thumbnail uses) composites correctly.
    if (assets.arch) ctx.putImageData(assets.arch, ARCH.x, ARCH.y);
    else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(ARCH.x, ARCH.y, ARCH.width, ARCH.height);
    }

    const bodySprite = selectedPortrait !== null ? assets.bodySprites?.get(selectedPortrait) : undefined;
    if (bodySprite) {
      ctx.drawImage(imageDataToCanvas(bodySprite), 70, 328 - bodySprite.height);
    }

    if (mode === 'select') drawSelectPage();
    else if (pendingCharacter) drawReviewPage(pendingCharacter);

    drawTopbar();

    ctx.fillStyle = '#111';
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height);
    // The reference renders this whole strip as carved-stone panel art (a
    // chain-and-skull column left of the portrait box, rope/carving around
    // it, a separate frame around "Vše znovu") — there's no asset hook for
    // that yet in CharacterCreationAssets, so it stays a flat fill.
    drawRosterBox();

    if (statusText) {
      ctx.fillStyle = '#ff8080';
      ctx.font = '12px monospace';
      ctx.fillText(statusText, ROSTER_BOX.x + ROSTER_BOX.width + 10, PANEL.y + PANEL.height - 14);
    }

    // Přijmout only reads gold once the select-mode inputs it acts on are
    // complete (name + portrait) — not simply while mode === 'review'
    // (that mode is the one reference screenshot where it isn't gold).
    const canAccept = mode === 'select' && selectedPortrait !== null && validateCharacterName(nameInput.value);
    const canStart = mode === 'select' && isPartyReady(roster);
    // The real trigger for Vymazat going gold couldn't be determined from
    // the available screenshots (the only review-mode reference shows it
    // plain/dark), so it's never highlighted rather than reusing the
    // disproven mode === 'review' condition.
    const canErase = false;
    drawButton(BUTTONS.accept, canAccept);
    drawButton(BUTTONS.start, canStart);
    drawButton(BUTTONS.erase, canErase);
    drawButton(BUTTONS.resetAll, true);

    // The reference keeps the typed name visible in the topbar on the
    // review/stat-sheet page too (e.g. "Sir Rogen_") — it's never hidden.
    positionNameInput();
  }

  function selectPortraitAtSlot(slot: number): void {
    if (mode !== 'select') return;
    const portrait = PORTRAIT_DISPLAY_ORDER[slot];
    if (portrait === undefined) return;
    if (usedPortraitSet().has(portrait) && portrait !== selectedPortrait) return;
    selectedPortrait = portrait;
    statusText = '';
    draw();
  }

  function rollPendingCharacter(): void {
    if (selectedPortrait === null) {
      statusText = 'Pick a portrait first.';
      draw();
      return;
    }
    if (!validateCharacterName(nameInput.value)) {
      statusText = 'Name is required.';
      draw();
      return;
    }
    if (firstEmptySlot(roster) === -1) {
      statusText = 'Party is full.';
      draw();
      return;
    }
    pendingCharacter = createCharacter(nameInput.value.trim(), selectedPortrait, currentRanges());
    mode = 'review';
    statusText = '';
    draw();
  }

  function acceptPendingCharacter(): void {
    if (!pendingCharacter) return;
    const slot = firstEmptySlot(roster);
    if (slot === -1) {
      statusText = 'Party is full.';
      draw();
      return;
    }
    roster = withMember(roster, slot, { ...pendingCharacter, name: nameInput.value.trim() || pendingCharacter.name });
    pendingCharacter = null;
    selectedPortrait = null;
    angleDeg = DEFAULT_ANGLE;
    radius = DEFAULT_RADIUS;
    nameInput.value = '';
    mode = 'select';
    statusText = '';
    draw();
  }

  function eraseCurrent(): void {
    if (mode !== 'review') return;
    pendingCharacter = null;
    selectedPortrait = null;
    mode = 'select';
    draw();
  }

  function resetAll(): void {
    if (!window.confirm('Reset the whole party and start over?')) return;
    roster = createEmptyRoster();
    pendingCharacter = null;
    selectedPortrait = null;
    angleDeg = DEFAULT_ANGLE;
    radius = DEFAULT_RADIUS;
    mode = 'select';
    nameInput.value = '';
    statusText = '';
    draw();
  }

  function startGame(): void {
    if (!isPartyReady(roster)) {
      statusText = 'Add at least one character first.';
      draw();
      return;
    }
    const members = roster.filter((m): m is Character => m !== null);
    dispose();
    resolveResult(members);
  }

  function cancel(): void {
    if (!window.confirm('Cancel character creation?')) return;
    dispose();
    resolveResult(null);
  }

  function onMouseDown(e: MouseEvent): void {
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);

    if (mode === 'review' && pendingCharacter) {
      const rects = bonusButtonRects(pendingCharacter);
      for (const [stat, rect] of Object.entries(rects) as [PrimaryStat, { x: number; y: number; width: number; height: number }][]) {
        if (rectContains(rect, x, y)) {
          pendingCharacter = spendBonusPoint(pendingCharacter, stat);
          draw();
          return;
        }
      }
    }

    if (mode === 'select') {
      if (rectContains(WHEEL_RECT, x, y)) {
        dragging = true;
        updateWheelFromPoint(x, y);
        return;
      }
      if (y >= FACE_GRID.y && y < FACE_GRID.y + FACE_GRID.height && x >= FACE_GRID.x) {
        const slot = Math.floor((x - FACE_GRID.x) / FACE_GRID.step);
        const withinCol = (x - FACE_GRID.x) % FACE_GRID.step;
        if (withinCol <= FACE_GRID.hitWidth) selectPortraitAtSlot(slot);
        return;
      }
    }

    if (rectContains(BUTTONS.accept, x, y)) {
      if (mode === 'select') rollPendingCharacter();
      else acceptPendingCharacter();
    } else if (rectContains(BUTTONS.start, x, y)) startGame();
    else if (rectContains(BUTTONS.erase, x, y)) eraseCurrent();
    else if (rectContains(BUTTONS.resetAll, x, y)) resetAll();
  }

  function updateWheelFromPoint(x: number, y: number): void {
    const { angleDeg: a, radius: r } = angleAndRadiusFromOffset(x - PEARL_CENTER.x, y - PEARL_CENTER.y);
    angleDeg = a;
    radius = r;
    draw();
  }

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const { x, y } = clientToCanvasPoint(canvas, e.clientX, e.clientY);
    updateWheelFromPoint(x, y);
  }

  function onMouseUp(): void {
    dragging = false;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.code === 'Escape') cancel();
  }

  function onWindowResize(): void {
    positionNameInput();
  }

  function dispose(): void {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', onWindowResize);
    nameInput.remove();
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onWindowResize);
  nameInput.addEventListener('input', () => draw());
  draw();

  return { result, dispose };
}
