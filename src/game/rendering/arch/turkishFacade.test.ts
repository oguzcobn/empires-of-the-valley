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
  it('does not add shops to starter cottages', () => {
    for (let seed = 0; seed < 20; seed++) expect(turkishFacade(seed, 1).shopfront).toBe(false);
  });
});
