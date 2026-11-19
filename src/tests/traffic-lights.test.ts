import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { CYCLE, TrafficLights, signalAt } from '../game/rendering/trafficLights';
import { home, newCampaign, tweak } from './helpers';

describe('traffic lights', () => {
  it('never shows green to both axes and cycles through every colour', () => {
    const seen = new Set<string>();
    for (let t = 0; t < CYCLE * 2; t += 50) {
      const a = signalAt(t, true), b = signalAt(t, false);
      expect(a === 'green' && b === 'green').toBe(false);
      expect(a !== 'red' && b !== 'red').toBe(false);
      seen.add(a);
    }
    expect([...seen].sort()).toEqual(['green', 'red', 'yellow']);
  });

  it('signals paved tees and crossroads only, and holds traffic on red', () => {
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      for (const t of p.tiles) Object.assign(t, { road: false, paved: false, height: 0, terrain: 'grass', buildingId: null });
      const pave = (x: number, y: number) => Object.assign(p.tiles[y * p.width + x]!, { road: true, paved: true, roadType: 'dirt' });
      for (let x = 2; x <= 8; x++) pave(x, 5); // street
      for (let y = 3; y <= 7; y++) pave(5, y); // crossing street
    });
    const p = home(s);
    const lights = new TrafficLights(new Container());
    lights.sync(p);
    expect(lights.count).toBe(1);
    let held = 0, passed = 0;
    for (let t = 0; t < CYCLE; t += 100) {
      if (lights.mayEnter(p, 5, 5, 1, 0, t)) passed++;
      else held++;
    }
    expect(held).toBeGreaterThan(0);
    expect(passed).toBeGreaterThan(0);
    expect(lights.mayEnter(p, 3, 5, 1, 0, 0)).toBe(true);
    lights.destroy();
  });
});

import { furnitureSpots } from '../game/rendering/streetFurniture';

describe('street furniture', () => {
  it('lines straight streets with trees and an occasional bus shelter, never on buildings', () => {
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      for (const t of p.tiles) Object.assign(t, { road: false, paved: false, height: 0, terrain: 'grass', buildingId: null });
      for (let x = 1; x < 30; x++) Object.assign(p.tiles[8 * p.width + x]!, { road: true, paved: true, roadType: 'dirt' });
      p.tiles[9 * p.width + 10]!.buildingId = 'some-house';
    });
    const p = home(s);
    const spots = furnitureSpots(p);
    expect(spots.some((sp) => sp.kind === 'tree')).toBe(true);
    expect(spots.some((sp) => sp.kind === 'shelter')).toBe(true);
    expect(spots.some((sp) => sp.x === 10 && sp.ny === 1)).toBe(false);
    expect(furnitureSpots(p)).toEqual(spots);
    const lamps = spots.filter((sp) => sp.kind === 'lamp');
    expect(lamps.length).toBeGreaterThan(5);
    expect(lamps.every((sp) => sp.x % 3 === 0)).toBe(true);
  });
});
