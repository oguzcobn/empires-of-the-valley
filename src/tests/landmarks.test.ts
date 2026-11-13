import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameState, LandmarkId } from '../game/core/types';
import { CORE_OFFSET, ROAD_COSTS, SCHEMA_VERSION, TERRACE_COST } from '../game/data/balance';
import { BUILDINGS } from '../game/data/buildings';
import { LANDMARK_IDS } from '../game/data/landmarks';
import { loadSaveFile } from '../game/save/serialize';
import { executeCommand } from '../game/systems/commands';
import { refreshConnectivity, tileAt } from '../game/systems/grid';
import { findSite, terrainSiteError } from '../game/systems/placement';
import { hasTerrainFor } from '../game/systems/terrain';
import { landmarkStage, stageBoundary } from '../game/systems/tick';
import { applyTicks } from '../game/systems/tick';
import { days, expectValid, home, must, newCampaign, tweak } from './helpers';

const refused = (s: GameState, cmd: Parameters<typeof executeCommand>[1]): string => {
  const r = executeCommand(s, cmd);
  return r.ok ? 'ok' : r.error.key;
};

/** A developed city: the landmark requirements are met and storage is generous. */
function developed(seed = 42): GameState {
  return tweak(newCampaign(seed), (d) => {
    const p = d.provinces[d.homeProvinceId]!;
    d.researchedTechIds.push('masonry', 'literacy', 'architecture');
    p.buildings.find((b) => b.definitionId === 'town_center')!.level = 2;
    p.population.adults = 50;
    p.population.children = 4;
    d.researchedTechIds.push('storage');
    p.stocks.wood = 300000;
    p.stocks.stone = 300000;
    p.stocks.gold = 900000;
    p.stocks.research = 200000;
  });
}

function placeLandmark(s: GameState, id: LandmarkId): { state: GameState; instanceId: string } {
  const plan = findSite(home(s), BUILDINGS[id], 80);
  if (!plan) throw new Error(`no site for ${id}`);
  let state = s;
  for (const [x, y] of plan.roads) state = must(state, { type: 'placeRoad', x, y });
  state = must(state, { type: 'placeBuilding', buildingId: id, x: plan.x, y: plan.y });
  return { state, instanceId: home(state).buildings.at(-1)!.id };
}

describe('elevation and terrain', () => {
  it('every generated valley has a real site for every landmark', () => {
    for (let seed = 0; seed < 25; seed++) {
      const p = home(newCampaign(seed));
      for (const id of LANDMARK_IDS) expect(hasTerrainFor(p, id), `seed ${seed} ${id}`).toBe(true);
      expect(p.tiles.some((t) => t.height >= 3)).toBe(true);
      expect(p.tiles.some((t) => t.terrain === 'lake')).toBe(true);
    }
  });

  it('buildings need flat ground; height really restricts placement', () => {
    const s = newCampaign(42);
    const p = home(s);
    // find a 1x1 hut spot whose neighbour differs in height: a 2x2 warehouse there is uneven
    let found = false;
    for (let y = 0; y < p.height - 1 && !found; y++)
      for (let x = 0; x < p.width - 1 && !found; x++) {
        const hs = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => tileAt(p, x + dx!, y + dy!)!);
        if (hs.every((t) => ['grass', 'hill'].includes(t.terrain) && !t.road && !t.buildingId) && new Set(hs.map((t) => t.height)).size > 1) {
          expect(terrainSiteError(p, BUILDINGS.warehouse, x, y)?.key).toMatch(/err\.(uneven|terrain)/);
          found = true;
        }
      }
    expect(found).toBe(true);
  });

  it('landmark site rules are checked for real, not just shown', () => {
    const p = home(newCampaign(42));
    const tc = p.buildings.find((b) => b.definitionId === 'town_center')!;
    expect(terrainSiteError(p, BUILDINGS.edinburgh_castle, tc.x + 3, tc.y + 3)?.key).toMatch(/err\./);
    // the crag of the left highlands satisfies the Edinburgh rule; the valley floor does not
    expect(terrainSiteError(p, BUILDINGS.edinburgh_castle, 1, 13)).toBeNull();
    expect(terrainSiteError(p, BUILDINGS.sumela_monastery, 1, 5)).toBeNull();
    expect(terrainSiteError(p, BUILDINGS.sumela_monastery, tc.x + 3, tc.y + 3)?.key).toMatch(/err\.(terrain|site|occupied)/);
    expect(terrainSiteError(p, BUILDINGS.galata_tower, tc.x + 3, tc.y + 3)?.key).toMatch(/err\.(terrain|site|occupied)/);
    expect(terrainSiteError(p, BUILDINGS.stirling_castle, 18, 1)).toBeNull();
  });
});

