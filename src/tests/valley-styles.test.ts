import { expect, it } from 'vitest';
import { generateValley } from '../game/systems/terrain';

it('every city style generates a playable valley for many seeds', () => {
  const bad: string[] = [];
  for (const style of ['turkish', 'scottish', 'japanese', 'medieval_european'] as const)
    for (let seed = 1; seed <= 40; seed++) {
      try {
        generateValley(seed, 'home', style);
      } catch {
        bad.push(`${style}:${seed}`);
      }
    }
  expect(bad).toEqual([]);
});
