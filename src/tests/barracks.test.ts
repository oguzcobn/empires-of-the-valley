import { describe, expect, it } from 'vitest';
import { createNewGame } from '../game/scenarios/newGame';
import { executeCommand } from '../game/systems/commands';
import { BUILDINGS } from '../game/data/buildings';
import { homeProvince } from '../game/systems/economy';
import { applyTicks } from '../game/systems/tick';
import { findSite } from '../game/systems/placement';
import { securityDayEnd } from '../game/systems/security';
import { produce } from 'immer';

describe('barracks training', () => {
  it('has a buildable military training facility', () => {
    expect(BUILDINGS.barracks.buildable).toBe(true);
    expect(BUILDINGS.barracks.levels[0]?.workerSlots).toBe(2);
  });

  it('can train troops from staffed barracks with resources', () => {
    const game = produce(createNewGame({ seed: 42, mode: 'sandbox' }), (draft) => {
      homeProvince(draft).population.adults += 10; // Meets barracks population requirement.
    });
    const p = homeProvince(game);
    const plan = findSite(p, BUILDINGS.barracks);
    expect(plan).not.toBeNull();
    if (!plan) return;
    const placed = executeCommand(game, { type: 'placeBuilding', buildingId: 'barracks', x: plan.x, y: plan.y });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const built = applyTicks(placed.state, 5 * 24);
    const staffed = produce(built, (draft) => {
      const barracks = homeProvince(draft).buildings.at(-1)!;
      barracks.workers = 2;
    });
    const before = homeProvince(staffed).stocks;
    const next = produce(staffed, (draft) => securityDayEnd(draft, homeProvince(draft)));
    expect(next.militia).toBe((staffed.militia ?? 0) + 2);
    expect(homeProvince(next).stocks.gold).toBe(before.gold - 4000 - next.militia! * 40);
    expect(homeProvince(next).stocks.food).toBe(before.food - 2000);
  });
});
