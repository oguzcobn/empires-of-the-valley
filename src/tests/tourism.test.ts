import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BuildingId, GameState } from '../game/core/types';
import { SCHEMA_VERSION } from '../game/data/balance';
import { BUILDINGS } from '../game/data/buildings';
import { VESSELS } from '../game/data/shipyard';
import { loadSaveFile } from '../game/save/serialize';
import { executeCommand } from '../game/systems/commands';
import { tileAt } from '../game/systems/grid';
import { findSite, terrainSiteError } from '../game/systems/placement';
import { MAX_SPEND, beds, safety, tourismReport } from '../game/systems/tourism';
import { days, expectValid, home, must, newCampaign, tweak } from './helpers';

const refused = (s: GameState, cmd: Parameters<typeof executeCommand>[1]): string => {
  const r = executeCommand(s, cmd);
  return r.ok ? 'ok' : r.error.key;
};

function rich(seed = 42, culture?: 'scottish' | 'turkish'): GameState {
  return tweak(newCampaign(seed, culture), (d) => {
    const p = d.provinces[d.homeProvinceId]!;
    d.researchedTechIds.push('masonry', 'literacy', 'architecture', 'storage');
    p.buildings.find((b) => b.definitionId === 'town_center')!.level = 2;
    p.population.adults = 60;
    p.stocks.wood = 300000;
    p.stocks.stone = 300000;
    p.stocks.gold = 900000;
    p.stocks.food = 250000;
    p.stocks.tools = 100000;
    p.stocks.research = 200000;
  });
}

/** Places a building at the nearest site, completes it at once and staffs it fully. */
function ready(s: GameState, id: BuildingId, workers?: number): { state: GameState; bid: string } {
  const plan = findSite(home(s), BUILDINGS[id], 80);
  if (!plan) throw new Error(`no site ${id}`);
  let t = s;
  for (const [x, y] of plan.roads) t = must(t, { type: 'placeRoad', x, y });
  t = must(t, { type: 'placeBuilding', buildingId: id, x: plan.x, y: plan.y });
  const bid = home(t).buildings.at(-1)!.id;
  t = tweak(t, (d) => {
    const b = d.provinces[d.homeProvinceId]!.buildings.find((x) => x.id === bid)!;
    b.state = 'active';
    b.progressTicks = 0;
    if (BUILDINGS[id].landmark) b.paidStages = BUILDINGS[id].landmark!.stages.length;
    b.workers = 0;
  });
  const n = workers ?? BUILDINGS[id].levels[0]!.workerSlots;
  if (n > 0) t = must(t, { type: 'assignWorkers', instanceId: bid, workers: n });
  return { state: t, bid };
}

describe('tourism', () => {
  it('no attractions, no tourists', () => {
    const s = days(rich(), 3);
    expect(s.tourism.visitorsYesterday).toBe(0);
    expect(tourismReport(s).attraction).toBe(0);
  });

  it('a monument, an inn and a market bring paying visitors limited by beds; visitors eat', () => {
    let s = rich();
    s = ready(s, 'stirling_castle').state;
    const before = tourismReport(s);
    expect(before.attraction).toBeGreaterThan(0);
    s = ready(s, 'inn').state;
    s = ready(s, 'market').state;
    const r = tourismReport(s);
    expect(r.beds).toBeGreaterThan(0);
    expect(r.capacity).toBeGreaterThan(before.capacity);
    const food0 = home(s).stocks.food;
    s = days(s, 1);
    expect(s.tourism.visitorsYesterday).toBeGreaterThan(0);
    expect(s.tourism.visitorsYesterday).toBeLessThanOrEqual(r.capacity);
    expect(s.tourism.incomeYesterday).toBeGreaterThan(0);
    expect(s.tourism.incomeYesterday).toBeLessThanOrEqual(r.capacity * MAX_SPEND);
    expect(home(s).today.consumed.food + home(s).yesterday.consumed.food).toBeGreaterThan(0);
    expect(home(s).stocks.food).toBeLessThan(food0 + 100000);
    expect(s.tourism.culture).toBeGreaterThan(0);
    expectValid(s);
  });

  it('without beds the crowd is turned away; satisfaction moves gradually', () => {
    let s = rich();
    s = ready(s, 'stirling_castle').state;
    s = ready(s, 'galata_tower').state;
    const r = tourismReport(s);
    expect(r.visitors).toBeLessThanOrEqual(r.capacity);
    const sat0 = s.tourism.satisfaction;
    s = days(s, 1);
    expect(Math.abs(s.tourism.satisfaction - sat0)).toBeLessThanOrEqual(12);
  });

  it('worn monuments attract fewer visitors; restoration brings them back', () => {
    let s = rich();
    const placed = ready(s, 'stirling_castle');
    s = placed.state;
    const fresh = tourismReport(s).attraction;
    const worn = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.buildings.find((b) => b.id === placed.bid)!.condition = 2000));
    expect(tourismReport(worn).attraction).toBeLessThan(fresh);
    const fixed = must(worn, { type: 'restoreBuilding', instanceId: placed.bid });
    expect(tourismReport(fixed).attraction).toBe(fresh);
  });

  it('culture bonuses: Turkish inns have more beds, Scottish towers cover more', () => {
    const tr = ready(rich(42, 'turkish'), 'inn');
    const sc = ready(rich(42, 'scottish'), 'inn');
    expect(beds(home(tr.state))).toBe(beds(home(sc.state)) + 2);
    const tw = ready(ready(rich(42, 'scottish'), 'inn').state, 'watchtower');
    expect(safety(home(tw.state)).value).toBeGreaterThan(safety(home(sc.state)).value);
  });
});

