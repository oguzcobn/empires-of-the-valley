/**
 * Fixed-point helpers. Every resource quantity in the simulation is an integer number of
 * milli-units (1 unit = 1000). No floating point value is ever stored in the game state.
 */
export const UNIT = 1000;

/** Whole (possibly fractional) units -> integer milli-units. Used only for static data. */
export const u = (units: number): number => Math.round(units * UNIT);

/** Integer milli-units -> display number. Used only by UI. */
export const fromFixed = (milli: number): number => milli / UNIT;

/**
 * Splits an integer daily rate over the hours of a day without losing or creating anything:
 * the 24 hourly portions always sum to exactly `ratePerDay`.
 */
export function portion(ratePerDay: number, hour: number, ticksPerDay = 24): number {
  return Math.floor((ratePerDay * (hour + 1)) / ticksPerDay) - Math.floor((ratePerDay * hour) / ticksPerDay);
}

/** value * permille / 1000, floored (integer safe). */
export const mulPermille = (value: number, permille: number): number => Math.floor((value * permille) / 1000);
