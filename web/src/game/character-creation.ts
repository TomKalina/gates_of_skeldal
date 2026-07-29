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
  partySize,
  validateCharacterName,
  withMember,
  type Character,
  type PartyRoster,
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
const NAME_INPUT_RECT = { x: 20, y: 388, width: 220, height: 22 };
const BUTTON_WIDTH = 130;
const BUTTON_HEIGHT = 26;
const BUTTONS = {
  add: { x: 490, y: 385, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Add to Party' },
  finish: { x: 490, y: 418, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Finish' },
  cancel: { x: 490, y: 451, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'Cancel' },
} as const;
const DEFAULT_ANGLE = 315;
const DEFAULT_RADIUS = 0;

export interface CharacterCreationAssets {
  topbar?: ImageData;
  deskPanel?: ImageData;
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
// character, and repeat until the party (up to MAX_PARTY_SIZE) is ready.
// Simplified in several ways from the original — see docs/port-graph.md:
// merges the original's two pages (portrait+wheel, then a full parchment
// character sheet) into one screen, uses a native <input> for the name and
// window.confirm for the cancel prompt instead of the real GUI toolkit and
// per-pixel button masks (both pending #8/#9), and skips equipment-derived
// stat recalculation and the hunger/thirst/mana-battery fields (#13/#14).
export function runCharacterCreation(ctx: CanvasRenderingContext2D, assets: CharacterCreationAssets = {}): CharacterCreationHandle {
  const canvas = ctx.canvas;
  const root = canvas.parentElement;
  if (!root) throw new Error('canvas must be attached to a parent element');

  let roster: PartyRoster = createEmptyRoster();
  let selectedPortrait: number | null = null;
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
  nameInput.placeholder = 'Character name';
  nameInput.maxLength = 20;
  nameInput.style.position = 'absolute';
  nameInput.style.font = '14px monospace';
  root.appendChild(nameInput);

  function currentRanges(): AttributeRanges {
    return computeAttributeRanges(angleDeg, radius);
  }

  function usedPortraitSet(): ReadonlySet<number> {
    const used = new Set<number>();
    for (const member of roster) if (member) used.add(member.portraitIndex);
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
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.textAlign = 'left';
  }

  function draw(): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (assets.deskPanel) ctx.putImageData(assets.deskPanel, DESK.x, DESK.y);
    else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(DESK.x, DESK.y, DESK.width, DESK.height);
    }

    const bodySprite = selectedPortrait !== null ? assets.bodySprites?.get(selectedPortrait) : undefined;
    if (bodySprite) {
      ctx.putImageData(bodySprite, 70, 328 - bodySprite.height);
    } else if (assets.arch) {
      ctx.putImageData(assets.arch, ARCH.x, ARCH.y);
    } else {
      ctx.strokeStyle = '#665';
      ctx.strokeRect(ARCH.x, ARCH.y, ARCH.width, ARCH.height);
    }

    const used = usedPortraitSet();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    PORTRAIT_DISPLAY_ORDER.forEach((portrait, slot) => {
      if (used.has(portrait)) {
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

    if (assets.topbar) ctx.putImageData(assets.topbar, 0, 0);
    else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, 16);
    }
    const ranges = currentRanges();
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ccc';
    ctx.textBaseline = 'top';
    // x positions match zobraz_staty() in chargen.c exactly — the topbar art
    // reserves the region left of x=230 for a baked-in "hero name" label.
    ctx.fillText(`STR ${ranges.strengthLow}-${ranges.strengthHigh}`, 230, 2);
    ctx.fillText(`MAG ${ranges.magicLow}-${ranges.magicHigh}`, 330, 2);
    ctx.fillText(`SPD ${ranges.speedLow}-${ranges.speedHigh}`, 430, 2);
    ctx.fillText(`DEX ${ranges.dexterityLow}-${ranges.dexterityHigh}`, 530, 2);

    ctx.fillStyle = '#111';
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.width, PANEL.height);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#ccc';
    ctx.fillText('Name:', NAME_INPUT_RECT.x, NAME_INPUT_RECT.y - 14);

    const names = roster.filter((m): m is Character => m !== null).map((m) => m.name);
    ctx.fillText(`Party (${partySize(roster)}/6): ${names.join(', ') || '(empty)'}`, 20, 460);
    if (statusText) {
      ctx.fillStyle = '#ff8080';
      ctx.fillText(statusText, 20, 476);
    }

    const canAdd = selectedPortrait !== null && validateCharacterName(nameInput.value) && firstEmptySlot(roster) !== -1;
    drawButton(BUTTONS.add, canAdd);
    drawButton(BUTTONS.finish, isPartyReady(roster));
    drawButton(BUTTONS.cancel, true);

    positionNameInput();
  }

  function selectPortraitAtSlot(slot: number): void {
    const portrait = PORTRAIT_DISPLAY_ORDER[slot];
    if (portrait === undefined) return;
    if (usedPortraitSet().has(portrait)) return;
    selectedPortrait = portrait;
    statusText = '';
    draw();
  }

  function addToParty(): void {
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
    const slot = firstEmptySlot(roster);
    if (slot === -1) {
      statusText = 'Party is full.';
      draw();
      return;
    }
    const character = createCharacter(nameInput.value.trim(), selectedPortrait, currentRanges());
    roster = withMember(roster, slot, character);
    selectedPortrait = null;
    angleDeg = DEFAULT_ANGLE;
    radius = DEFAULT_RADIUS;
    nameInput.value = '';
    statusText = '';
    draw();
  }

  function finish(): void {
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
    if (rectContains(BUTTONS.add, x, y)) addToParty();
    else if (rectContains(BUTTONS.finish, x, y)) finish();
    else if (rectContains(BUTTONS.cancel, x, y)) cancel();
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