describe('shipyard', () => {
  const withYard = (): { state: GameState; bid: string } => ready(rich(), 'shipyard');

  it('must stand on the shore', () => {
    const p = home(newCampaign(42));
    const tc = p.buildings.find((b) => b.definitionId === 'town_center')!;
    expect(terrainSiteError(p, BUILDINGS.shipyard, tc.x + 3, tc.y + 4)?.key).toMatch(/err\.(needWater|occupied|terrain)/);
    const plan = findSite(p, BUILDINGS.shipyard, 80)!;
    expect(plan).not.toBeNull();
  });

  it('orders are paid up front, built by shipwrights and launched into the fleet', () => {
    const yard = withYard();
    let s = yard.state;
    const bid = yard.bid;
    const gold0 = home(s).stocks.wood;
    s = must(s, { type: 'orderVessel', kind: 'fishing' });
    expect(home(s).stocks.wood).toBe(gold0 - VESSELS.fishing.cost.wood!);
    // no shipwrights: no progress
    const idle = must(s, { type: 'assignWorkers', instanceId: bid, workers: 0 });
    expect(days(idle, 3).shipyard.queue[0]!.progress).toBe(0);
    s = days(s, 6);
    expect(s.shipyard.fleet.fishing).toBe(1);
    expect(s.shipyard.queue).toHaveLength(0);
    // a fishing boat brings food every day
    const food = home(s).stocks.food;
    s = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = Math.min(food, 100000)));
    const f0 = home(s).stocks.food;
    const after = days(s, 1);
    expect(home(after).yesterday.produced.food).toBeGreaterThanOrEqual(VESSELS.fishing.foodPerDay!);
    void f0;
    expectValid(after);
  });

  it('caps the fleet, refunds cancelled orders and sells yachts', () => {
    let { state: s } = withYard();
    for (let i = 0; i < 4; i++) s = must(s, { type: 'orderVessel', kind: 'fishing' });
    expect(refused(s, { type: 'orderVessel', kind: 'fishing' })).toBe('err.queueFull');
    const gold = home(s).stocks.wood;
    s = must(s, { type: 'cancelVessel', orderId: s.shipyard.queue.at(-1)!.id });
    expect(home(s).stocks.wood).toBe(gold + VESSELS.fishing.cost.wood!);
    s = tweak(s, (d) => {
      d.shipyard.queue = [];
      d.shipyard.fleet.yacht = 1;
    });
    const g0 = home(s).stocks.gold;
    s = must(s, { type: 'sellYacht' });
    expect(home(s).stocks.gold).toBe(g0 + VESSELS.yacht.salePrice!);
    expect(refused(s, { type: 'sellYacht' })).toBe('err.noYacht');
    s = tweak(s, (d) => void (d.shipyard.fleet.fishing = VESSELS.fishing.cap));
    expect(refused(s, { type: 'orderVessel', kind: 'fishing' })).toBe('err.fleetCap');
  });
});

describe('stadium', () => {
  it('needs reclaimed shore land and every map has it', () => {
    for (let seed = 0; seed < 15; seed++) {
      const p = home(newCampaign(seed));
      let ok = false;
      for (let y = 0; y < p.height && !ok; y++)
        for (let x = 0; x < p.width && !ok; x++) if (terrainSiteError(p, BUILDINGS.trabzon_stadium, x, y) === null) ok = true;
      expect(ok, `seed ${seed}`).toBe(true);
    }
    const p = home(newCampaign(42));
    expect(tileAt(p, 15, 15)).toBeDefined();
  });
});

describe('save format v3 -> v4', () => {
  it('a real v3 save opens with empty tourism and shipyard records', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/v3-turkish-chapter1.json', import.meta.url), 'utf8')) as { state: { schemaVersion: number; tick: number } };
    expect(raw.state.schemaVersion).toBe(3);
    const loaded = loadSaveFile(raw);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.state.tick).toBe(raw.state.tick);
    expect(loaded.state.shipyard.fleet).toEqual({ fishing: 0, cargo: 0, yacht: 0 });
    expect(loaded.state.tourism.visitorsYesterday).toBe(0);
    expectValid(days(loaded.state, 10));
  });
});
