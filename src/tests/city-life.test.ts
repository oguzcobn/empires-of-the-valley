import { describe, expect, it } from 'vitest';
import { newCampaign, home } from './helpers';
import type { BuildingId, BuildingInstance, GameState } from '../game/core/types';
import { BUILDINGS } from '../game/data/buildings';
import { cityLifeTick, cityRoute, emptyCityLife } from '../game/systems/cityLife';
import { parseGameState } from '../game/save/schema';

function fixture(): GameState {
  const s = structuredClone(newCampaign());
  const p = home(s);
  p.buildings = [];
  for (const t of p.tiles) {
    t.terrain = 'grass';
    t.height = 0;
    t.buildingId = null;
    t.road = false;
    t.paved = false;
    t.roadType = 'dirt';
  }
  p.stocks.food = 1000000;
  p.stocks.gold = 1000000;
  for (let x = 1; x < 30; x++) {
    const t = p.tiles[6 * p.width + x]!;
    t.road = true;
    t.paved = true;
  }
  return s;
}
function add(s: GameState, id: BuildingId, x: number, y: number): BuildingInstance {
  const p = home(s),
    def = BUILDINGS[id];
  const b: BuildingInstance = {
    id: `${id}-${x}-${y}`,
    definitionId: id,
    provinceId: p.id,
    x,
    y,
    level: 1,
    workers: def.levels[0]!.workerSlots,
    progressTicks: 0,
    state: 'active',
    connected: true,
    unpaid: false,
    style: 'turkish',
    look: null,
    condition: 10000,
    paidStages: 0,
  };
  p.buildings.push(b);
  for (let dy = 0; dy < def.footprint[1]; dy++)
    for (let dx = 0; dx < def.footprint[0]; dx++) p.tiles[(y + dy) * p.width + x + dx]!.buildingId = b.id;
  return b;
}
function step(s: GameState, n = 1): void {
  for (let i = 0; i < n; i++) {
    s.tick++;
    cityLifeTick(s, home(s));
  }
}

describe('saved city life', () => {
  it('reserves parking and completes shopping through every stage', () => {
    const s = fixture();
    add(s, 'hut', 2, 5);
    add(s, 'market', 8, 4);
    step(s, 4);
    const id = s.cityLife!.jobs[0]!.id,
      stages = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const j = s.cityLife!.jobs.find((j) => j.id === id);
      if (j) stages.add(j.stage);
      step(s);
      const slots = s.cityLife!.jobs.map((j) => j.target + ':' + j.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
    expect([...stages]).toEqual(
      expect.arrayContaining(['outbound', 'park', 'walkIn', 'inside', 'walkOut', 'return']),
    );
    expect(s.cityLife!.completedTrips).toBeGreaterThan(0);
    expect(s.cityLife!.revenue).toBeGreaterThan(0);
  });
  it('reserves shared parking across deliveries and customers', () => {
    const s = fixture(); add(s, 'hut', 2, 5); add(s, 'market', 8, 4); add(s, 'factory', 14, 3);
    for (let i = 0; i < 100; i++) {
      step(s);
      const reservations = s.cityLife!.jobs.map(j => `${j.target}:${j.slot}`);
      expect(new Set(reservations).size).toBe(reservations.length);
    }
    expect(s.cityLife!.completedTrips).toBeGreaterThan(0);
  });
  it('crosses bridges but rejects missing road links and cancels demolished routes', () => {
    const s = fixture(),
      p = home(s),
      a = add(s, 'hut', 2, 5),
      b = add(s, 'market', 8, 4);
    p.tiles[6 * p.width + 5]!.roadType = 'bridge';
    p.tiles[6 * p.width + 5]!.terrain = 'water';
    expect(cityRoute(p, a, b)).not.toBeNull();
    step(s, 4);
    expect(s.cityLife!.jobs.length).toBe(1);
    p.tiles[6 * p.width + 5]!.road = false;
    expect(cityRoute(p, a, b)).toBeNull();
    step(s);
    expect(s.cityLife!.jobs).toHaveLength(0);
  });
  it('stops jobs when service buildings are unstaffed or demolished', () => {
    const s = fixture();
    add(s, 'hut', 2, 5);
    const b = add(s, 'hospital', 8, 4);
    step(s, 4);
    expect(s.cityLife!.jobs[0]?.kind).toBe('ambulance');
    b.workers = 0;
    step(s);
    expect(s.cityLife!.jobs).toHaveLength(0);
  });
  it('allows one flight per airport and charges/rewards exactly once', () => {
    const s = fixture();
    add(s, 'hotel', 2, 4);
    add(s, 'airport', 12, 2);
    step(s, 18);
    expect(s.cityLife!.flights).toHaveLength(1);
    expect(s.cityLife!.operatingCosts).toBe(1000);
    step(s, 13);
    expect(s.cityLife!.flights).toHaveLength(0);
    expect(s.cityLife!.completedFlights).toBe(1);
    expect(s.cityLife!.passengers).toBe(8);
    expect(s.cityLife!.revenue).toBe(4000);
  });
  it('does not schedule flights without accommodation or operating budget', () => {
    const s = fixture();
    add(s, 'airport', 12, 2);
    step(s, 36);
    expect(s.cityLife!.flights).toHaveLength(0);
    add(s, 'hotel', 2, 4);
    home(s).stocks.gold = 0;
    step(s, 36);
    expect(s.cityLife!.flights).toHaveLength(0);
  });
  it('roundtrips active journeys and rejects corrupt path indices', () => {
    const s = fixture();
    add(s, 'hut', 2, 5);
    add(s, 'market', 8, 4);
    step(s, 4);
    const parsed = parseGameState(JSON.parse(JSON.stringify(s)));
    expect(parsed.ok).toBe(true);
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    step(s, 20);
    step(copy, 20);
    expect(copy.cityLife).toEqual(s.cityLife);
    s.cityLife!.jobs[0]!.index = 9999;
    expect(parseGameState(s).ok).toBe(false);
  });
  it('keeps the legacy state valid with no cityLife field', () => {
    expect(parseGameState(newCampaign()).ok).toBe(true);
    expect(emptyCityLife().jobs).toEqual([]);
  });
});
