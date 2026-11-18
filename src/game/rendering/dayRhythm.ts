/**
 * How busy the streets are through the day (share of the full traffic and crowd, 0..1).
 * Morning and evening rush hours peak, the small hours are almost empty. Visual only.
 */
const TRAFFIC = [0.15, 0.1, 0.1, 0.1, 0.15, 0.3, 0.6, 1, 1, 0.9, 0.7, 0.65, 0.75, 0.7, 0.65, 0.7, 0.9, 1, 1, 0.85, 0.6, 0.5, 0.35, 0.25];
const WALKERS = [0.1, 0.05, 0.05, 0.05, 0.05, 0.15, 0.4, 0.75, 0.85, 0.8, 0.9, 1, 1, 1, 0.95, 0.95, 1, 1, 0.95, 0.85, 0.7, 0.5, 0.3, 0.2];

const at = (table: readonly number[], hour: number): number => table[((Math.floor(hour) % 24) + 24) % 24]!;

export const trafficShare = (hour: number): number => at(TRAFFIC, hour);
export const walkerShare = (hour: number): number => at(WALKERS, hour);

/** Opening hours of venues that only make sense at certain times (lights, queues, terraces). */
export function isOpen(kind: 'club' | 'restaurant' | 'market' | 'school', hour: number): boolean {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (kind === 'club') return h >= 21 || h < 4;
  if (kind === 'restaurant') return h >= 11 && h < 24;
  if (kind === 'market') return h >= 8 && h < 22;
  return h >= 8 && h < 16;
}
