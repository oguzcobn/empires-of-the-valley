import { describe, expect, it } from 'vitest';
import { HOME_PROVINCE_ID, WORLD_BY_ID } from '../game/data/worldMap';
import { createNewGame } from '../game/scenarios/newGame';
import { forecastBattle } from '../game/systems/combat';
import { executeCommand, validateCommand } from '../game/systems/commands';
import { expectValid, home, must, tweak } from './helpers';

const firstNeighbor = WORLD_BY_ID[HOME_PROVINCE_ID]!.neighbors[0]!;
const start = () => tweak(createNewGame({ seed: 123, mode: 'sandbox', culture: 'turkish' }), (d) => {
  d.militia = 30;
  d.provinces[d.homeProvinceId]!.stocks.gold = 100000;
  d.provinces[d.homeProvinceId]!.stocks.food = 100000;
});

describe('deterministic auto-battles', () => {
  it('calculates the same outcome from the same game state', () => {
    const s = start();
    expect(forecastBattle(s, firstNeighbor)).toEqual(forecastBattle(s, firstNeighbor));
    expect(forecastBattle(s, 'unknown')).toBeNull();
  });

  it('claims adjacent territory after a successful automatic battle and consumes supplies', () => {
    const s = start();
    const forecast = forecastBattle(s, firstNeighbor)!;
    expect(forecast.victory).toBe(true);
    expect(validateCommand(s, { type: 'attackDistrict', provinceId: firstNeighbor })).toBeNull();
    const attacked = must(s, { type: 'attackDistrict', provinceId: firstNeighbor });
    expect(attacked.claimedDistricts).toContain(firstNeighbor);
    expect(attacked.militia).toBe(30 - forecast.casualties);
    expect(home(attacked).stocks.gold).toBe(home(s).stocks.gold - 5000);
    expect(home(attacked).stocks.food).toBe(home(s).stocks.food - 3000);
    expectValid(attacked);
    expect(validateCommand(attacked, { type: 'attackDistrict', provinceId: firstNeighbor })).not.toBeNull();
  });

  it('rejects attacks with too few militia, preserving all game state', () => {
    const s = tweak(start(), (d) => { d.militia = 0; });
    const result = executeCommand(s, { type: 'attackDistrict', provinceId: firstNeighbor });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.key).toBe('err.needMilitia');
    expect(s.claimedDistricts).toEqual([]);
  });
});
