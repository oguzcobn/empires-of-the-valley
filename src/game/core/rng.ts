/**
 * Deterministic seeded PRNG (mulberry32 variant). The whole generator state is one uint32 that
 * lives inside GameState, so saves restore randomness exactly.
 */
export interface RngHolder {
  rngState: number;
}

export function seedToState(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 || 1;
}

function output(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Advances the holder's state and returns an integer in [0, n). */
export function rngInt(holder: RngHolder, n: number): number {
  holder.rngState = (holder.rngState + 0x6d2b79f5) >>> 0;
  return output(holder.rngState) % n;
}

export interface LocalRng {
  int(n: number): number;
  chance(permille: number): boolean;
}

/** Stand-alone generator for content generation (terrain); does not touch game state. */
export function makeRng(seed: number): LocalRng {
  const holder: RngHolder = { rngState: seedToState(seed) };
  return {
    int: (n) => rngInt(holder, n),
    chance: (permille) => rngInt(holder, 1000) < permille,
  };
}