describe('roads on the new terrain', () => {
  it('picks bridges, stairs and tunnels by terrain, with their own prices and rules', () => {
    let s = developed(42);
    const p0 = home(s);
    // stairs: climb from the valley floor onto a hill
    const plan = findSite(p0, BUILDINGS.stirling_castle, 80)!;
    expect(plan).not.toBeNull();
    for (const [x, y] of plan.roads) {
      const before = home(s).stocks;
      s = must(s, { type: 'placeRoad', x, y });
      const t = tileAt(home(s), x, y)!;
      const cost = ROAD_COSTS[t.roadType];
      expect(home(s).stocks.wood).toBe(before.wood - (cost.wood ?? 0));
    }
    expectValid(s);
    // a road cannot jump two levels
    const p = home(s);
    for (let y = 1; y < p.height - 1; y++)
      for (let x = 1; x < p.width - 1; x++) {
        const t = tileAt(p, x, y)!;
        if (t.road || t.buildingId || !['grass', 'hill'].includes(t.terrain)) continue;
        const steep = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const n = tileAt(p, x + dx!, y + dy!)!;
          return n.road && Math.abs(n.height - t.height) >= 2;
        });
        const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const n = tileAt(p, x + dx!, y + dy!)!;
          return n.road && Math.abs(n.height - t.height) <= 1;
        });
        if (steep && !ok) expect(refused(s, { type: 'placeRoad', x, y })).toBe('err.roadTooSteep');
      }
  });

  it('bridges cross the river and tunnels need masonry', () => {
    const s = newCampaign(42);
    const p = home(s);
    const water = p.tiles.findIndex((t, i) => t.terrain === 'water' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(p, (i % p.width) + dx!, Math.floor(i / p.width) + dy!)?.road));
    if (water >= 0) {
      const next = must(s, { type: 'placeRoad', x: water % p.width, y: Math.floor(water / p.width) });
      expect(tileAt(home(next), water % p.width, Math.floor(water / p.width))!.roadType).toBe('bridge');
    }
    // a mountain tile next to a road: tunnel is refused without masonry, allowed with it
    const withRoad = tweak(s, (d) => {
      const q = d.provinces[d.homeProvinceId]!;
      const m = q.tiles.findIndex((t) => t.terrain === 'mountain');
      const mx = m % q.width;
      const my = Math.floor(m / q.width);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
        const n = q.tiles[(my + dy) * q.width + mx + dx];
        if (n && n.terrain !== 'water' && n.terrain !== 'lake' && !n.buildingId) {
          n.road = true;
          n.roadType = 'tunnel';
          break;
        }
      }
      refreshConnectivity(q);
    });
    const q = home(withRoad);
    const m = q.tiles.findIndex((t) => t.terrain === 'mountain');
    expect(refused(withRoad, { type: 'placeRoad', x: m % q.width, y: Math.floor(m / q.width) })).toBe('err.needMasonryTunnel');
    const mason = tweak(withRoad, (d) => void d.researchedTechIds.push('masonry'));
    const dug = must(mason, { type: 'placeRoad', x: m % q.width, y: Math.floor(m / q.width) });
    expect(tileAt(home(dug), m % q.width, Math.floor(m / q.width))!.roadType).toBe('tunnel');
  });

  it('terracing turns hill tiles into farmland behind a retaining wall', () => {
    let s = newCampaign(42);
    const p = home(s);
    const i = p.tiles.findIndex((t) => t.terrain === 'hill' && !t.road && !t.buildingId);
    const x = i % p.width;
    const y = Math.floor(i / p.width);
    expect(refused(s, { type: 'buildTerrace', x: 15, y: 15 })).toBe('err.notTerraceable');
    const before = home(s).stocks;
    s = must(s, { type: 'buildTerrace', x, y });
    expect(tileAt(home(s), x, y)!.terrain).toBe('terrace');
    expect(home(s).stocks.stone).toBe(before.stone - TERRACE_COST.stone!);
    expect(refused(s, { type: 'buildTerrace', x, y })).toBe('err.notTerraceable');
    // terrace farms only on terraces
    expect(refused(s, { type: 'placeBuilding', buildingId: 'terrace_farm', x: 15, y: 18 })).toMatch(/err\.terrain/);
    expectValid(s);
  });
});

