export const TICKS_PER_DAY = 24;
export const DAYS_PER_SEASON = 30;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

export interface Calendar {
  /** Completed days since game start (0-based). */
  day: number;
  hour: number;
  dayOfSeason: number;
  season: Season;
  seasonIndex: number;
  year: number;
}

export function calendar(tick: number): Calendar {
  const day = Math.floor(tick / TICKS_PER_DAY);
  const dayOfYear = day % DAYS_PER_YEAR;
  const seasonIndex = Math.floor(dayOfYear / DAYS_PER_SEASON);
  return {
    day,
    hour: tick % TICKS_PER_DAY,
    dayOfSeason: (dayOfYear % DAYS_PER_SEASON) + 1,
    season: SEASONS[seasonIndex]!,
    seasonIndex,
    year: Math.floor(day / DAYS_PER_YEAR) + 1,
  };
}

/** Days until the next winter begins (0 while it is winter). */
export function daysUntilWinter(tick: number): number {
  const day = Math.floor(tick / TICKS_PER_DAY) % DAYS_PER_YEAR;
  const winterStart = DAYS_PER_SEASON * 3;
  return day >= winterStart ? 0 : winterStart - day;
}

/**
 * Clock shown to the player and used for daylight. The simulation day starts at dawn (06:00),
 * so a new game opens in the morning; day boundaries, crops and consumption are unchanged.
 */
export const DAWN_HOUR = 6;
export const clockHour = (tick: number): number => ((tick % TICKS_PER_DAY) + DAWN_HOUR) % TICKS_PER_DAY;
