import { describe, expect, it } from 'vitest';
import { housingCapacity, idleWorkers, totalPopulation } from '../game/systems/economy';
import { happinessTarget } from '../game/systems/population';
import { buildAndStaff, days, expectValid, home, newCampaign, tweak } from './helpers';

describe('population', () => {
  it('starts at the documented happiness target', () => {
    expect(happinessTarget(home(newCampaign()))).toBe(70);
  });

  it('grows no faster than once per 5 days while housed and fed', () => {
    let s = newCampaign();
    s = days(s, 4);
    expect(totalPopulation(home(s))).toBe(12);
    s = days(s, 1);
    expect(totalPopulation(home(s))).toBe(13);
    s = days(s, 4);
    expect(totalPopulation(home(s))).toBe(13);
    s = days(s, 1);
    expect(totalPopulation(home(s))).toBe(14);
  });

  it('does not grow beyond housing', () => {
    let s = tweak(newCampaign(), (d) => {
      const p = d.provinces[d.homeProvinceId]!;
      p.population.adults = 16; // 20 residents, 20 beds
      p.stocks.food = 250000;
    });
    s = days(s, 12);
    expect(totalPopulation(home(s))).toBe(housingCapacity(home(s)));
  });

  it('does not grow without a food reserve', () => {
    let s = tweak(newCampaign(), (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = 6000));
    s = days(s, 6);
    expect(totalPopulation(home(s))).toBeLessThanOrEqual(12);
  });

  it('famine shrinks the village but never below a recoverable core, and frees workers', () => {
    let s = buildAndStaff(newCampaign(), 'lumber_camp', 2).state;
    s = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = 0));
    s = days(s, 60);
    const p = home(s);
    expect(totalPopulation(p)).toBeGreaterThanOrEqual(6);
    expect(totalPopulation(p)).toBeLessThan(12);
    expect(idleWorkers(p)).toBeGreaterThanOrEqual(0);
    expect(p.happiness).toBeLessThan(50);
    expectValid(s);
  });

  it('recovers after famine once food returns', () => {
    let s = tweak(newCampaign(), (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = 0));
    s = days(s, 10);
    s = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.food = 200000));
    const low = totalPopulation(home(s));
    s = days(s, 30);
    expect(totalPopulation(home(s))).toBeGreaterThan(low);
    expect(home(s).happiness).toBeGreaterThan(55);
  });

  it('high taxes lower happiness, low taxes raise it', () => {
    const base = home(newCampaign());
    expect(happinessTarget({ ...base, taxRate: 'high' })).toBe(60);
    expect(happinessTarget({ ...base, taxRate: 'low' })).toBe(75);
  });
});
