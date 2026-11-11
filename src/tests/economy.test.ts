import { describe, expect, it } from 'vitest';
import type { GameState } from '../game/core/types';
import { computeFlows, storageCaps } from '../game/systems/economy';
import { applyTick, applyTicks } from '../game/systems/tick';
import { buildAndStaff, days, expectValid, home, must, newCampaign, tweak } from './helpers';

const forestTotal = (s: GameState): number =>
  home(s).tiles.reduce((sum, t) => sum + (t.terrain === 'forest' ? t.deposit : 0), 0);

describe('consumption', () => {
  it('12 citizens eat exactly 3 food per day', () => {
    const s = days(newCampaign(), 1);
    expect(home(s).stocks.food).toBe(90000 - 3000);
    expect(home(s).yesterday.consumed.food).toBe(3000);
  });

  it('stock never goes negative; famine is tracked instead', () => {
    let s = tweak(newCampaign(), (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = 1000));
    s = days(s, 2);
    expect(home(s).stocks.food).toBe(0);
    expect(home(s).population.starvationDays).toBeGreaterThan(0);
    expectValid(s);
  });
});

describe('production', () => {
  it('a staffed lumber camp yields 4 wood/day taken from real forest', () => {
    const { state } = buildAndStaff(newCampaign(), 'lumber_camp', 2);
    // align to a day boundary is already true: construction lasts whole days
    const wood0 = home(state).stocks.wood;
    const forest0 = forestTotal(state);
    const mid = applyTicks(state, 23); // before the nightly regrowth
    expect(home(mid).stocks.wood - wood0).toBe(forest0 - forestTotal(mid));
    const end = applyTick(mid);
    expect(home(end).stocks.wood - wood0).toBe(4000);
    expect(home(end).yesterday.produced.wood).toBe(4000);
  });

  it('an unstaffed building produces nothing', () => {
    const { state } = buildAndStaff(newCampaign(), 'lumber_camp', 0);
    const after = days(state, 2);
    expect(home(after).stocks.wood).toBe(home(state).stocks.wood);
  });

  it('partial staffing scales output', () => {
    const { state } = buildAndStaff(newCampaign(), 'lumber_camp', 1);
    expect(home(days(state, 1)).stocks.wood - home(state).stocks.wood).toBe(2000);
  });

  it('a farm yields 6 food/day in season and nothing in winter', () => {
    const { state } = buildAndStaff(newCampaign(), 'farm', 3);
    const next = days(state, 1);
    expect(home(next).yesterday.produced.food).toBe(6000);
    const winter = tweak(state, (d) => void (d.tick = 95 * 24));
    expect(home(days(winter, 1)).yesterday.produced.food).toBe(0);
  });

  it('a quarry yields 3 stone/day and depletes the deposit', () => {
    const { state } = buildAndStaff(newCampaign(), 'quarry', 2);
    const deposit = (s: GameState): number =>
      home(s).tiles.reduce((sum, t) => sum + (t.terrain === 'stone' ? t.deposit : 0), 0);
    const next = days(state, 1);
    expect(home(next).stocks.stone - home(state).stocks.stone).toBe(3000);
    expect(deposit(state) - deposit(next)).toBe(3000);
  });

  it('stops when the forest in range is exhausted', () => {
    let { state } = buildAndStaff(newCampaign(), 'lumber_camp', 2);
    state = tweak(state, (d) => {
      for (const t of d.provinces[d.homeProvinceId]!.tiles) if (t.terrain === 'forest') t.deposit = 0;
    });
    const wood = home(state).stocks.wood;
    expect(home(applyTicks(state, 23)).stocks.wood).toBe(wood);
  });

  it('worn-out tools halve output; tools are consumed by work', () => {
    const { state } = buildAndStaff(newCampaign(), 'lumber_camp', 2);
    const next = days(state, 1);
    expect(home(state).stocks.tools - home(next).stocks.tools).toBe(60);
    const noTools = tweak(state, (d) => void (d.provinces[d.homeProvinceId]!.stocks.tools = 0));
    expect(home(days(noTools, 1)).yesterday.produced.wood).toBe(2000);
  });

  it('respects storage caps', () => {
    let { state } = buildAndStaff(newCampaign(), 'lumber_camp', 2);
    const cap = storageCaps(state, home(state)).wood;
    state = tweak(state, (d) => void (d.provinces[d.homeProvinceId]!.stocks.wood = cap - 1500));
    const forest0 = forestTotal(state);
    const next = applyTicks(state, 23);
    expect(home(next).stocks.wood).toBe(cap);
    expect(forest0 - forestTotal(next)).toBe(1500); // nothing is harvested that cannot be stored
    expectValid(next);
  });

  it('a granary raises the food cap', () => {
    const s0 = newCampaign();
    const { state } = buildAndStaff(s0, 'granary', 0);
    expect(storageCaps(state, home(state)).food - storageCaps(s0, home(s0)).food).toBe(150000);
  });
});

