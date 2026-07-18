import { describe, expect, it } from 'vitest';
import { calcPoints, floorCeilBand, MIDDLE_Y, VIEW3D_X, VIEW3D_Z } from './perspective';

describe('calcPoints', () => {
  const geometry = calcPoints();

  it('produces VIEW3D_X+1 lateral columns, each with VIEW3D_Z+1 depth points per edge', () => {
    expect(geometry).toHaveLength(VIEW3D_X + 1);
    for (const column of geometry) {
      expect(column).toHaveLength(2);
      expect(column[0]).toHaveLength(VIEW3D_Z + 1);
      expect(column[1]).toHaveLength(VIEW3D_Z + 1);
    }
  });

  it('seeds lateral column 0 at the source constants and decays y by truncating v -= v/3.33', () => {
    // Hand-computed from the exact same recurrence (v = trunc(v - v/3.33)):
    // 305 -> 213 -> 149 -> 104 -> 72 -> 50.
    const floorY = geometry[0]![0]!.map((p) => p.y);
    expect(floorY).toEqual([305, 213, 149, 104, 72, 50]);
    // -150 -> -104 -> -72 -> -50 -> -34 -> -23 (truncation toward zero).
    const ceilY = geometry[0]![1]!.map((p) => p.y);
    expect(ceilY).toEqual([-150, -104, -72, -50, -34, -23]);
  });

  it('decays x by the same recurrence, seeded per lateral column at 357*(1+2j)', () => {
    // j=0: 357 -> 249 -> 174 -> 121 -> 84 -> 58.
    const x0 = geometry[0]![0]!.map((p) => p.x);
    expect(x0).toEqual([357, 249, 174, 121, 84, 58]);
    // j=1 seed is 357+2*357*1=1071, same ratio thereafter.
    expect(geometry[1]![0]![0]!.x).toBe(1071);
  });

  it('never depends on lateral column for the y sequence (only x seeds differ by column)', () => {
    for (let j = 1; j <= VIEW3D_X; j++) {
      expect(geometry[j]![0]!.map((p) => p.y)).toEqual(geometry[0]![0]!.map((p) => p.y));
      expect(geometry[j]![1]!.map((p) => p.y)).toEqual(geometry[0]![1]!.map((p) => p.y));
    }
  });
});

describe('floorCeilBand', () => {
  const geometry = calcPoints();

  it('the center-column floor band at depth 0 spans from the near-plane seed down toward the horizon', () => {
    const band = floorCeilBand(geometry, 0, 0, 0);
    // rowNear = y(depth0) + MIDDLE_Y = 305 + 112 = 417 (below the real
    // engine's 360-tall viewport — clipped by the caller, same as the
    // source's own `if (y<1) y=1` clamp on the *other* side).
    expect(band.rowNear).toBe(305 + MIDDLE_Y);
    expect(band.rowFar).toBe(213 + MIDDLE_Y);
    // Center column: xl/xr are a symmetric +-357 seed at depth 0 (the
    // near-plane, undecayed fan), reprojected by (y+1)/305 at the near row.
    expect(band.xlNear).toBeCloseTo((-357 * (305 + 1)) / 305 + 320, 6);
    expect(band.xrNear).toBeCloseTo((357 * (305 + 1)) / 305 + 320, 6);
  });

  it('the ceiling band at depth 0 sits above the horizon (negative y, row < MIDDLE_Y)', () => {
    const band = floorCeilBand(geometry, 0, 0, 1);
    expect(band.rowNear).toBe(-150 + MIDDLE_Y);
    expect(band.rowFar).toBe(-104 + MIDDLE_Y);
    expect(band.rowNear).toBeLessThan(MIDDLE_Y);
  });

  it('a left lateral cell mirrors a right one across the center column (MIDDLE_X)', () => {
    const left = floorCeilBand(geometry, 1, -1, 0);
    const right = floorCeilBand(geometry, 1, 1, 0);
    const MIDDLE_X = 320;
    expect(left.xlNear).toBeCloseTo(2 * MIDDLE_X - right.xrNear, 6);
    expect(left.xrNear).toBeCloseTo(2 * MIDDLE_X - right.xlNear, 6);
    expect(left.rowNear).toBe(right.rowNear);
    expect(left.rowFar).toBe(right.rowFar);
  });

  it('bands narrow with depth as the geometry decays toward the horizon', () => {
    const near = floorCeilBand(geometry, 0, 1, 0);
    const far = floorCeilBand(geometry, 4, 1, 0);
    expect(near.xrNear - near.xlNear).toBeGreaterThan(far.xrNear - far.xlNear);
  });
});
