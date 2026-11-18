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

const ALWAYS_ON = new Set(['hospital', 'police_station', 'fire_station', 'hotel', 'airport', 'club', 'gas_station', 'inn']);
const SHOPS = new Set(['market', 'mall', 'bank', 'post_office', 'bazaar', 'pharmacy']);
const LEARNING = new Set(['school', 'university', 'kindergarten', 'museum']);
const HOMES = new Set(['hut', 'apartment', 'villa']);

/**
 * Share of a building's windows lit at `hour` (0..1). Homes light up one by one in the evening
 * and go dark after midnight, shops and offices close, emergency services and hotels stay lit.
 * `seed` staggers neighbours so a street never switches on all at once.
 */
export function windowLight(kind: string, hour: number, seed: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const stagger = seed % 3;
  if (ALWAYS_ON.has(kind)) return 1;
  if (HOMES.has(kind)) {
    if (h >= 17 && h < 23) return h - 17 >= stagger ? 1 : 0.35;
    if (h === 23) return seed % 2 ? 0.7 : 0.3;
    if (h >= 5 && h < 8) return h - 5 >= stagger ? 0.65 : 0.15;
    return seed % 5 === 0 ? 0.35 : 0.08;
  }
  if (SHOPS.has(kind)) return h >= 8 && h < 21 ? 1 : kind === 'pharmacy' && seed % 3 === 0 ? 0.7 : 0.08;
  if (LEARNING.has(kind)) return h >= 7 && h < 18 ? 1 : 0.06;
  if (kind === 'restaurant' || kind === 'tea_garden') return h >= 10 || h < 1 ? 1 : 0.1;
  if (kind === 'bakery') return h >= 4 && h < 21 ? 1 : 0.1;
  if (kind === 'gym') return h >= 6 && h < 23 ? 1 : 0.08;
  if (kind === 'factory') return h >= 6 && h < 22 ? 1 : 0.55;
  if (kind === 'corporate_plaza') return h >= 7 && h < 20 ? 1 : seed % 2 ? 0.45 : 0.25;
  return h >= 6 && h < 23 ? 0.9 : 0.4;
}
