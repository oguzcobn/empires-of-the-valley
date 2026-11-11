import { describe, expect, it } from 'vitest';
import { advanceClock, TICK_MS } from '../game/core/clock';
import { portion, u } from '../game/core/fixed';
import { makeRng, rngInt, seedToState } from '../game/core/rng';
import { calendar, daysUntilWinter } from '../game/core/time';

describe('fixed-point', () => {
  it('hourly portions sum to exactly the daily rate', () => {
    for (const rate of [0, 1, 7, 250, 3000, 4000, 6666, 12345]) {
      let sum = 0;
      for (let h = 0; h < 24; h++) sum += portion(rate, h);
      expect(sum).toBe(rate);
    }
  });
  it('converts units to integers', () => {
    expect(u(0.25)).toBe(250);
    expect(Number.isInteger(u(0.03))).toBe(true);
  });
});

describe('rng', () => {
  it('is reproducible and bounded', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    const seqA = Array.from({ length: 50 }, () => a.int(100));
    expect(seqA).toEqual(Array.from({ length: 50 }, () => b.int(100)));
    expect(seqA.every((n) => n >= 0 && n < 100)).toBe(true);
    expect(new Set(seqA).size).toBeGreaterThan(20);
  });
  it('resumes from a stored state', () => {
    const holder = { rngState: seedToState(99) };
    rngInt(holder, 10);
    const snapshot = { rngState: holder.rngState };
    expect(rngInt(holder, 1000)).toBe(rngInt(snapshot, 1000));
  });
});

describe('calendar', () => {
  it('maps ticks to days and seasons', () => {
    expect(calendar(0)).toMatchObject({ day: 0, hour: 0, season: 'spring', dayOfSeason: 1, year: 1 });
    expect(calendar(30 * 24).season).toBe('summer');
    expect(calendar(90 * 24).season).toBe('winter');
    expect(calendar(120 * 24)).toMatchObject({ season: 'spring', year: 2 });
    expect(daysUntilWinter(0)).toBe(90);
    expect(daysUntilWinter(95 * 24)).toBe(0);
  });
});

describe('clock', () => {
  it('produces no ticks while paused', () => {
    expect(advanceClock(400, 10_000, 0)).toEqual({ ticks: 0, accumulator: 0 });
  });
  it('scales with speed and is frame-rate independent', () => {
    const run = (frameMs: number, speed: 1 | 2 | 4): number => {
      let acc = 0;
      let ticks = 0;
      for (let t = 0; t < 10_000; t += frameMs) {
        const step = advanceClock(acc, frameMs, speed);
        acc = step.accumulator;
        ticks += step.ticks;
      }
      return ticks;
    };
    expect(run(16, 1)).toBe(run(50, 1));
    expect(run(20, 1)).toBe(10_000 / TICK_MS);
    expect(run(20, 4)).toBe((10_000 / TICK_MS) * 4);
  });
  it('does not catch up after a long background gap', () => {
    expect(advanceClock(0, 60_000, 4).ticks).toBeLessThanOrEqual(2);
  });
});
