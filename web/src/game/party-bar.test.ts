import { describe, expect, it } from 'vitest';
import { faceFrameForLives } from './party-bar';

describe('faceFrameForLives', () => {
  it('follows bott_draw_normal: full health is frame 0, then 4 bands down to frame 3', () => {
    expect(faceFrameForLives(40, 40)).toBe(0);
    expect(faceFrameForLives(39, 40)).toBe(0);
    expect(faceFrameForLives(30, 40)).toBe(1);
    expect(faceFrameForLives(20, 40)).toBe(2);
    expect(faceFrameForLives(1, 40)).toBe(3);
  });
});
