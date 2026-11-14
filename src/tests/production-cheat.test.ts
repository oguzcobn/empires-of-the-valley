import { describe, expect, it } from 'vitest';
import { createNewGame } from '../game/scenarios/newGame';
import { executeCommand } from '../game/systems/commands';
import { dailyOutput } from '../game/systems/economy';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';
import { validateInvariants } from '../game/systems/invariants';
import { buildAndStaff, home, newCampaign } from './helpers';

describe('URETIM10X production cheat', () => {
  it('multiplies ordinary production by 10, without changing game clock, difficulty or construction', () => {
    const { state, id } = buildAndStaff(newCampaign(51), 'farm', 3);
    const farm = home(state).buildings.find((b) => b.id === id)!;
    const baseline = dailyOutput(state, home(state), farm);
    expect(baseline).toBeGreaterThan(0);
    const cmd = executeCommand(state, { type: 'redeemCheat', code: ' uretim10x ' });
    expect(cmd.ok).toBe(true);
    if (!cmd.ok) return;
    const next = cmd.state;
    expect(next.cheatProduction10x).toBe(true);
    expect(next.tick).toBe(state.tick);
    expect(next.speed).toBe(state.speed);
    expect(next.difficulty).toBe(state.difficulty);
    expect(dailyOutput(next, home(next), farm)).toBe(baseline * 10);
    expect(validateInvariants(next)).toEqual([]);
  });

  it('activates only once and survives save and load', () => {
    const state = createNewGame({ seed: 82, mode: 'sandbox' });
    const first = executeCommand(state, { type: 'redeemCheat', code: 'URETIM10X' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = executeCommand(first.state, { type: 'redeemCheat', code: 'URETIM10X' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.cheatProduction10x).toBe(true);
    const saved = createSaveFile(second.state);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = loadSaveFile(saved.file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state.cheatProduction10x).toBe(true);
  });

  it('leaves legacy games at 1x and keeps resource cheat working', () => {
    const state = createNewGame({ seed: 17, mode: 'sandbox' });
    expect(state.cheatProduction10x).toBeUndefined();
    const result = executeCommand(state, { type: 'redeemCheat', code: 'KAYNAK100000' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.cheatStorageBonus).toBe(100000000);
      expect(result.state.cheatProduction10x).toBeUndefined();
    }
  });
});
