import { describe, expect, it } from 'vitest';
import { findPath, mobExitCount, mobPickExit, SD_MONST_IMPS, type MobMap } from './mob-ai';

function grid(w: number, h: number, walls: Set<string> = new Set()): MobMap {
  const n = w * h + 1;
  return {
    sectorCount: n,
    sideFlags: (s, d) => {
      if (s === 0) return SD_MONST_IMPS;
      const x = (s - 1) % w, y = Math.floor((s - 1) / w);
      const nx = x + [0, 1, 0, -1][d]!, ny = y + [-1, 0, 1, 0][d]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || walls.has(`${s}:${d}`)) return SD_MONST_IMPS;
      return 0;
    },
    stepNext: (s, d) => {
      const x = (s - 1) % w, y = Math.floor((s - 1) / w);
      const nx = x + [0, 1, 0, -1][d]!, ny = y + [-1, 0, 1, 0][d]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return 0;
      return ny * w + nx + 1;
    },
    coordFlags: () => 0,
    mobsOnSector: () => 0,
    mobAt: () => null,
  };
}

describe('mob-ai', () => {
  it('counts exits ahead, right and left', () => {
    const m = grid(3, 3);
    expect(mobExitCount(m, 5, 0)).toBe(3);
    expect(mobExitCount(m, 1, 0)).toBe(1);
  });

  it('picks r-th free exit starting from left of dir', () => {
    const m = grid(3, 3);
    expect(mobPickExit(m, 1, 5, 0, 0, 0)).toBe(3);
    expect(mobPickExit(m, 2, 5, 0, 0, 0)).toBe(0);
    expect(mobPickExit(m, 1, 1, 0, 0, 0)).toBe(1);
  });

  it('finds shortest path excluding start', () => {
    const m = grid(3, 3);
    const p = findPath(m, 1, 9, SD_MONST_IMPS, 1);
    expect(p).toHaveLength(4);
    expect(p?.at(-1)).toBe(9);
  });

  it('returns null when goal unreachable', () => {
    const m = grid(2, 1, new Set(['1:1']));
    expect(findPath(m, 1, 2, SD_MONST_IMPS, 1)).toBeNull();
  });
});
