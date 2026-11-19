import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawCityCar, drawServiceVehicle } from '../game/rendering/trafficSprites';

describe('2D vehicle model diversity', () => {
  it('draws five distinct passenger vehicle silhouettes for all four headings', () => {
    const instructionCounts: number[] = [];
    for (const variant of [0, 1, 2, 3, 4]) {
      const g = new Graphics();
      drawCityCar(g, 0x6296bb, variant % 2 === 0, 1, 0, variant);
      instructionCounts.push(g.context.instructions.length);
      expect(g.context.instructions.length).toBeGreaterThan(20);
      g.destroy();
    }
    expect(new Set(instructionCounts).size).toBeGreaterThan(2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const g = new Graphics();
      drawCityCar(g, 0xb74f3d, false, dx, dy, 4);
      expect(g.context.instructions.length).toBeGreaterThan(20);
      g.destroy();
    }
  });

  it('uses distinctive ambulance, police and delivery truck details', () => {
    for (const vehicle of ['ambulance', 'patrol', 'delivery'] as const) {
      const g = new Graphics();
      drawServiceVehicle(g, vehicle, -1, 0);
      expect(g.context.instructions.length).toBeGreaterThan(23);
      g.destroy();
    }
  });
});
