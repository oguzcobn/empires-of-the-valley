import { describe, expect, it } from 'vitest';
import { advanceClock } from '../game/core/clock';
import type { GameSpeed, GameState } from '../game/core/types';
import { applyTick, applyTicks } from '../game/systems/tick';
import { buildAndStaff, must, newCampaign } from './helpers';
import { playChapterOne } from './playthrough';

function scripted(seed: number): GameState {
  let s = buildAndStaff(newCampaign(seed), 'lumber_camp', 2).state;
  s = buildAndStaff(s, 'farm', 3).state;
  return applyTicks(s, 24 * 20);
}

/** Drives the simulation through the real-time clock at a given speed and frame time. */
function runAtSpeed(start: GameState, speed: GameSpeed, frameMs: number, targetTicks: number): GameState {
  let s = must(start, { type: 'setGameSpeed', speed });
  let acc = 0;
  let done = 0;
  while (done < targetTicks) {
    const step = advanceClock(acc, frameMs, s.speed);
    acc = step.accumulator;
    for (let i = 0; i < step.ticks && done < targetTicks; i++, done++) s = applyTick(s);
  }
  return must(s, { type: 'setGameSpeed', speed: 0 });
}

describe('determinism', () => {
  it('same seed and commands give identical states', () => {
    expect(scripted(11)).toEqual(scripted(11));
    expect(playChapterOne(42).state).toEqual(playChapterOne(42).state);
  });

  it('different seeds diverge', () => {
    expect(scripted(11)).not.toEqual(scripted(12));
  });

  it('1x, 2x and 4x produce identical results for equal tick counts at any frame rate', () => {
    const start = buildAndStaff(newCampaign(3), 'lumber_camp', 2).state;
    const a = runAtSpeed(start, 1, 16, 24 * 12);
    const b = runAtSpeed(start, 2, 33, 24 * 12);
    const c = runAtSpeed(start, 4, 7, 24 * 12);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('ticks never mutate the previous state', () => {
    const s = newCampaign(5);
    const frozen = JSON.stringify(s);
    applyTicks(s, 48);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
