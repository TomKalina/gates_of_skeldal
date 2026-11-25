import { describe, expect, it } from 'vitest';
import {
  angleAndRadiusFromOffset,
  computeAttributeRanges,
  pearlOffsetFromAngle,
  WHEEL_MAX_RADIUS,
} from './attribute-wheel';

describe('computeAttributeRanges', () => {
  it('at max radius and angle 0, matches the first corner archetype exactly', () => {
    expect(computeAttributeRanges(0, WHEEL_MAX_RADIUS)).toEqual({
      strengthLow: 17,
      strengthHigh: 22,
      magicLow: 5,
      magicHigh: 10,
      speedLow: 17,
      speedHigh: 22,
      dexterityLow: 9,
      dexterityHigh: 14,
      hpRegen: 3,
      mpRegen: 2,
      staminaRegen: 3,
    });
  });

  it('at max radius and angle 45, matches the second corner archetype exactly', () => {
    expect(computeAttributeRanges(45, WHEEL_MAX_RADIUS)).toEqual({
      strengthLow: 13,
      strengthHigh: 18,
      magicLow: 10,
      magicHigh: 15,
      speedLow: 20,
      speedHigh: 25,
      dexterityLow: 5,
      dexterityHigh: 10,
      hpRegen: 3,
      mpRegen: 3,
      staminaRegen: 2,
    });
  });

  it('at radius 0, matches the balanced center archetype regardless of angle', () => {
    const center = {
      strengthLow: 12,
      strengthHigh: 17,
      magicLow: 12,
      magicHigh: 17,
      speedLow: 12,
      speedHigh: 17,
      dexterityLow: 12,
      dexterityHigh: 17,
      hpRegen: 2,
      mpRegen: 2,
      staminaRegen: 2,
    };
    expect(computeAttributeRanges(0, 0)).toEqual(center);
    expect(computeAttributeRanges(200, 0)).toEqual(center);
  });

  it('normalizes out-of-range angles', () => {
    expect(computeAttributeRanges(360, WHEEL_MAX_RADIUS)).toEqual(computeAttributeRanges(0, WHEEL_MAX_RADIUS));
    expect(computeAttributeRanges(-45, WHEEL_MAX_RADIUS)).toEqual(computeAttributeRanges(315, WHEEL_MAX_RADIUS));
  });

  it('clamps radius above the maximum', () => {
    expect(computeAttributeRanges(0, 1000)).toEqual(computeAttributeRanges(0, WHEEL_MAX_RADIUS));
  });
});

describe('pearl offset <-> angle/radius', () => {
  it('round-trips through a clean 90 degree case', () => {
    const offset = pearlOffsetFromAngle(90, 50);
    expect(offset).toEqual({ dx: 0, dy: -50 });
    expect(angleAndRadiusFromOffset(offset.dx, offset.dy)).toEqual({ angleDeg: 90, radius: 50 });
  });

  it('clamps radius from an offset beyond the max', () => {
    const { radius } = angleAndRadiusFromOffset(1000, 0);
    expect(radius).toBe(WHEEL_MAX_RADIUS);
  });
});
