import { describe, expect, it } from 'vitest';
import { cityOf, districtName } from '../game/data/cities';
import { WORLD_BY_ID, WORLD_PROVINCES } from '../game/data/worldMap';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';
import { citizenAt } from '../game/data/citizens';
import { validateCommand } from '../game/systems/commands';
import { build, days, home, must, newCampaign, tweak } from './helpers';
import { playChapterOne } from './playthrough';

describe('two-city long campaign', () => {
  it('offers only Trabzon and Edinburgh as culturally distinct starting cities', () => {
    const tr = newCampaign(12, 'turkish');
    const sc = newCampaign(12, 'scottish');
    expect(tr.cityId).toBe('trabzon');
    expect(sc.cityId).toBe('edinburgh');
    expect(home(tr).name).toBe('Trabzon');
    expect(home(sc).name).toBe('Edinburgh');
    expect(cityOf(sc.cityId, sc.culture).landmark).toBe('scott_monument');
    expect(districtName(tr.cityId, tr.culture, 1)).toBe('Akçaabat');
  });

  it('names citizens repeatably based on city and seed', () => {
    const tr = newCampaign(123, 'turkish');
    const sc = newCampaign(123, 'scottish');
    expect(citizenAt(tr, 1)).toEqual(citizenAt(newCampaign(123, 'turkish'), 1));
    expect(citizenAt(tr, 1).name).not.toBe(citizenAt(sc, 1).name);
  });

  it('claims only adjacent districts and grants no duplicate rewards', () => {
    const completed = playChapterOne(42).state;
    const s = tweak(completed, (d) => { home(d).stocks.gold += 100000; });
    const adjacent = WORLD_BY_ID[s.homeProvinceId]!.neighbors[0]!;
    expect(validateCommand(s, { type: 'claimDistrict', provinceId: adjacent })).toBeNull();
    const expanded = must(s, { type: 'claimDistrict', provinceId: adjacent });
    expect(expanded.claimedDistricts).toEqual([adjacent]);
    expect(expanded.revealedProvinceIds).toContain(adjacent);
    expect(validateCommand(expanded, { type: 'claimDistrict', provinceId: adjacent })).not.toBeNull();
    const remote = WORLD_PROVINCES.find((p) =>
      p.id !== s.homeProvinceId &&
      !WORLD_BY_ID[s.homeProvinceId]!.neighbors.includes(p.id) &&
      !WORLD_BY_ID[adjacent]!.neighbors.includes(p.id)
    )!;
    expect(validateCommand(expanded, { type: 'claimDistrict', provinceId: remote.id })).not.toBeNull();
  });

  it('persists new city fields, militia and secure districts across save reload', () => {
    const s = tweak(newCampaign(567, 'scottish'), (d) => {
      d.claimedDistricts = ['cinar_ormani'];
      d.militia = 10;
      d.armyOrder = 'patrol';
    });
    const save = createSaveFile(s);
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    const loaded = loadSaveFile(save.file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.cityId).toBe('edinburgh');
    expect(loaded.state.claimedDistricts).toEqual(['cinar_ormani']);
    expect(loaded.state.militia).toBe(10);
    expect(loaded.state.armyOrder).toBe('patrol');
  });

  it('recruits guards only after a watchtower and charges food and gold', () => {
    let s = tweak(playChapterOne(42).state, (d) => {
      home(d).stocks.gold += 100000;
    });
    const site = build(s, 'watchtower');
    s = days(site.state, 4);
    const beforeGold = home(s).stocks.gold;
    const beforeFood = home(s).stocks.food;
    s = must(s, { type: 'recruitMilitia', amount: 5 });
    expect(s.militia).toBe(5);
    expect(home(s).stocks.gold).toBe(beforeGold - 10000);
    expect(home(s).stocks.food).toBe(beforeFood - 5000);
  });
});
