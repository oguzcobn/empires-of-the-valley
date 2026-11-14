import { describe, expect, it } from 'vitest';
import { executeCommand, planRoadRoute } from '../game/systems/commands';
import { crimeDayEnd, neighborhoodServices } from '../game/systems/crime';
import { idx, tileAt } from '../game/systems/grid';
import { findRoadPath } from '../game/rendering/armyPath';
import { expectValid, home, must, newCampaign, tweak } from './helpers';

describe('stone bridge', () => {
  it('crosses an entire river atomically and connects both banks', () => {
    const start = { x: 11, y: 17 };
    const end = { x: 8, y: 17 };
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      for (const x of [9, 10]) {
        Object.assign(p.tiles[idx(p, x, 17)]!, { terrain: 'water', height: 0, deposit: 0 });
      }
    });
    const plan = planRoadRoute(s, start, end, true);
    expect(plan.error).toBeNull();
    const next = must(s, { type: 'placeRoadRoute', start, end, bridge: true });
    expect(tileAt(home(next), 9, 17)?.roadType).toBe('bridge');
    expect(tileAt(home(next), 10, 17)?.roadType).toBe('bridge');
    expect(findRoadPath(home(next), [11, 17], [8, 17])).toHaveLength(4);
    expectValid(next);
  });

  it('rejects a bridge over dry land', () => {
    expect(executeCommand(newCampaign(), {
      type: 'placeRoadRoute', start: { x: 11, y: 17 }, end: { x: 8, y: 17 }, bridge: true,
    })).toEqual({ ok: false, error: { key: 'err.bridgeRiver' } });
  });
});

describe('civic services', () => {
  it('protects nearby housing and increases happiness only while staffed', () => {
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      p.population.adults = 40;
      const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
      p.buildings.push(
        { ...hut, id: 'police', definitionId: 'police_station', x: hut.x + 1, workers: 2 },
        { ...hut, id: 'church', definitionId: 'church', x: hut.x + 1, workers: 1 },
      );
    });
    const staffed = neighborhoodServices(home(s));
    const unstaffed = tweak(s, (draft) => {
      for (const b of home(draft).buildings) if (b.id === 'police' || b.id === 'church') b.workers = 0;
    });
    expect(staffed.risk).toBeLessThan(neighborhoodServices(home(unstaffed)).risk);
    expect(staffed.community).toBeGreaterThan(0);
    expect(neighborhoodServices(home(unstaffed)).community).toBe(0);
    const run = () => tweak(unstaffed, (draft) => {
      for (let day = 1; day <= 35; day++) crimeDayEnd(draft, home(draft), day);
    });
    const withCrime = run();
    expect(withCrime.eventLog.some((event) => event.key === 'event.crimeTheft' || event.key === 'event.crimeVandalism')).toBe(true);
    expect(withCrime).toEqual(run());
  });
});
