import { describe, expect, it } from 'vitest';
import { makeRng } from '../game/core/rng';
import { RESOURCE_IDS } from '../game/core/types';
import type { GameState } from '../game/core/types';
import { TRADE_OFFERS } from '../game/data/balance';
import { BUILDABLE_IDS } from '../game/data/buildings';
import { TECH_IDS } from '../game/data/technologies';
import { executeCommand } from '../game/systems/commands';
import type { Command } from '../game/systems/commands';
import { totalPopulation } from '../game/systems/economy';
import { applyTicks } from '../game/systems/tick';
import { days, expectValid, home, newCampaign } from './helpers';
import { playChapterOne } from './playthrough';

describe('balance smoke simulation', () => {
  it('starting food feeds a passive, growing village for more than 20 days', () => {
    const s = days(newCampaign(1), 21);
    expect(home(s).population.starvationDays).toBe(0);
    expect(home(s).stocks.food).toBeGreaterThanOrEqual(0);
    expectValid(s);
  });

  it('doing nothing for 60 days is survivable and recoverable (no hard fail in early game)', () => {
    const s = days(newCampaign(1), 60);
    expectValid(s);
    expect(totalPopulation(home(s))).toBeGreaterThanOrEqual(6);
    // the merchant is always a way back: gold keeps accruing
    expect(home(s).stocks.gold).toBeGreaterThan(40000);
    expect(executeCommand(s, { type: 'trade', offerId: 'buy_food' }).ok).toBe(true);
  });

  it('a guided player finishes chapter 1 before the first winter', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { state } = playChapterOne(seed);
      expect(state.completedChapters, `seed ${seed}`).toContain(1);
      expect(state.tick).toBeLessThan(90 * 24);
    }
  });

  it('random legal and illegal commands never break invariants (fuzz, 60 days)', () => {
    for (const seed of [101, 202, 303]) {
      const rng = makeRng(seed);
      let s: GameState = newCampaign(seed);
      let accepted = 0;
      for (let step = 0; step < 60 * 6; step++) {
        const p = home(s);
        const pick = rng.int(10);
        const any = p.buildings[rng.int(p.buildings.length)]!;
        const x = rng.int(24);
        const y = rng.int(24);
        const cmd: Command =
          pick === 0
            ? { type: 'placeBuilding', buildingId: BUILDABLE_IDS[rng.int(BUILDABLE_IDS.length)]!, x, y }
            : pick <= 2
              ? { type: 'placeRoad', x, y }
              : pick === 3
                ? { type: 'assignWorkers', instanceId: any.id, workers: rng.int(5) }
                : pick === 4
                  ? { type: 'demolishBuilding', instanceId: any.id }
                  : pick === 5
                    ? { type: 'upgradeBuilding', instanceId: any.id }
                    : pick === 6
                      ? { type: 'trade', offerId: TRADE_OFFERS[rng.int(TRADE_OFFERS.length)]!.id }
                      : pick === 7
                        ? { type: 'queueResearch', techId: TECH_IDS[rng.int(TECH_IDS.length)]! }
                        : pick === 8
                          ? { type: 'cancelConstruction', instanceId: any.id }
                          : { type: 'removeRoad', x, y };
        const result = executeCommand(s, cmd);
        if (result.ok) {
          s = result.state;
          accepted++;
        }
        s = applyTicks(s, 4);
        expectValid(s);
        for (const id of RESOURCE_IDS) expect(home(s).stocks[id]).toBeGreaterThanOrEqual(0);
      }
      expect(accepted).toBeGreaterThan(20);
    }
  });
});
