import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawCityCar, drawServiceVehicle } from '../game/rendering/trafficSprites';
import { WorkerActors3D } from '../game/rendering3d/workers3d';
import { home, newCampaign, buildAndStaff, tweak } from './helpers';

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

describe('3D production workers', () => {
  it('does not invent workers for an unstaffed province and disposes cleanly', () => {
    const scene = new WorkerActors3D();
    const p = home(newCampaign(42));
    scene.update(p, 'spring', null, 0.1, false);
    expect(scene.count).toBe(0);
    scene.dispose();
  });

  it('creates visible field workers for a staffed working farm', () => {
    const s = buildAndStaff(tweak(newCampaign(42), d => {
      home(d).stocks.wood += 100000;
      home(d).stocks.stone += 100000;
      home(d).stocks.tools += 100000;
    }), 'farm', 2).state;
    const scene = new WorkerActors3D();
    scene.update(home(s), 'spring', null, 0.15, false);
    expect(scene.count).toBeGreaterThan(0);
    const first = scene.group.children[0];
    expect(first).toBeDefined();
    expect(first?.getObjectByName('tool')).toBeDefined();
    scene.update(home(s), 'spring', null, 1, false);
    expect(scene.count).toBeGreaterThan(0);
    scene.dispose();
  });
});