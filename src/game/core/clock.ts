import type { GameSpeed } from './types';

/** One game day is 96 seconds at 1x and 24 seconds at 4x. */
export const TICK_MS = 4000;
/** A single frame never contributes more than this, so a backgrounded tab cannot "catch up". */
export const MAX_FRAME_MS = 250;
export const MAX_TICKS_PER_FRAME = 8;

export interface ClockStep {
  ticks: number;
  accumulator: number;
}

/**
 * Fixed-timestep accumulator. Converts elapsed real time into whole simulation ticks.
 * Paused (speed 0) yields no ticks and keeps no debt; offline progression is disabled by design.
 */
export function advanceClock(accumulator: number, dtMs: number, speed: GameSpeed): ClockStep {
  if (speed === 0 || !(dtMs > 0)) return { ticks: 0, accumulator: speed === 0 ? 0 : accumulator };
  let acc = accumulator + Math.min(dtMs, MAX_FRAME_MS) * speed;
  const ticks = Math.min(Math.floor(acc / TICK_MS), MAX_TICKS_PER_FRAME);
  acc -= ticks * TICK_MS;
  if (acc > TICK_MS) acc = TICK_MS;
  return { ticks, accumulator: acc };
}
