import { describe, expect, it } from 'vitest';
import { calendar } from '../game/core/time';
import { TICK_MS, advanceClock } from '../game/core/clock';
import { applyTick, applyTicks, requiredTicks } from '../game/systems/tick';
import { build, home, newCampaign } from './helpers';

describe('faster construction without faster day and night', () => {
  it('advances ordinary construction three units per in-game hour', () => {
    const placed = build(newCampaign(42), 'hut');
    const initial = home(placed.state).buildings.find((b) => b.id === placed.id)!;
    expect(initial.state).toBe('construction');
    const needed = requiredTicks(initial);
    const first = applyTick(placed.state);
    const oneTick = home(first).buildings.find((b) => b.id === placed.id)!;
    expect(oneTick.progressTicks).toBe(3);
    expect(calendar(first.tick).hour).toBe(1);
    const completed = applyTicks(first, Math.ceil(needed / 3) - 1);
    const house = home(completed).buildings.find((b) => b.id === placed.id)!;
    expect(house.state).toBe('active');
    expect(completed.tick).toBe(Math.ceil(needed / 3));
  });

  it('keeps the independent 24-second day at 4x', () => {
    expect(TICK_MS).toBe(4000);
    // Exactly one game hour at 4x per 1000ms wall clock.
    expect(advanceClock(0, 250, 4).ticks).toBe(0);
    expect(advanceClock(0, 250, 4).accumulator).toBe(1000);
  });
});
