import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { Fireworks } from '../game/rendering/fireworks';
import { drawStyledConstruction } from '../game/rendering/arch/buildings';

describe('fireworks', () => {
  it('launches rockets only while active and lets bursts finish', () => {
    const layer = new Container();
    const fw = new Fireworks(layer);
    for (let t = 0; t < 3000; t += 50) fw.update(false, 0, 0, 50);
    expect(fw.count).toBe(0);
    for (let t = 0; t < 3000; t += 50) fw.update(true, 0, 0, 50);
    expect(fw.count).toBeGreaterThan(1);
    for (let t = 0; t < 4000; t += 50) fw.update(false, 0, 0, 50);
    expect(fw.count).toBe(0);
    fw.destroy();
  });
});

describe('construction sites', () => {
  it('raises a tower crane over large sites only', () => {
    const height = (w: number, h: number) => {
      const g = new Graphics();
      const info = drawStyledConstruction(g, w, h, 0.4, 'turkish', 2, 5);
      g.destroy();
      return info.height;
    };
    expect(height(3, 3)).toBeGreaterThan(height(1, 1) + 5);
    expect(height(2, 2)).toBeGreaterThan(36);
  });
});
