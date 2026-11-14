import { describe, expect, it } from 'vitest';
import { HOME_PROVINCE_ID, WORLD_BY_ID } from '../game/data/worldMap';
import { createNewGame } from '../game/scenarios/newGame';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';
import { forecastBattle } from '../game/systems/combat';
import { validateCommand } from '../game/systems/commands';
import { days, expectValid, home, must, tweak } from './helpers';

const neighbor = WORLD_BY_ID[HOME_PROVINCE_ID]!.neighbors[0]!;
const start = () => createNewGame({ seed: 12, mode: 'sandbox', culture: 'turkish' });

describe('diplomacy agreements', () => {
  it('signs a trade pact, earns one additional gold per day and persists it', () => {
    const s = start();
    const trade = must(s, { type: 'signPact', provinceId: neighbor, pact: 'trade' });
    expect(trade.treaties?.[neighbor]).toBe('trade');
    expect(home(trade).stocks.gold).toBe(home(s).stocks.gold - 10000);
    const next = days(trade, 1);
    const baseline = days(s, 1);
    expect(home(next).stocks.gold - home(baseline).stocks.gold).toBe(-9000);
    expectValid(next);
    const save = createSaveFile(trade);
    expect(save.ok).toBe(true);
    if (!save.ok) return;
    const loaded = loadSaveFile(save.file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state.treaties?.[neighbor]).toBe('trade');
  });

  it('honours a non-aggression pact and prevents duplicate agreements', () => {
    const s = must(start(), { type: 'signPact', provinceId: neighbor, pact: 'non_aggression' });
    expect(validateCommand(s, { type: 'attackDistrict', provinceId: neighbor })?.key).toBe('err.truceActive');
    expect(validateCommand(s, { type: 'signPact', provinceId: neighbor, pact: 'alliance' })).not.toBeNull();
  });

  it('allies strengthen auto-resolve and preserve existing army state', () => {
    const s = tweak(start(), (d) => { d.militia = 20; });
    const before = forecastBattle(s, neighbor)!;
    const ally = must(s, { type: 'signPact', provinceId: neighbor, pact: 'alliance' });
    const after = forecastBattle(ally, neighbor)!;
    expect(after.attackPower).toBe(before.attackPower + 20);
    expect(ally.militia).toBe(s.militia);
    expectValid(ally);
  });
});
