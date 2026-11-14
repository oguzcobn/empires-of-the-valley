import { describe, expect, it } from 'vitest';
import { turkishBalconyDetail, turkishHutRailing } from '../game/rendering/arch/turkishHousing';
import { defaultLook } from '../game/data/architecture';

describe('Turkish apartment lived-in balcony details', () => {
  it('alternates laundry and plants deterministically across floors', () => {
    expect([1, 2, 3, 4, 5, 6].map(turkishBalconyDetail)).toEqual([
      'laundry', 'plant', 'laundry', 'plant', 'laundry', 'plant',
    ]);
  });

  it('preserves existing three-level hut appearances and railing colours', () => {
    for (const level of [1, 2, 3]) {
      expect(defaultLook('turkish', 'hut', level).balcony).toBe('iron');
      expect(typeof turkishHutRailing(level)).toBe('number');
    }
  });
});
