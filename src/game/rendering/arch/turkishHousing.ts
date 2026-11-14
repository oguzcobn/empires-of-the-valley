/** Distinct balcony railing colours from the approved Turkish apartment progression.
 * These are rendering-only constants: no changes to building IDs or saved data.
 */
export const TURKISH_HUT_RAILINGS = [0x6b6258, 0x5299c5, 0xc66d58] as const;

export function turkishHutRailing(level: number): number {
  return TURKISH_HUT_RAILINGS[Math.max(0, Math.min(2, Math.floor(level) - 1))]!;
}

/** Deterministic balcony decoration; does not affect simulation or save schema. */
export function turkishBalconyDetail(floor: number): 'plant' | 'laundry' {
  return Math.max(1, Math.floor(floor)) % 2 === 0 ? 'plant' : 'laundry';
}
