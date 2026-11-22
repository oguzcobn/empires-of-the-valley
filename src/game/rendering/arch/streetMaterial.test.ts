import { describe, expect, it } from 'vitest';
import { streetMaterial } from './streetMaterial';

describe('regional street material rendering', () => {
  it('distinguishes Scottish and Turkish stone, greenery and light warmth', () => {
    const scottish = streetMaterial('scottish');
    const turkish = streetMaterial('turkish');
    expect(scottish.planterStone).not.toBe(turkish.planterStone);
    expect(scottish.lushLeaf).not.toBe(turkish.lushLeaf);
    expect(scottish.lanternGlow).not.toBe(turkish.lanternGlow);
    expect(scottish.flowers).toHaveLength(3);
    expect(turkish.flowers).toHaveLength(3);
  });

  it('is deterministic and requires no simulation or save fields', () => {
    expect(streetMaterial('scottish')).toBe(streetMaterial('scottish'));
    expect(streetMaterial('turkish')).toBe(streetMaterial('turkish'));
  });
});
