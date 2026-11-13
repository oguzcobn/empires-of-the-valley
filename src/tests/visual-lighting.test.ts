import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { newCtx } from '../game/rendering/arch/kit';
import { advanceVisualHour } from '../game/rendering/visualClock';

describe('visual-only day/night clock', () => {
  it('does not accelerate the sky at simulation speed 4x', () => {
    const start = 6;
    // At 4x the simulation would complete one full day in three seconds.
    // The sky should progress by only six hours in the same real time.
    expect(advanceVisualHour(start, 6, 3000, 4)).toBe(12);
    expect(advanceVisualHour(start, 6, 3000, 1)).toBe(12);
  });

  it('preserves its phase when simulation speed changes, and freezes when paused', () => {
    const duringFast = advanceVisualHour(18, 4, 500, 4);
    expect(duringFast).toBe(19);
    expect(advanceVisualHour(duringFast, 5, 1000, 0)).toBe(19);
    expect(advanceVisualHour(duringFast, 5, 500, 1)).toBe(20);
  });

  it('initializes from the saved game hour and wraps midnight', () => {
    expect(advanceVisualHour(null, 23, 500, 1)).toBe(0);
  });
});

describe('roof-occluded illuminated windows', () => {
  const pane: [number, number][] = [[1, 0], [2, 0], [2, 1], [1, 1]];
  it('paints a bright pane in the building draw order, before later roof polygons', () => {
    const sequence: string[] = [];
    let tag = '';
    const g = {
      poly(points: number[]) {
        tag = points[0] === 1 ? 'window' : 'roof';
        return this;
      },
      fill() {
        sequence.push(tag);
        return this;
      },
    } as unknown as Graphics;
    const ctx = newCtx(g, 0, 123, false, 0, true);
    ctx.lights.push(pane);
    g.poly([10, 2, 12, 2, 11, 0]).fill(0x222222);
    expect(sequence).toEqual(['window', 'roof']);
    expect(ctx.lights).toEqual([pane]);
  });

  it('does not paint a glow for the ordinary daytime drawing pass', () => {
    const sequence: number[][] = [];
    const g = {
      poly(points: number[]) {
        sequence.push(points);
        return this;
      },
      fill() { return this; },
    } as unknown as Graphics;
    newCtx(g, 0, 123, false).lights.push(pane);
    expect(sequence).toHaveLength(0);
  });
});
