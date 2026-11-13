import type { Season } from '../core/time';

export type Weather = 'clear' | 'overcast' | 'rain' | 'snow';

/**
 * Visual-only weather, a pure function of the seed and the day so a reloaded game shows the same
 * sky. The economy never reads it (seasons already drive crops and consumption).
 */
export function weatherFor(seed: number, day: number, season: Season): Weather {
  let h = Math.imul((seed ^ 0x27d4eb2d) + day * 0x165667b1, 0x85ebca6b);
  h ^= h >>> 13;
  const r = ((h >>> 0) % 1000) / 1000;
  if (season === 'winter') return r < 0.38 ? 'snow' : r < 0.6 ? 'overcast' : 'clear';
  if (season === 'autumn') return r < 0.3 ? 'rain' : r < 0.55 ? 'overcast' : 'clear';
  if (season === 'spring') return r < 0.22 ? 'rain' : r < 0.4 ? 'overcast' : 'clear';
  return r < 0.1 ? 'rain' : r < 0.2 ? 'overcast' : 'clear';
}

/** 0 = full daylight, 1 = deep night, smooth dusk and dawn. */
export function nightFactor(hour: number): number {
  if (hour >= 7 && hour <= 18) return 0;
  if (hour > 18 && hour < 21) return (hour - 18) / 3;
  if (hour >= 5 && hour < 7) return (7 - hour) / 2;
  return 1;
}
