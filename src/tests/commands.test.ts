import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../game/data/buildings';
import { executeCommand } from '../game/systems/commands';
import { housingCapacity, storageCaps } from '../game/systems/economy';
import { findSite } from '../game/systems/placement';
import { investedCost, levelCost } from '../game/systems/architecture';
import { build, buildAndStaff, days, expectValid, home, must, newCampaign, tweak } from './helpers';

describe('placement', () => {
  it('deducts the exact cost and creates a construction site', () => {
    const s0 = newCampaign();
    const plan = findSite(home(s0), BUILDINGS.lumber_camp)!;
    let s = s0;
    for (const [x, y] of plan.roads) s = must(s, { type: 'placeRoad', x, y });
    const woodBefore = home(s).stocks.wood;
    s = must(s, { type: 'placeBuilding', buildingId: 'lumber_camp', x: plan.x, y: plan.y });
    const cost = levelCost('lumber_camp', 0, s.culture);
    expect(cost.wood).toBeGreaterThan(0);
    expect(home(s).stocks.wood).toBe(woodBefore - cost.wood!);
    expect(home(s).stocks.stone).toBe(70000 - cost.stone!);
    expect(home(s).buildings.at(-1)).toMatchObject({
      definitionId: 'lumber_camp',
      state: 'construction',
      workers: 0,
    });
    expectValid(s);
  });

  it('refuses water, occupied tiles, missing roads and missing resources without mutating', () => {
    const s = newCampaign();
    const p = home(s);
    const water = p.tiles.findIndex((t) => t.terrain === 'water');
    const refuse = (x: number, y: number, key: string, state = s): void => {
      const r = executeCommand(state, { type: 'placeBuilding', buildingId: 'hut', x, y });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.key).toBe(key);
    };
    refuse(water % p.width, Math.floor(water / p.width), 'err.terrain.water');
    refuse(15, 15, 'err.occupied'); // town center
    refuse(12, 17, 'err.onRoad');
    refuse(-1, 3, 'err.outOfBounds');
    refuse(11, 14, 'err.noRoad'); // clear grass, but not touching a road
    const poor = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.wood = 5000));
    refuse(14, 18, 'err.cost', poor);
    const before = JSON.stringify(s);
    executeCommand(s, { type: 'placeBuilding', buildingId: 'hut', x: 15, y: 15 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('requires fertile soil for farms and nearby deposits for extraction', () => {
    const s = newCampaign();
    const farm = executeCommand(s, { type: 'placeBuilding', buildingId: 'farm', x: 14, y: 18 });
    expect(farm.ok === false && farm.error.key).toBe('err.needFertile');
    const camp = executeCommand(s, { type: 'placeBuilding', buildingId: 'lumber_camp', x: 14, y: 18 });
    expect(camp.ok === false && camp.error.key).toBe('err.needForest');
  });

  it('never allows building the town center', () => {
    const r = executeCommand(newCampaign(), {
      type: 'placeBuilding',
      buildingId: 'town_center',
      x: 14,
      y: 18,
    });
    expect(r.ok).toBe(false);
  });
});

describe('roads and connectivity', () => {
  it('roads must extend the network and cost wood', () => {
    const s = newCampaign();
    expect(executeCommand(s, { type: 'placeRoad', x: 11, y: 14 }).ok).toBe(false);
    const next = must(s, { type: 'placeRoad', x: 10, y: 17 });
    expect(home(next).stocks.wood).toBe(160000 - 2000);
  });

  it('cutting the road disconnects buildings and stops their housing', () => {
    let s = newCampaign();
    expect(housingCapacity(home(s))).toBe(20);
    s = must(s, { type: 'removeRoad', x: 14, y: 17 });
    const p = home(s);
    expect(p.buildings.filter((b) => b.definitionId === 'hut' && !b.connected)).toHaveLength(2);
    expect(housingCapacity(p)).toBe(10);
    s = must(s, { type: 'placeRoad', x: 14, y: 17 });
    expect(housingCapacity(home(s))).toBe(20);
    expectValid(s);
  });

  it('a disconnected construction site makes no progress', () => {
    let s = newCampaign();
    s = must(s, { type: 'placeBuilding', buildingId: 'hut', x: 11, y: 18 });
    s = must(s, { type: 'removeRoad', x: 11, y: 17 });
    s = days(s, 5);
    expect(home(s).buildings.at(-1)).toMatchObject({ state: 'construction', progressTicks: 0 });
  });
});

describe('construction lifecycle', () => {
  it('completes after the defined time, not before', () => {
    let s = build(newCampaign(), 'hut').state;
    s = days(s, 1);
    expect(home(s).buildings.at(-1)!.state).toBe('construction');
    s = days(s, 1);
    expect(home(s).buildings.at(-1)!.state).toBe('active');
    expect(housingCapacity(home(s))).toBe(25);
  });

  it('cancel refunds the full cost; demolition refunds half', () => {
    const s0 = newCampaign();
    const placed = build(s0, 'hut');
    const cancelled = must(placed.state, { type: 'cancelConstruction', instanceId: placed.id });
    expect(home(cancelled).stocks).toEqual(home(s0).stocks);
    expect(home(cancelled).buildings).toHaveLength(6);
    expectValid(cancelled);

    const built = days(placed.state, 2);
    const before = home(built).stocks;
    const demolished = must(built, { type: 'demolishBuilding', instanceId: placed.id });
    const invested = investedCost(home(built).buildings.find((b) => b.id === placed.id)!);
    expect(home(demolished).stocks.wood).toBe(before.wood + Math.floor(invested.wood! / 2));
    expect(home(demolished).stocks.stone).toBe(before.stone + Math.floor(invested.stone! / 2));
    expectValid(demolished);
  });

  it('protects the town center and storage that is in use', () => {
    const s = newCampaign();
    const p = home(s);
    const tc = p.buildings.find((b) => b.definitionId === 'town_center')!;
    const wh = p.buildings.find((b) => b.definitionId === 'warehouse')!;
    expect(executeCommand(s, { type: 'demolishBuilding', instanceId: tc.id }).ok).toBe(false);
    const r = executeCommand(s, { type: 'demolishBuilding', instanceId: wh.id });
    expect(r.ok === false && r.error.key).toBe('err.storageInUse');
  });

  it('upgrades respect unlock requirements and cannot be bypassed', () => {
    let s = newCampaign();
    const p = home(s);
    const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
    const tc = p.buildings.find((b) => b.definitionId === 'town_center')!;
    const locked = executeCommand(s, { type: 'upgradeBuilding', instanceId: hut.id });
    expect(locked.ok === false && locked.error.key).toBe('err.needTownCenter');
    const tooSmall = executeCommand(s, { type: 'upgradeBuilding', instanceId: tc.id });
    expect(tooSmall.ok === false && tooSmall.error.key).toBe('err.needPopulation');

    s = tweak(s, (d) => {
      const dp = d.provinces[d.homeProvinceId]!;
      dp.population.adults = 12;
      dp.stocks.wood = 250000;
      dp.stocks.stone = 200000;
    });
    s = must(s, { type: 'upgradeBuilding', instanceId: tc.id });
    expect(executeCommand(s, { type: 'upgradeBuilding', instanceId: tc.id }).ok).toBe(false); // busy
    s = days(s, 6);
    expect(home(s).buildings.find((b) => b.id === tc.id)).toMatchObject({ level: 2, state: 'active' });
    s = must(s, { type: 'upgradeBuilding', instanceId: hut.id });
    s = days(s, 2);
    expect(housingCapacity(home(s))).toBe(23);
    // level 3 needs masonry
    const l3 = executeCommand(s, { type: 'upgradeBuilding', instanceId: hut.id });
    expect(l3.ok === false && l3.error.key).toBe('err.needTech');
    expectValid(s);
  });
});

describe('workers', () => {
  it('assigns exactly the requested workers and never the same person twice', () => {
    let s = newCampaign();
    s = tweak(s, (d) => {
      const p = d.provinces[d.homeProvinceId]!;
      p.stocks.wood = 300000;
      p.stocks.stone = 250000;
    });
    const camp = buildAndStaff(s, 'lumber_camp', 2);
    expect(home(camp.state).buildings.find((b) => b.id === camp.id)!.workers).toBe(2);
    const farm = buildAndStaff(camp.state, 'farm', 3);
    const quarry = buildAndStaff(farm.state, 'quarry', 2);
    const school = buildAndStaff(quarry.state, 'school', 1);
    // 2 + 3 + 2 + 1 = 8 adults: everyone is busy now
    const camp2 = build(school.state, 'lumber_camp');
    const s2 = days(camp2.state, 3);
    const extra = executeCommand(s2, { type: 'assignWorkers', instanceId: camp2.id, workers: 1 });
    if (home(s2).population.adults === 8) {
      expect(extra.ok === false && extra.error.key).toBe('err.noIdleWorkers');
    }
    const over = executeCommand(s2, { type: 'assignWorkers', instanceId: camp.id, workers: 3 });
    expect(over.ok === false && over.error.key).toBe('err.workerSlots');
    // explicit reassignment works
    let s3 = must(s2, { type: 'assignWorkers', instanceId: quarry.id, workers: 0 });
    s3 = must(s3, { type: 'assignWorkers', instanceId: camp2.id, workers: 2 });
    expectValid(s3);
  });

  it('cannot staff a construction site', () => {
    const placed = build(newCampaign(), 'lumber_camp');
    expect(
      executeCommand(placed.state, { type: 'assignWorkers', instanceId: placed.id, workers: 1 }).ok,
    ).toBe(false);
  });
});

describe('trade and tax', () => {
  it('merchant trades conserve value and respect funds and storage', () => {
    const s = newCampaign();
    const bought = must(s, { type: 'trade', offerId: 'buy_tools' });
    expect(home(bought).stocks.gold).toBe(25000);
    expect(home(bought).stocks.tools).toBe(25000);
    const broke = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.gold = 1000));
    expect(executeCommand(broke, { type: 'trade', offerId: 'buy_wood' }).ok).toBe(false);
    const full = tweak(
      s,
      (d) =>
        void (d.provinces[d.homeProvinceId]!.stocks.wood = storageCaps(
          d,
          d.provinces[d.homeProvinceId]!,
        ).wood),
    );
    const r = executeCommand(full, { type: 'trade', offerId: 'buy_wood' });
    expect(r.ok === false && r.error.key).toBe('err.storageFull');
    // a buy/sell round trip always loses gold: no money pump
    const round = must(must(s, { type: 'trade', offerId: 'buy_wood' }), {
      type: 'trade',
      offerId: 'sell_wood',
    });
    expect(home(round).stocks.gold).toBeLessThan(home(s).stocks.gold);
  });

  it('changes the tax rate', () => {
    const s = must(newCampaign(), { type: 'setTaxRate', taxRate: 'high' });
    expect(home(s).taxRate).toBe('high');
  });
});
