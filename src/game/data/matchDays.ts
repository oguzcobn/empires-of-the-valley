import type { GameState } from '../core/types';
import { TICKS_PER_DAY } from '../core/time';

export type FootballTeam = 'trabzonspor' | 'hearts' | 'celtic' | 'rangers';
export interface MatchDay {
  team: FootballTeam;
  teamName: string;
  home: boolean;
  day: number;
  jersey: number;
  stripe: number;
  pattern: 'vertical' | 'horizontal' | 'solid';
}

const CLUBS: Record<FootballTeam, Omit<MatchDay, 'day' | 'home'>> = {
  trabzonspor: { team: 'trabzonspor', teamName: 'Trabzonspor', jersey: 0x8f2446, stripe: 0x61b9dc, pattern: 'vertical' },
  hearts: { team: 'hearts', teamName: 'Hearts', jersey: 0x85304b, stripe: 0xffffff, pattern: 'solid' },
  celtic: { team: 'celtic', teamName: 'Celtic', jersey: 0xf5f5ef, stripe: 0x139155, pattern: 'horizontal' },
  rangers: { team: 'rangers', teamName: 'Rangers', jersey: 0x3065c5, stripe: 0xf1f1f1, pattern: 'solid' },
};

/** Fictional, in-game match days, NOT actual fixture results or live schedules. */
export function matchDayFor(game: Pick<GameState, 'tick' | 'cityId' | 'culture'>): MatchDay | null {
  const day = Math.floor(game.tick / TICKS_PER_DAY);
  if (day < 3 || day % 7 !== 3) return null;
  const city = game.cityId ?? (game.culture === 'scottish' ? 'edinburgh' : game.culture === 'turkish' ? 'trabzon' : null);
  // Fictional fan events belong only to the two cities that actually have these clubs.
  if (city !== 'trabzon' && city !== 'edinburgh') return null;
  const isEdinburgh = city === 'edinburgh';
  const team: FootballTeam = isEdinburgh
    ? ((['hearts', 'celtic', 'rangers'] as const)[Math.floor(day / 7) % 3] ?? 'hearts')
    : 'trabzonspor';
  return { ...CLUBS[team], home: !isEdinburgh || team === 'hearts', day };
}
