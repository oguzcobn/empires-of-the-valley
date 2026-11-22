import { describe, expect, it } from 'vitest';
import type { GameState, SurpriseKind } from '../game/core/types';
import { createSaveFile, parseSaveText } from '../game/save/serialize';
import { startCitySurprise, surpriseTimeline } from '../game/systems/citySurprises';
import { tileAt } from '../game/systems/grid';
import { applyTicks } from '../game/systems/tick';
import { buildAndStaff, expectValid, home, must, newCampaign, tweak } from './helpers';

function begin(s: GameState, kind: SurpriseKind): GameState {
  return tweak(s, draft => {
    expect(startCitySurprise(draft, home(draft), kind), kind).toBe(true);
  });
}

function load(state: GameState): GameState {
  const saved = createSaveFile(state);
  if (!saved.ok) throw new Error('Save failed');
  const loaded = parseSaveText(JSON.stringify(saved.file));
  if (!loaded.ok) throw new Error('Reload failed');
  return loaded.state;
}

describe('city surprises', () => {
  it('schedules a rare UFO visit and resumes the same visit after saving', () => {
    const initial = newCampaign(42);
    expect(applyTicks(initial, 14 * 24).surprise).toBeUndefined();
    const start = begin(initial, 'ufo');
    const event = start.surprise!;
    expect(event.walk.length).toBeGreaterThan(3);
    const midway = applyTicks(start, surpriseTimeline(event).landing + 2);
    const remaining = surpriseTimeline(event).departure - (midway.tick - event.startedAt);
    const finished = applyTicks(midway, remaining);
    expect(applyTicks(load(midway), remaining)).toEqual(finished);
    expect(finished.surprise).toBeUndefined();
    expect(finished.nextSurpriseKind).toBe('pirates');
    expect(home(finished).buildings.map(b => b.id)).toEqual(home(start).buildings.map(b => b.id));
  });

  it('defers scheduled pirate attacks until chapter one is complete', () => {
    const setup = tweak(newCampaign(42), draft => {
      draft.tick = 24 * 28 + 9;
      draft.nextSurpriseTick = draft.tick;
      draft.nextSurpriseKind = 'pirates';
    });
    const next = applyTicks(setup, 1);
    expect(next.surprise).toBeUndefined();
    expect(next.nextSurpriseTick).toBeGreaterThan(next.tick);
  });

  it.each([[0, false], [100, false], [101, true]] as const)('ships from water and resolves a %i-soldier defense exactly once', (force, victory) => {
    const initial = buildAndStaff(newCampaign(42), 'hut', 0).state;
    const start = begin(tweak(initial, draft => { draft.militia = force; }), 'pirates');
    const event = start.surprise!;
    expect(event.approach.every(([x, y]) => ['water', 'lake'].includes(tileAt(home(start), x, y)?.terrain ?? ''))).toBe(true);
    expect(event.walk.every(([x, y]) => !['water', 'lake'].includes(tileAt(home(start), x, y)?.terrain ?? ''))).toBe(true);
    const end = applyTicks(load(start), surpriseTimeline(event).resolution);
    expect(end.surprise?.outcome).toBe(victory ? 'repelled' : 'breached');
    const expectedLosses = Math.min(force, victory ? 3 : 8);
    expect(end.militia).toBe(force - expectedLosses);
    expect(home(end).buildings.filter(b => b.definitionId === 'hut').length)
      .toBe(home(start).buildings.filter(b => b.definitionId === 'hut').length - (victory ? 0 : force < 50 ? 2 : 1));
    expect(applyTicks(load(end), 1).militia).toBe(force - expectedLosses);
    expectValid(end);
  });

  it('can train enough guards to reach the victory threshold through normal commands', () => {
    const watch = buildAndStaff(newCampaign(42), 'watchtower', 0).state;
    const funded = tweak(watch, draft => {
      draft.militia = 100;
      home(draft).stocks.gold = Math.max(home(draft).stocks.gold, 10000);
      home(draft).stocks.food = Math.max(home(draft).stocks.food, 5000);
    });
    expect(must(funded, { type: 'recruitMilitia', amount: 5 }).militia).toBe(105);
  });
});
