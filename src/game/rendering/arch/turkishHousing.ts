/** Distinct balcony railing colours from the approved Turkish apartment progression.
 * These are rendering-only constants: no changes to building IDs or saved data.
 */
export const TURKISH_HUT_RAILINGS = [0x6b6258, 0x5299c5, 0xc66d58] as const;

export function turkishHutRailing(level: number): number {
  return TURKISH_HUT_RAILINGS[Math.max(0, Math.min(2, Math.floor(level) - 1))]!;
}
