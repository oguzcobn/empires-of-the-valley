import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../game/core/time';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';
import { executeCommand, planRoadRoute } from '../game/systems/commands';
import { idleWorkers } from '../game/systems/economy';
import { huntRoute, wildlife } from '../game/systems/frontier';
import { tileAt, townCenter, transitOccupies } from '../game/systems/grid';
import { applyTicks } from '../game/systems/tick';
import { expectValid, home, must, newCampaign, tweak } from './helpers';

describe('frontier economy', () => {
  it('reserves workers until they return with food and the wildlife population recovers', () => {
    const state = newCampaign();
    const p = home(state);
    const spot = wildlife(p, state.seed, state.tick).find(({ x, y }) => huntRoute(p, x, y));
    expect(spot).toBeDefined();
    const { x, y } = spot!;
    const sent = must(state, { type: 'hunt', x, y, workers: 2 });
    expect(idleWorkers(home(sent))).toBe(idleWorkers(p) - 2);
    const end = home(sent).hunt!.endTick;
    const recovered = applyTicks(sent, end - sent.tick);
    expect(home(recovered).hunt).toBeUndefined();
    expect(home(recovered).depletedHunts?.[`${x},${y}`]).toBe(end + 5 * TICKS_PER_DAY);
    expect(recovered.eventLog.some((event) => event.key === 'event.huntReturn')).toBe(true);
    expectValid(recovered);
  });

  it('builds separate routes, exports stone, earns fares and saves both services', () => {
    const start = newCampaign(42, 'turkish');
    expect(executeCommand(start, { type: 'buildTransit', kind: 'rail' }).ok).toBe(false);
    const city = tweak(start, (draft) => {
      townCenter(home(draft))!.level = 2;
      draft.researchedTechIds = ['architecture'];
      home(draft).stocks = { ...home(draft).stocks, wood: 280000, stone: 280000, gold: 280000 };
    });
    const rail = must(city, { type: 'buildTransit', kind: 'rail' });
    const both = must(rail, { type: 'buildTransit', kind: 'air' });
    const p = home(both);
    const line = p.transit!.rail!;
    expect(line.route.length).toBeGreaterThan(1);
    for (const { x, y } of line.route) {
      expect(tileAt(p, x, y)?.buildingId).toBeNull();
      expect(transitOccupies(p, x, y)).toBe(true);
    }
    expect(p.transit!.air!.route).toHaveLength(5);
    const configured = must(both, { type: 'setTransitCargo', kind: 'rail', cargo: 'stone' });
    const next = applyTicks(configured, TICKS_PER_DAY);
    expect(home(next).transit!.rail).toMatchObject({ shipped: 12000, earned: 15000, passengers: 0 });
    expect(home(next).transit!.air!.passengers).toBeGreaterThan(0);
    expect(home(next).stocks.stone).toBe(home(configured).stocks.stone - 12000);
    const file = createSaveFile(next);
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    const saved = loadSaveFile(file.file);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(home(saved.state).transit).toEqual(home(next).transit);

    const buying = must(next, { type: 'setTransitCargo', kind: 'rail', cargo: 'stone', direction: 'import' });
    const imported = applyTicks(buying, TICKS_PER_DAY);
    expect(home(imported).stocks.stone).toBe(home(buying).stocks.stone + 12000);
    expect(home(imported).transit!.rail!.spent).toBe(24000);
    expectValid(imported);
  });

  it('routes a street around a blocked intermediate tile', () => {
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      p.tiles[17 * p.width + 10]!.terrain = 'lake';
    });
    const plan = planRoadRoute(s, { x: 11, y: 17 }, { x: 9, y: 17 });
    expect(plan.error).toBeNull();
    expect(plan.tiles).toContainEqual({ x: 9, y: 17, type: 'dirt' });
    expect(plan.tiles.some(({ x, y }) => x === 10 && y === 17)).toBe(false);
  });
});
