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

/** 0 = daylight, 1 = darkness. Always uses the SAME hour as the HUD. */
export function nightFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Sunrise starts at 05:00, daylight is established by 06:00.
  if (h >= 5 && h < 6) return 0.65 * (6 - h);
  if (h >= 6 && h < 19) return 0;
  // Sunset starts exactly at 19:00, true night by 20:00.
  if (h >= 19 && h < 20) return 0.32 + 0.68 * (h - 19);
  return 1;
}
