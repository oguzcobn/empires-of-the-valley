import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { BICYCLE, BUS, GARBAGE, ICE_CREAM, PLOUGH, LORRY, MODEL_COUNT, MOTORBIKE, TAXI, drawAirliner, drawHeadlights, drawTrafficVehicle, modelSpeed, trafficModel } from '../game/rendering/vehicles';
import { WALK_FRAMES, drawPedestrian, randomPedLook } from '../game/rendering/pedestrians';
import { isOpen, trafficShare, walkerShare, windowLight } from '../game/rendering/dayRhythm';

const HEADINGS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const rng = (seed: number) => () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  return seed / 0x100000000;
};

describe('street vehicles', () => {
  it('draws every traffic model in every heading with finite, sized bounds', () => {
    for (let model = 0; model < MODEL_COUNT; model++)
      for (const [dx, dy] of HEADINGS) {
        const g = new Graphics();
        drawTrafficVehicle(g, model, 0x345a89, false, dx, dy, 'turkish');
        const b = g.getLocalBounds();
        expect(Number.isFinite(b.width) && b.width > (model === BICYCLE || model === MOTORBIKE ? 8 : 15), `${model} ${dx},${dy}`).toBe(true);
        g.destroy();
      }
  });

  it('makes buses and lorries larger than cars', () => {
    const width = (model: number) => {
      const g = new Graphics();
      drawTrafficVehicle(g, model, 0x345a89, false, 1, 0);
      const w = g.getLocalBounds().width;
      g.destroy();
      return w;
    };
    expect(width(BUS)).toBeGreaterThan(width(0) * 1.3);
    expect(width(LORRY)).toBeGreaterThan(width(0) * 1.1);
  });

  it('draws airliners along both runway axes, with lights at night', () => {
    for (const [dx, dy] of HEADINGS) {
      const day = new Graphics(), night = new Graphics();
      drawAirliner(day, dx, dy, 0xc8102e, false);
      drawAirliner(night, dx, dy, 0xc8102e, true);
      const b = day.getLocalBounds();
      // a plane is about 1.7 tiles long: wider than any bus on screen, never a thin sliver
      expect(b.width, `${dx},${dy}`).toBeGreaterThan(55);
      expect(b.height, `${dx},${dy}`).toBeLessThan(b.width);
      expect(night.context.instructions.length).toBeGreaterThan(day.context.instructions.length);
      day.destroy();
      night.destroy();
    }
  });

  it('casts headlight beams ahead of the vehicle', () => {
    const g = new Graphics();
    drawHeadlights(g, 1, 0);
    const b = g.getLocalBounds();
    expect(b.x).toBeGreaterThan(0);
    drawHeadlights(g, -1, 0);
    expect(g.getLocalBounds().x).toBeLessThan(0);
  });

  it('sends the refuse round in the morning and the ice-cream van on summer afternoons', () => {
    const morning = Array.from({ length: 12 }, (_, n) => trafficModel(n, 1, 30, 7, 'summer'));
    expect(morning).toContain(GARBAGE);
    expect(morning).not.toContain(ICE_CREAM);
    const afternoon = Array.from({ length: 12 }, (_, n) => trafficModel(n, 1, 30, 15, 'summer'));
    expect(afternoon).toContain(ICE_CREAM);
    expect(Array.from({ length: 12 }, (_, n) => trafficModel(n, 1, 30, 15, 'winter'))).not.toContain(ICE_CREAM);
    expect(afternoon).toContain(MOTORBIKE);
    expect(Array.from({ length: 6 }, (_, n) => trafficModel(n, 1, 30, 7, 'winter', true))).toContain(PLOUGH);
    expect(morning).not.toContain(PLOUGH);
    expect(modelSpeed(BICYCLE)).toBeLessThan(modelSpeed(0));
    expect(modelSpeed(MOTORBIKE)).toBeGreaterThan(modelSpeed(0));
  });

  it('mixes taxis, buses and lorries into ordinary traffic', () => {
    const models = Array.from({ length: 40 }, (_, n) => trafficModel(n, 3, 30));
    for (const m of [TAXI, BUS, LORRY]) expect(models).toContain(m);
    expect(models.filter((m) => m < 6).length).toBeGreaterThan(models.length * 0.4);
    expect(Array.from({ length: 40 }, (_, n) => trafficModel(n, 3, 6))).not.toContain(BUS);
  });
});

describe('townsfolk', () => {
  it('varies body types, clothes and accessories', () => {
    const r = rng(11);
    const looks = Array.from({ length: 120 }, () => randomPedLook(r));
    for (const kind of ['man', 'woman', 'child', 'elder'] as const) expect(looks.some((l) => l.kind === kind)).toBe(true);
    expect(new Set(looks.map((l) => l.top)).size).toBeGreaterThan(6);
    expect(new Set(looks.map((l) => l.extra)).size).toBeGreaterThan(5);
    const rainy = Array.from({ length: 60 }, () => randomPedLook(r, true));
    expect(rainy.filter((l) => l.extra === 'umbrella').length).toBeGreaterThan(25);
  });

  it('animates a stride and turns to face the walking direction', () => {
    const look = randomPedLook(rng(4));
    const shapes = new Set<string>();
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      const g = new Graphics();
      drawPedestrian(g, look, frame, 1, 0);
      const b = g.getLocalBounds();
      expect(b.height).toBeGreaterThan(10);
      shapes.add(`${b.x.toFixed(1)},${b.width.toFixed(1)},${g.context.instructions.length}`);
      g.destroy();
    }
    expect(shapes.size).toBeGreaterThan(1);
    const right = new Graphics(), left = new Graphics();
    const walker = { ...look, extra: 'dog' as const };
    drawPedestrian(right, walker, 2, 1, 0);
    drawPedestrian(left, walker, 2, -1, 0);
    expect(right.getLocalBounds().x).not.toBeCloseTo(left.getLocalBounds().x, 1);
  });
});

describe('day rhythm', () => {
  it('peaks at rush hours and quiets at night', () => {
    expect(trafficShare(8)).toBe(1);
    expect(trafficShare(18)).toBe(1);
    expect(trafficShare(3)).toBeLessThan(0.2);
    expect(walkerShare(12)).toBeGreaterThan(walkerShare(2));
    expect(isOpen('club', 23)).toBe(true);
    expect(isOpen('club', 14)).toBe(false);
    expect(isOpen('market', 10)).toBe(true);
  });
});

describe('night windows', () => {
  it('keeps services lit, closes shops at night and staggers homes', () => {
    expect(windowLight('hospital', 3, 1)).toBe(1);
    expect(windowLight('market', 2, 1)).toBeLessThan(0.2);
    expect(windowLight('market', 12, 1)).toBe(1);
    expect(windowLight('hut', 3, 1)).toBeLessThan(0.4);
    expect(windowLight('hut', 21, 1)).toBe(1);
    const at18 = [0, 1, 2].map((seed) => windowLight('apartment', 18, seed));
    expect(new Set(at18).size).toBeGreaterThan(1);
  });
});
