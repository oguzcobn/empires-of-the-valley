import { describe, expect, it } from 'vitest';
import { buildingDepths, inFront } from '../game/rendering/depthSort';
import { aheadDistance, bodiesOverlap, heldByFollowing, junctionClear } from '../game/rendering/trafficRules';
import type { TrafficAgent } from '../game/rendering/trafficRules';
import { signalAt } from '../game/rendering/trafficLights';

describe('building draw order', () => {
  it('draws a neighbour offset along both axes in front, not behind', () => {
    const police = { id: 'police', x: 10, y: 10, w: 2, h: 2 };
    const flats = { id: 'flats', x: 12, y: 9, w: 2, h: 2 }; // same far-corner sum as the police
    expect(inFront(flats, police)).toBe(true);
    expect(inFront(police, flats)).toBe(false);
    const z = buildingDepths([flats, police]);
    expect(z.get('flats')!).toBeGreaterThan(z.get('police')!);
  });

  it('keeps a small house in front of a big hall behind it', () => {
    const hall = { id: 'hall', x: 0, y: 0, w: 3, h: 3 };
    const house = { id: 'house', x: 1, y: 3, w: 1, h: 1 };
    const z = buildingDepths([house, hall]);
    expect(z.get('house')!).toBeGreaterThan(z.get('hall')!);
  });

  it('ignores pairs that stand side by side on screen', () => {
    expect(inFront({ id: 'a', x: 4, y: 0, w: 2, h: 2 }, { id: 'b', x: 0, y: 4, w: 2, h: 2 })).toBe(false);
  });
});

const car = (id: number, x: number, y: number, hx: number, hy: number, len = 0.42): TrafficAgent => ({ id, x, y, hx, hy, len });

describe('traffic rules', () => {
  it('holds a car behind another in the same lane', () => {
    const a = car(1, 2.5, 3.63, 1, 0), b = car(2, 2.9, 3.63, 1, 0);
    expect(aheadDistance(a, b)).toBeCloseTo(0.4);
    expect(heldByFollowing([a, b]).has(1)).toBe(true);
    expect(heldByFollowing([a, b]).has(2)).toBe(false);
  });

  it('lets oncoming traffic in the other lane pass', () => {
    const a = car(1, 2.5, 3.63, 1, 0), b = car(2, 2.9, 3.37, -1, 0);
    expect(heldByFollowing([a, b]).size).toBe(0);
  });

  it('breaks a nose-to-nose standoff instead of freezing both cars', () => {
    const a = car(1, 5, 5, 1, 0), b = car(2, 5.3, 5, -1, 0);
    const held = heldByFollowing([a, b]);
    expect(held.size).toBe(1);
  });

  it('keeps a crossing car out of an occupied junction', () => {
    const me = car(1, 4.63, 6.2, 0, -1);
    const crossing = car(2, 4.5, 5.6, 1, 0);
    expect(junctionClear(me, [me, crossing], 4, 5)).toBe(false);
    // oncoming traffic may turn across my lane: wait for it; traffic ahead my way is fine
    expect(junctionClear(me, [me, car(3, 4.37, 5.4, 0, 1)], 4, 5)).toBe(false);
    expect(junctionClear(me, [me, car(4, 4.63, 5.4, 0, -1)], 4, 5)).toBe(true);
    expect(junctionClear(me, [me], 4, 5)).toBe(true);
  });

  it('detects bodies that would overlap, not cars in neighbouring lanes', () => {
    expect(bodiesOverlap(car(1, 3, 3, 1, 0), car(2, 3.2, 3.05, 0, 1))).toBe(true);
    expect(bodiesOverlap(car(1, 3, 3.13, 1, 0), car(2, 3, 2.87, -1, 0))).toBe(false);
    expect(bodiesOverlap(car(1, 3, 3, 1, 0), car(2, 3.6, 3, 1, 0))).toBe(false);
  });

  it('never shows green to both axes at once', () => {
    for (let t = 0; t < 20000; t += 50)
      expect(signalAt(t, true) === 'green' && signalAt(t, false) === 'green').toBe(false);
  });
});
