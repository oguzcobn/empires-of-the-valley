import { describe, expect, it } from 'vitest';
import { TURKISH_HUT_RAILINGS, turkishHutRailing } from '../game/rendering/arch/turkishHousing';
import { defaultLook } from '../game/data/architecture';

describe('Turkish apartment visual progression', () => {
  it('assigns distinct railings to the three approved hut levels', () => {
    expect([1, 2, 3].map(turkishHutRailing)).toEqual([...TURKISH_HUT_RAILINGS]);
    expect(new Set(TURKISH_HUT_RAILINGS).size).toBe(3);
    expect(defaultLook('turkish', 'hut', 2).balcony).toBe('iron');
  });

  it('clamps out-of-range levels without touching save data', () => {
    expect(turkishHutRailing(0)).toBe(TURKISH_HUT_RAILINGS[0]);
    expect(turkishHutRailing(99)).toBe(TURKISH_HUT_RAILINGS[2]);
  });
});
