import { describe, expect, it } from 'vitest';
import { BUILDINGS, MAX_LEVEL } from '../game/data/buildings';
import { defaultLook } from '../game/data/architecture';
import { maxFloors } from '../game/systems/architecture';
import { executeCommand } from '../game/systems/commands';
import { days, home, must, newCampaign, tweak } from './helpers';

describe('five building levels', () => {
  it('lets every ordinary building rise to level 5 with growing costs and output', () => {
    for (const def of Object.values(BUILDINGS)) {
      if (def.landmark) continue;
      expect(def.levels.length, def.id).toBe(MAX_LEVEL);
      for (let i = 1; i < def.levels.length; i++) {
        const a = def.levels[i - 1]!, b = def.levels[i]!;
        expect(b.housing).toBeGreaterThanOrEqual(a.housing);
        expect(b.workerSlots).toBeGreaterThanOrEqual(a.workerSlots);
        if (a.produces) expect(b.produces!.perDay).toBeGreaterThanOrEqual(a.produces.perDay);
        if (i >= 2) {
          const total = (c: typeof a.cost) => Object.values(c).reduce((n, v) => n + (v ?? 0), 0);
          expect(total(b.cost), `${def.id} L${i + 1}`).toBeGreaterThan(0);
        }
      }
    }
    expect(BUILDINGS.town_center.levels[4]!.requires?.population).toBe(140);
    expect(BUILDINGS.hut.levels[3]!.requires?.townCenterLevel).toBe(4);
  });

  it('modernises the look on the way to level 5', () => {
    for (const style of ['turkish', 'scottish'] as const) {
      const l5 = defaultLook(style, 'hut', 5);
      expect(l5.roof).toBe('flat');
      expect(l5.floors).toBeGreaterThanOrEqual(defaultLook(style, 'hut', 4).floors);
      expect(maxFloors('hut', 5)).toBe(6);
      expect(defaultLook(style, 'town_center', 4).windows).toBe('bay');
    }
  });

  it('raises the town square step by step once the town is big enough', () => {
    let s = newCampaign();
    const tc = home(s).buildings.find((b) => b.definitionId === 'town_center')!;
    s = tweak(s, (d) => {
      const p = d.provinces[d.homeProvinceId]!;
      p.population.adults = 200;
      for (const k of Object.keys(p.stocks) as (keyof typeof p.stocks)[]) p.stocks[k] = 1e9;
    });
    for (let level = 2; level <= 5; level++) {
      s = must(s, { type: 'upgradeBuilding', instanceId: tc.id });
      s = days(s, 20);
      expect(home(s).buildings.find((b) => b.id === tc.id)!.level).toBe(level);
    }
    const r = executeCommand(s, { type: 'upgradeBuilding', instanceId: tc.id });
    expect(r.ok === false && r.error.key).toBe('err.maxLevel');
  });
});

describe('era unlocks', () => {
  it('unlocks later-era buildings with the town square level, as the message says', async () => {
    const { validatePlacement } = await import('../game/systems/commands');
    let s = newCampaign();
    const villa = (st: typeof s) => validatePlacement(st, 'villa', 0, 0);
    expect(villa(s)?.key).toBe('err.needTownCenter');
    s = tweak(s, (d) => {
      const tc = d.provinces[d.homeProvinceId]!.buildings.find((b) => b.definitionId === 'town_center')!;
      tc.level = 3;
    });
    expect(villa(s)?.key).not.toBe('err.needTownCenter');
  });
});