describe('historic landmarks', () => {
  it('require Architecture, a grown town and are unique', () => {
    const s = newCampaign(42);
    const plan = findSite(home(developed()), BUILDINGS.stirling_castle, 80)!;
    expect(refused(s, { type: 'placeBuilding', buildingId: 'stirling_castle', x: plan.x, y: plan.y })).toMatch(/err\.need/);
    const placed = placeLandmark(developed(), 'stirling_castle');
    const again = findSite(home(placed.state), BUILDINGS.stirling_castle, 80);
    if (again) expect(refused(placed.state, { type: 'placeBuilding', buildingId: 'stirling_castle', x: again.x, y: again.y })).toBe('err.landmarkExists');
    expectValid(placed.state);
  });

  it('is built in paid stages by builders, waits for materials and finishes in the listed time', () => {
    const start = developed();
    const before = home(start).stocks;
    const { state, instanceId } = placeLandmark(start, 'stirling_castle');
    const spec = BUILDINGS.stirling_castle.landmark!;
    let s = state;
    const b0 = home(s).buildings.find((b) => b.id === instanceId)!;
    expect(b0.paidStages).toBe(1);
    expect(home(s).stocks.gold).toBe(before.gold - spec.stages[0]!.cost.gold!);
    // no builders: no progress
    s = days(s, 3);
    expect(home(s).buildings.find((b) => b.id === instanceId)!.progressTicks).toBe(0);
    s = must(s, { type: 'assignWorkers', instanceId, workers: spec.builders });
    expectValid(s);
    s = days(s, spec.stages[0]!.days);
    let b = home(s).buildings.find((x) => x.id === instanceId)!;
    expect(b.progressTicks).toBe(stageBoundary(b, 1));
    // starve the stage-2 materials: it waits, and resumes when they arrive
    s = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.stone = 0));
    s = days(s, 2);
    b = home(s).buildings.find((x) => x.id === instanceId)!;
    expect(landmarkStage(b).waiting).toBe(true);
    expect(b.progressTicks).toBe(stageBoundary(b, 1));
    s = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.stone = 300000));
    const total = spec.stages.reduce((a, st) => a + st.days, 0);
    s = days(s, total - spec.stages[0]!.days);
    b = home(s).buildings.find((x) => x.id === instanceId)!;
    expect(b.state).toBe('active');
    expect(b.paidStages).toBe(spec.stages.length);
    expect(b.workers).toBeLessThanOrEqual(BUILDINGS.stirling_castle.levels[0]!.workerSlots);
    expect(refused(s, { type: 'demolishBuilding', instanceId })).toBe('err.notDemolishable');
    expectValid(s);
  });

  it('cancelling refunds every stage already paid', () => {
    const start = developed();
    const { state, instanceId } = placeLandmark(start, 'stirling_castle');
    const paid = home(state).stocks;
    const cancelled = must(state, { type: 'cancelConstruction', instanceId });
    expect(home(cancelled).stocks.gold).toBe(paid.gold + BUILDINGS.stirling_castle.landmark!.stages[0]!.cost.gold!);
    expect(home(cancelled).buildings.find((b) => b.id === instanceId)).toBeUndefined();
    expectValid(cancelled);
  });
});

describe('save format v2 -> v3', () => {
  it('a real v2 save opens on the 32x32 map with the city intact and keeps playing', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/v2-scottish-chapter1.json', import.meta.url), 'utf8')) as {
      state: { schemaVersion: number; provinces: Record<string, { buildings: { id: string; x: number; y: number; style: string }[]; tiles: { road: boolean }[] }> };
    };
    expect(raw.state.schemaVersion).toBe(2);
    const loaded = loadSaveFile(raw);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.schemaVersion).toBe(SCHEMA_VERSION);
    const p = home(loaded.state);
    const old = Object.values(raw.state.provinces)[0]!;
    expect(p.width).toBe(32);
    expect(p.buildings.map((b) => [b.id, b.x - CORE_OFFSET, b.y - CORE_OFFSET, b.style])).toEqual(
      old.buildings.map((b) => [b.id, b.x, b.y, b.style]),
    );
    expect(p.tiles.filter((t) => t.road).length).toBe(old.tiles.filter((t) => t.road).length);
    expect(p.buildings.every((b) => b.connected)).toBe(true);
    expect(p.tiles.some((t) => t.height > 0)).toBe(true);
    expectValid(applyTicks(loaded.state, 24 * 15));
  });
});
