import { describe, expect, it } from 'vitest';
import { turkishFacade } from './turkishFacade';

describe('Turkish apartment facade', () => {
  it('keeps visuals deterministic across reloads without new save fields', () => {
    expect(turkishFacade(482, 3)).toEqual(turkishFacade(482, 3));
    expect(Object.keys(turkishFacade(482, 3)).sort()).toEqual(['awning', 'glazing', 'panels', 'shopfront']);
  });
  it('varies glass and awnings between different buildings', () => {
    const variants = Array.from({ length: 32 }, (_, i) => turkishFacade(i * 173, 3));
    expect(new Set(variants.map((v) => v.glazing)).size).toBeGreaterThan(1);
    expect(new Set(variants.map((v) => v.awning)).size).toBeGreaterThan(1);
  });
  it('uses the reference-guided muted glazing and canvas palette', () => {
    const glass = new Set([0x91b6c3, 0x739eaf, 0xa1c4cc, 0x6b94a6]);
    const awnings = new Set([0x9e4639, 0x48796d, 0x4a6888, 0xae824c]);
    for (let seed = 0; seed < 64; seed++) {
      const facade = turkishFacade(seed * 173, 3);
      expect(glass.has(facade.glazing)).toBe(true);
      expect(awnings.has(facade.awning)).toBe(true);
    }
  });
  it('does not add shops to starter cottages', () => {
    for (let seed = 0; seed < 20; seed++) expect(turkishFacade(seed, 1).shopfront).toBe(false);
  });
});
