import { describe, expect, it } from 'vitest';
import { createNewGame } from '../game/scenarios/newGame';
import { DIFFICULTY_RULES, difficultyOf } from '../game/data/difficulty';
import { dailyOutput } from '../game/systems/economy';
import { applyTick } from '../game/systems/tick';
import { build, buildAndStaff, home, newCampaign, tweak } from './helpers';

describe('difficulty and independent clock speed', () => {
  it('normal is the default for old saves', () => {
    expect(difficultyOf(undefined)).toBe('normal');
    expect(createNewGame({ mode: 'sandbox', seed: 19 }).difficulty).toBe('normal');
    expect(DIFFICULTY_RULES.normal.constructionWorkPerHour).toBe(3);
  });

  it.each([
    ['easy', 5],
    ['normal', 3],
    ['hard', 2],
  ] as const)('%s construction progresses %i units per game hour', (difficulty, work) => {
    const initial = tweak(newCampaign(), (draft) => { draft.difficulty = difficulty; });
    const { state, id } = build(initial, 'hut');
    const next = applyTick(state);
    expect(home(next).buildings.find((b) => b.id === id)?.progressTicks).toBe(work);
    expect(next.tick).toBe(state.tick + 1);
  });

  it('difficulty scales staffed daily production but not the time counter', () => {
    const { state, id } = buildAndStaff(newCampaign(73), 'lumber_camp', 2);
    const b = home(state).buildings.find((entry) => entry.id === id)!;
    const production = (difficulty: 'easy' | 'normal' | 'hard') => {
      const game = tweak(state, (draft) => { draft.difficulty = difficulty; });
      return dailyOutput(game, home(game), b);
    };
    expect(production('easy')).toBe(6000);
    expect(production('normal')).toBe(4000);
    expect(production('hard')).toBe(3000);
  });
});
