import { HUMAN_PLACES, HUMAN_RINGS, MAX_INV, PORTRAIT_DISPLAY_ORDER, type Character, type RolledStats } from '../game/party';

interface Hero {
  name: string;
  female: boolean;
  stats: Partial<RolledStats> & Pick<RolledStats, 'maxHp'>;
  face: FaceStyle;
}

interface FaceStyle {
  background: string;
  skin: string;
  hair: string;
  body: string;
  extra: 'hat' | 'elf' | 'potion' | 'beard' | 'braids';
}

const HEROES: readonly Hero[] = [
  { name: 'Fróďa', female: false, stats: { maxHp: 50, dexterity: 18, strength: 12 }, face: { background: '#2a2420', skin: '#d4a07e', hair: '#3a2a1c', body: '#5a4030', extra: 'hat' } },
  { name: 'J Au Vajz', female: false, stats: { maxHp: 34, dexterity: 16, strength: 11 }, face: { background: '#1f2a22', skin: '#e2c0a0', hair: '#d8c27a', body: '#3f5e36', extra: 'elf' } },
  { name: 'Alrik', female: false, stats: { maxHp: 28, magic: 16, maxMana: 24 }, face: { background: '#2a2030', skin: '#c99572', hair: '#5a3a26', body: '#6b4a2a', extra: 'potion' } },
  { name: 'Lachim', female: false, stats: { maxHp: 46, strength: 17 }, face: { background: '#2a2622', skin: '#c48b66', hair: '#9a4a20', body: '#666670', extra: 'beard' } },
  { name: 'Kall', female: false, stats: { maxHp: 52, strength: 18 }, face: { background: '#2a221e', skin: '#b9805c', hair: '#1c1814', body: '#7a5a3a', extra: 'braids' } },
];

const BASE_STATS: RolledStats = {
  strength: 12,
  magic: 8,
  speed: 12,
  dexterity: 12,
  maxHp: 30,
  maxMana: 0,
  stamina: 20,
  hpRegen: 1,
  mpRegen: 1,
  staminaRegen: 1,
};

export const KRYPTA_PARTY: readonly Character[] = HEROES.map((hero, i) => ({
  name: hero.name,
  portraitIndex: PORTRAIT_DISPLAY_ORDER[i]!,
  female: hero.female,
  stats: { ...BASE_STATS, ...hero.stats },
  level: 9,
  exp: 0,
  bonusPoints: 0,
  wearing: new Array<number>(HUMAN_PLACES).fill(0),
  rings: new Array<number>(HUMAN_RINGS).fill(0),
  arrows: 0,
  invSize: 6,
  inv: new Array<number>(MAX_INV).fill(0),
}));

const DESK_WIDTH = 340;
const DESK_HEIGHT = 60;
const FACE_X = 28;
const FACE_Y = 18;
const FACE_STEP = 40;
const FACE_WIDTH = 27;

function drawFace(c: CanvasRenderingContext2D, ox: number, oy: number, style: FaceStyle): void {
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(ox + x * 1.7, oy + y * 2.3, w * 1.7 + 0.5, h * 2.3 + 0.5);
  };
  px(0, 0, 16, 16, style.background);
  px(5, 4, 6, 7, style.skin);
  px(4, 2, 8, 3, style.hair);
  px(6, 6, 1, 1, '#111');
  px(9, 6, 1, 1, '#111');
  px(3, 12, 10, 4, style.body);
  if (style.extra === 'hat') {
    px(3, 1, 10, 2, '#2c241d');
    px(2, 3, 12, 1, '#2c241d');
    px(7, 9, 3, 1, '#a0624a');
  }
  if (style.extra === 'elf') {
    px(3, 4, 2, 8, style.hair);
    px(11, 4, 2, 8, style.hair);
    px(3, 5, 1, 2, style.skin);
    px(12, 5, 1, 2, style.skin);
  }
  if (style.extra === 'potion') {
    px(13, 10, 2, 3, '#9be06a');
    px(12, 9, 3, 1, '#dddddd');
  }
  if (style.extra === 'beard') {
    px(4, 9, 8, 4, style.hair);
    px(4, 1, 8, 2, '#888892');
  }
  if (style.extra === 'braids') {
    px(3, 2, 2, 9, style.hair);
    px(11, 2, 2, 9, style.hair);
    px(4, 12, 2, 2, '#c8c0b0');
    px(10, 12, 2, 2, '#c8c0b0');
  }
}

export function createPartyDeskPanel(): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = DESK_WIDTH;
  canvas.height = DESK_HEIGHT;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas context unavailable');
  HEROES.forEach((hero, i) => {
    const slot = PORTRAIT_DISPLAY_ORDER.indexOf(KRYPTA_PARTY[i]!.portraitIndex as (typeof PORTRAIT_DISPLAY_ORDER)[number]);
    drawFace(c, FACE_X + slot * FACE_STEP, FACE_Y, hero.face);
  });
  return c.getImageData(0, 0, FACE_WIDTH + FACE_X + FACE_STEP * 7, DESK_HEIGHT);
}
