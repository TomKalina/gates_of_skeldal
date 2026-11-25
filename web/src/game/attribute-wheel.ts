// Port of chargen.c's attribute wheel: dragging a "pearl" around a circular
// dial picks a character's stat ranges. 8 corner archetypes (rohy[0..7]) sit
// on an octagon; the angle blends between the two adjacent corners, and the
// radius blends from the balanced center archetype (rohy[8]) out to that
// blended edge value. Field order matches struct t_vlasts exactly.
const FIELD_NAMES = [
  'strengthLow',
  'strengthHigh',
  'magicLow',
  'magicHigh',
  'speedLow',
  'speedHigh',
  'dexterityLow',
  'dexterityHigh',
  'hpRegen',
  'mpRegen',
  'staminaRegen',
] as const;

export interface AttributeRanges {
  strengthLow: number;
  strengthHigh: number;
  magicLow: number;
  magicHigh: number;
  speedLow: number;
  speedHigh: number;
  dexterityLow: number;
  dexterityHigh: number;
  hpRegen: number;
  mpRegen: number;
  staminaRegen: number;
}

const CORNERS: readonly (readonly number[])[] = [
  [17, 22, 5, 10, 17, 22, 9, 14, 3, 2, 3],
  [13, 18, 10, 15, 20, 25, 5, 10, 3, 3, 2],
  [9, 14, 15, 20, 17, 22, 9, 14, 3, 3, 2],
  [5, 10, 20, 25, 13, 18, 13, 18, 2, 4, 2],
  [9, 14, 15, 20, 9, 14, 17, 22, 2, 3, 2],
  [13, 18, 10, 15, 5, 10, 20, 25, 2, 2, 4],
  [17, 22, 5, 10, 9, 14, 17, 22, 3, 1, 2],
  [20, 25, 0, 5, 13, 18, 13, 18, 4, 1, 2],
  [12, 17, 12, 17, 12, 17, 12, 17, 2, 2, 2],
];

export const WHEEL_MAX_RADIUS = 75;

// CALC_DIFF / CALC_DIFF2 in chargen.c are the same fixed-point (4 fractional
// bits) linear blend, just with a different divisor — replicated exactly so
// rolled ranges match the original bit for bit.
function fixedPointBlend(low: number, high: number, t: number, divisor: number): number {
  const scaled = ((high - low) << 4) * (t << 4);
  const divided = Math.trunc(scaled / divisor);
  return low + ((divided + 8) >> 4);
}

export function computeAttributeRanges(angleDeg: number, radius: number): AttributeRanges {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const clampedRadius = Math.min(Math.max(radius, 0), WHEEL_MAX_RADIUS);
  const cornerIndex = Math.floor(normalizedAngle / 45);
  const angleRemainder = normalizedAngle - cornerIndex * 45;
  const low = CORNERS[cornerIndex]!;
  const high = CORNERS[(cornerIndex + 1) % 8]!;
  const center = CORNERS[8]!;

  const result = {} as AttributeRanges;
  FIELD_NAMES.forEach((name, i) => {
    const ring = fixedPointBlend(low[i]!, high[i]!, angleRemainder, 45 << 4);
    result[name] = fixedPointBlend(center[i]!, ring, clampedRadius, WHEEL_MAX_RADIUS << 4);
  });
  return result;
}

// vypocet_perly: angle/radius -> pearl offset from the dial center (screen y
// grows downward, so the sine term is subtracted rather than added).
export function pearlOffsetFromAngle(angleDeg: number, radius: number): { dx: number; dy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    dx: Math.round(Math.cos(rad) * radius),
    dy: -Math.round(Math.sin(rad) * radius),
  };
}

// vol_vlastnosti: pointer offset from the dial center -> angle/radius.
export function angleAndRadiusFromOffset(dx: number, dy: number): { angleDeg: number; radius: number } {
  const flippedY = -dy;
  let angleDeg = (Math.atan2(flippedY, dx) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  const radius = Math.min(Math.sqrt(dx * dx + flippedY * flippedY), WHEEL_MAX_RADIUS);
  return { angleDeg, radius };
}
