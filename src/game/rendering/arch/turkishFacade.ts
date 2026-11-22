/** Stable Turkish apartment detailing; never stored in saves or used by simulation. */
export interface TurkishFacade {
  glazing: number;
  awning: number;
  shopfront: boolean;
  panels: number;
}
/** Muted blue-grey glazing avoids the overly bright cyan look at village zoom. */
const GLASS = [0x91b6c3, 0x739eaf, 0xa1c4cc, 0x6b94a6] as const;
/** Canvas and painted-metal tones, varied by stable building seed. */
const AWNINGS = [0x9e4639, 0x48796d, 0x4a6888, 0xae824c] as const;

/** Visual variation is deterministic for each building seed and level. */
export function turkishFacade(seed: number, level: number): TurkishFacade {
  const n = (seed >>> 0) ^ Math.imul(Math.max(1, Math.floor(level)), 0x9e3779b1);
  return {
    glazing: GLASS[(n >>> 3) & 3]!,
    awning: AWNINGS[(n >>> 7) & 3]!,
    shopfront: level >= 2 && (n & 3) === 0,
    panels: 2 + ((n >>> 11) & 1),
  };
}
