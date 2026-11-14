import { describe, expect, it } from 'vitest';
import { RESOURCE_IDS } from '../game/core/types';
import { createNewGame } from '../game/scenarios/newGame';
import { executeCommand } from '../game/systems/commands';
import { homeProvince, storageCaps } from '../game/systems/economy';
import { validateInvariants } from '../game/systems/invariants';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';

describe('KAYNAK100000 settings cheat', () => {
  it('adds 100,000 of each of six resources, expands storage and survives saving', () => {
    const original = createNewGame({ seed: 17, mode: 'sandbox' });
    const before = homeProvince(original).stocks;
    const result = executeCommand(original, { type: 'redeemCheat', code: ' kaynak100000 ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.state;
    for (const id of RESOURCE_IDS) {
      expect(homeProvince(updated).stocks[id]).toBe(before[id] + 100000000);
    }
    expect(updated.cheatStorageBonus).toBe(100000000);
    expect(storageCaps(updated, homeProvince(updated)).wood).toBeGreaterThanOrEqual(homeProvince(updated).stocks.wood);
    expect(validateInvariants(updated)).toEqual([]);
    const saved = createSaveFile(updated);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = loadSaveFile(saved.file);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.state.cheatStorageBonus).toBe(100000000);
  });

  it('rejects invalid codes without changing the save', () => {
    const original = createNewGame({ seed: 17, mode: 'campaign' });
    const result = executeCommand(original, { type: 'redeemCheat', code: 'WRONG' });
    expect(result.ok).toBe(false);
    expect(original.cheatStorageBonus).toBeUndefined();
  });
});
