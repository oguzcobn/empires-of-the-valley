import { TICK_MS } from '../core/clock';
import type { GameSpeed } from '../core/types';

/**
 * Presentation-only clock: the sim can advance 4x while lighting stays at a
 * gentle, real-time cadence. Never modifies gameplay, dates or resource ticks.
 * Carry its phase across speed changes to avoid a sudden lighting jump.
 */
export function advanceVisualHour(
  previous: number | null,
  gameHour: number,
  dtMs: number,
  speed: GameSpeed,
): number {
  const current = previous ?? gameHour;
  if (speed === 0 || dtMs <= 0) return current;
  return (current + dtMs / TICK_MS) % 24;
}
