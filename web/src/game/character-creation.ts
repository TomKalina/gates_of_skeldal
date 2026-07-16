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
// Matches chargen.c's edit_name(): add_task(16384, type_text_v2,
// postavy[cur_edited].jmeno, 120, 2, 104, ...) — the name field sits inline
// in the topbar, right after the baked-in "JMÉNO HRDINY" label.
const NAME_INPUT_RECT = { x: 120, y: 2, width: 104, height: 13 };

const BUTTON_WIDTH = 130;
const BUTTON_HEIGHT = 22;
const BUTTONS_X = 496;
// Labels and stacked order match the real b_texty[0..3] captured from a
// reference screenshot of the original build.
const BUTTONS = {
  accept: { x: BUTTONS_X, y: 380, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Přijmout' },
  start: { x: BUTTONS_X, y: 404, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Start hry' },
  erase: { x: BUTTONS_X, y: 428, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Vymazat' },
  resetAll: { x: BUTTONS_X, y: 452, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Vše znovu' },
} as const;

const ROSTER_SLOT = { x: 8, y: 380, width: 66, height: 96, gap: 4 };

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

// TS counterpart of chargen.c's enter_generator(): pick a portrait, drag the
// "pearl" around the attribute wheel to pick a stat-range archetype, name the
// character, allocate bonus points on a stat-review screen, and repeat until
// the party (up to MAX_PARTY_SIZE) is ready. Rebuilt against reference
// screenshots of the real game — see docs/port-graph.md for exactly what's
// still simplified (no per-pixel button masks, native <input>/confirm()
// instead of the real GUI toolkit, no equipment/food/water/resistance
// fields since there's no inventory or game-clock system yet).
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

  function drawButton(rect: { x: number; y: number; width: number; height: number; label: string }, enabled: boolean): void {
    ctx.strokeStyle = enabled ? '#ffe38c' : '#555';
    ctx.fillStyle = enabled ? '#8899aa' : '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
    ctx.font = '12px monospace';
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
    ctx.fillStyle = '#ccc';
    ctx.textBaseline = 'top';
    // x positions match zobraz_staty() in chargen.c exactly — the topbar art
    // reserves the region left of x=230 for the "JMÉNO HRDINY" label + name.
    if (mode === 'select') {
      const ranges = currentRanges();
      ctx.fillText(`STR ${ranges.strengthLow}-${ranges.strengthHigh}`, 230, 2);
      ctx.fillText(`MAG ${ranges.magicLow}-${ranges.magicHigh}`, 330, 2);
      ctx.fillText(`SPD ${ranges.speedLow}-${ranges.speedHigh}`, 430, 2);
      ctx.fillText(`DEX ${ranges.dexterityLow}-${ranges.dexterityHigh}`, 530, 2);
    } else if (pendingCharacter) {
      const s = pendingCharacter.stats;
      ctx.fillText(`STR ${s.strength}`, 230, 2);
      ctx.fillText(`MAG ${s.magic}`, 330, 2);
      ctx.fillText(`SPD ${s.speed}`, 430, 2);
      ctx.fillText(`DEX ${s.dexterity}`, 530, 2);
    }
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
    if (selectedPortrait !== null) {
      const slot = PORTRAIT_DISPLAY_ORDER.indexOf(selectedPortrait as (typeof PORTRAIT_DISPLAY_ORDER)[number]);
      if (slot !== -1) {
        ctx.strokeStyle = '#ffe38c';
        ctx.lineWidth = 2;
        ctx.strokeRect(FACE_GRID.x + slot * FACE_GRID.step, FACE_GRID.y, FACE_GRID.hitWidth, FACE_GRID.height);
      }
    }

    const pearlOffset = pearlOffsetFromAngle(angleDeg, radius);
    const pearlX = PEARL_CENTER.x + pearlOffset.dx;
    const pearlY = PEARL_CENTER.y + pearlOffset.dy;
    if (assets.pearl) {
      ctx.putImageData(assets.pearl, pearlX - Math.floor(assets.pearl.width / 2), pearlY - Math.floor(assets.pearl.height / 2));
    } else {
      ctx.fillStyle = '#ffe38c';
      ctx.beginPath();
      ctx.arc(pearlX, pearlY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const LEFT_X = DESK.x + 24;
  const RIGHT_X = DESK.x + 190;
  const LINE_HEIGHT = 15;
  const BONUS_BUTTON_SIZE = 14;

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

  function computeRightRows(): StatRow[] {
    let y = DESK.y + 34 + LINE_HEIGHT * 3.5;
    return [
      { x: RIGHT_X, y, label: 'Útok', value: '1-2' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Obrana', value: '1-2' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Akce', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT * 1.5), label: 'Oheň', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Voda', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Země', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Vzduch', value: '0' },
      { x: RIGHT_X, y: (y += LINE_HEIGHT), label: 'Mysl', value: '0' },
    ];
  }

  function bonusButtonRect(row: StatRow): { x: number; y: number; width: number; height: number } {
    return { x: row.x + 100, y: row.y - 1, width: BONUS_BUTTON_SIZE, height: BONUS_BUTTON_SIZE };
  }

  // Stat-review page: a parchment sheet (SVITEK.PCX, same slot as the desk
  // panel) with the rolled character's stats and a [+] next to each of the 4
  // primary stats to spend the bonus-point pool. Attack/defense/actions and
  // all resistances/weapon-bonuses are the fixed values generuj_postavu
  // always sets for a fresh, unequipped level-1 character — not fabricated,
  // just not tracked as per-character state since there's no equipment
  // system yet (#13/#14). Food/water/exp-to-next-level aren't shown at all:
  // they depend on the game-clock/leveling tables this port doesn't have.
  function drawReviewPage(character: Character): void {
    if (assets.svitek) ctx.putImageData(assets.svitek, DESK.x, DESK.y);
    else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(DESK.x, DESK.y, DESK.width, DESK.height);
    }

    const leftRows = computeLeftRows(character);
    const rightRows = computeRightRows();

    ctx.font = '12px monospace';
    ctx.fillStyle = '#2a1e12';
    ctx.textBaseline = 'top';
    for (const row of leftRows) {
      ctx.fillText(`${row.label}: ${row.value}`, row.x, row.y);
      if (row.stat) drawBonusButton(bonusButtonRect(row), character.bonusPoints > 0);
    }
    for (const row of rightRows) {
      ctx.fillText(`${row.label}: ${row.value}`, row.x, row.y);
    }

    let y = (leftRows[leftRows.length - 1]?.y ?? DESK.y + 34) + LINE_HEIGHT * 1.5;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Bonusy zbraní', LEFT_X, y);
    ctx.font = '12px monospace';
    for (const label of ['Meč', 'Sekera', 'Kladivo', 'Hůl', 'Dýka', 'Střelné', 'Speciální']) {
      y += LINE_HEIGHT;
      ctx.fillText(`${label}: 0`, LEFT_X, y);
    }
  }

  function drawBonusButton(rect: { x: number; y: number; width: number; height: number }, enabled: boolean): void {
    ctx.strokeStyle = enabled ? '#8a5a2a' : '#aaa';
    ctx.fillStyle = enabled ? '#e8c98a' : '#ccc';
    ctx.lineWidth = 1;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
    ctx.fillStyle = '#2a1e12';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
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

  function drawRoster(): void {
    roster.forEach((member, i) => {
      const x = ROSTER_SLOT.x + i * (ROSTER_SLOT.width + ROSTER_SLOT.gap);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(x + 0.5, ROSTER_SLOT.y + 0.5, ROSTER_SLOT.width, ROSTER_SLOT.height);
      if (!member) return;
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(x + 4, ROSTER_SLOT.y + 4, ROSTER_SLOT.width - 8, 10);
      ctx.fillStyle = '#ccc';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(member.name.slice(0, 8), x + ROSTER_SLOT.width / 2, ROSTER_SLOT.y + ROSTER_SLOT.height - 14);
      ctx.textAlign = 'left';
    });
  }

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bodySprite = selectedPortrait !== null ? assets.bodySprites?.get(selectedPortrait) : undefined;
    if (bodySprite) {
      ctx.putImageData(bodySprite, 70, 328 - bodySprite.height);
    } else if (assets.arch) {
      ctx.putImageData(assets.arch, ARCH.x, ARCH.y);
    } else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(ARCH.x, ARCH.y, ARCH.width, ARCH.height);
    }

    if (mode === 'select') drawSelectPage();
    else if (pendingCharacter) drawReviewPage(pendingCharacter);

    drawTopbar();

    ctx.fillStyle = '#111';
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height);
    drawRoster();

    if (statusText) {
      ctx.fillStyle = '#ff8080';
      ctx.font = '12px monospace';
      ctx.fillText(statusText, ROSTER_SLOT.x, PANEL.y + PANEL.height - 14);
    }

    const canAccept = mode === 'review';
    const canStart = mode === 'select' && isPartyReady(roster);
    const canErase = mode === 'review';
    drawButton(BUTTONS.accept, canAccept);
    drawButton(BUTTONS.start, canStart);
    drawButton(BUTTONS.erase, canErase);
    drawButton(BUTTONS.resetAll, true);

    nameInput.style.display = mode === 'select' ? '' : 'none';
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
