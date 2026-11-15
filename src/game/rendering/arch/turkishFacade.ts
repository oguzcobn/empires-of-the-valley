/** Stable Turkish apartment detailing; never stored in saves or used by simulation. */
export interface TurkishFacade {
  glazing: number;
  awning: number;
  shopfront: boolean;
  panels: number;
}
const GLASS = [0x9dc6d3, 0x83b7c7, 0xb3d3db, 0x7ba7b7] as const;
const AWNINGS = [0xa94736, 0x3f7c70, 0x426f9b, 0xc18b48] as const;

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