describe('treasury', () => {
  it('collects town income and taxes, pays upkeep', () => {
    const s = days(newCampaign(), 1);
    // +1 town center, +0.8 tax * 12/20 occupancy = 0.48, -0.1 warehouse upkeep
    expect(home(s).stocks.gold).toBe(40000 + 1000 + 480 - 100);
  });

  it('unpaid buildings stand idle instead of creating debt', () => {
    let { state } = buildAndStaff(newCampaign(), 'lumber_camp', 2);
    state = tweak(state, (d) => {
      const p = d.provinces[d.homeProvinceId]!;
      p.stocks.gold = 0;
      for (const b of p.buildings)
        if (b.definitionId === 'hut' || b.definitionId === 'town_center')
          b.connected = b.definitionId === 'town_center';
    });
    const next = applyTick(state);
    expect(home(next).stocks.gold).toBeGreaterThanOrEqual(0);
    expectValid(next);
  });

  it('expected flows match what the simulation actually does', () => {
    let s = buildAndStaff(newCampaign(), 'lumber_camp', 2).state;
    s = buildAndStaff(s, 'farm', 3).state;
    const flows = computeFlows(s);
    const next = days(s, 1);
    const y = home(next).yesterday;
    expect(y.produced.wood).toBe(flows.wood.sources.reduce((a, l) => a + l.amount, 0));
    expect(y.produced.food).toBe(flows.food.sources.reduce((a, l) => a + l.amount, 0));
    expect(y.consumed.food).toBe(flows.food.consumers.reduce((a, l) => a + l.amount, 0));
    expect(home(next).stocks.gold - home(s).stocks.gold).toBe(flows.gold.net);
  });
});

describe('research', () => {
  it('needs a school, accumulates points and unlocks a real modifier', () => {
    const s0 = newCampaign();
    expect(must.bind(null, s0, { type: 'queueResearch', techId: 'basic_agriculture' })).toThrow();
    let s = tweak(s0, (d) => void (d.provinces[d.homeProvinceId]!.stocks.stone = 200000));
    s = buildAndStaff(s, 'school', 1).state;
    s = buildAndStaff(s, 'farm', 3).state;
    const idle = days(s, 1);
    expect(home(idle).yesterday.produced.research).toBe(2000);
    s = must(s, { type: 'queueResearch', techId: 'basic_agriculture' });
    expect(must.bind(null, s, { type: 'queueResearch', techId: 'basic_agriculture' })).toThrow();
    s = days(s, 15);
    expect(s.researchedTechIds).toContain('basic_agriculture');
    expect(s.researchQueue).toEqual([]);
    s = days(s, 1);
    expect(home(s).yesterday.produced.food).toBe(7500); // +25%
  });

  it('dequeue returns invested points', () => {
    let s = tweak(newCampaign(), (d) => void (d.provinces[d.homeProvinceId]!.stocks.stone = 200000));
    s = buildAndStaff(s, 'school', 1).state;
    s = must(s, { type: 'queueResearch', techId: 'forestry' });
    s = days(s, 3);
    expect(s.researchProgress).toBe(6000);
    s = must(s, { type: 'dequeueResearch', techId: 'forestry' });
    expect(s.researchProgress).toBe(0);
    expect(home(s).stocks.research).toBe(6000);
  });
});
