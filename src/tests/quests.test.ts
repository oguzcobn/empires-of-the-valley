import { describe, expect, it } from 'vitest';
import { QUESTS } from '../game/data/quests';
import { totalPopulation } from '../game/systems/economy';
import { activeQuestId, evaluateQuests } from '../game/systems/quests';
import { build, days, home, must, newCampaign, tweak } from './helpers';
import { playChapterOne } from './playthrough';

describe('chapter 1 quest chain', () => {
  it('only the first quest is active at the start', () => {
    const s = newCampaign();
    expect(activeQuestId(s)).toBe('q01');
    expect(Object.values(s.questProgress).filter((q) => q!.status === 'locked')).toHaveLength(QUESTS.length - 1);
  });

  it('can be completed in order by a scripted playthrough, without softlocks', () => {
    for (const seed of [42, 7, 2024]) {
      const { state, log } = playChapterOne(seed);
      const ticks = QUESTS.filter((q) => q.chapter === 1).map((q) => state.questProgress[q.id]!.completedTick);
      expect(
        ticks.every((t) => t !== null),
        `seed ${seed}: ${JSON.stringify(ticks)}\n${log.join('\n')}`,
      ).toBe(true);
      for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThanOrEqual(ticks[i - 1]!);
      expect(state.completedChapters).toEqual([1]);
      expect(state.revealedProvinceIds).toContain('cinar_ormani');
      expect(totalPopulation(home(state))).toBeGreaterThanOrEqual(20);
      expect(state.eventLog.filter((e) => e.key === 'event.chapterComplete')).toHaveLength(1);
    }
  });

  it('opens chapter 2 after the first chapter and restores missing quests in old saves', () => {
    const { state } = playChapterOne(42);
    expect(state.completedChapters).toContain(1);
    expect(activeQuestId(state)).toBe('q09');
    const oldSave = tweak(state, (d) => {
      delete d.questProgress.q09;
      delete d.questProgress.q10;
      delete d.questProgress.q11;
      delete d.questProgress.q12;
      evaluateQuests(d);
    });
    expect(activeQuestId(oldSave)).toBe('q09');
    expect(oldSave.questProgress.q10?.status).toBe('locked');
  });

  it('grants each reward exactly once', () => {
    let s = build(newCampaign(), 'lumber_camp').state;
    const goldBefore = home(s).stocks.gold;
    s = days(s, 3);
    expect(s.questProgress.q01).toMatchObject({ status: 'completed', rewardGranted: true });
    const goldAfter = home(s).stocks.gold;
    expect(goldAfter).toBeGreaterThanOrEqual(goldBefore + 15000);
    // re-evaluating, even many times, never pays again
    const again = tweak(s, (d) => {
      for (let i = 0; i < 5; i++) evaluateQuests(d);
    });
    expect(home(again).stocks.gold).toBe(goldAfter);
    // demolishing and rebuilding the camp does not re-trigger the quest
    const camp = home(s).buildings.find((b) => b.definitionId === 'lumber_camp')!;
    let rebuilt = must(s, { type: 'demolishBuilding', instanceId: camp.id });
    rebuilt = days(build(rebuilt, 'lumber_camp').state, 3);
    const questEvents = rebuilt.eventLog.filter(
      (e) => e.key === 'event.questComplete' && e.params?.title === '@quest.q01.title',
    );
    expect(questEvents).toHaveLength(1);
  });

  it('purchased wood does not count as gathered wood', () => {
    let s = days(build(newCampaign(), 'lumber_camp').state, 3);
    s = must(s, { type: 'trade', offerId: 'buy_wood' });
    expect(s.questProgress.q02!.counters[1]).toBe(0);
  });

  it('the food streak resets on a deficit day', () => {
    let s = tweak(newCampaign(), (d) => {
      d.questProgress.q01!.status = 'completed';
      d.questProgress.q01!.rewardGranted = true;
      d.questProgress.q02!.status = 'completed';
      d.questProgress.q02!.rewardGranted = true;
      d.questProgress.q03!.status = 'completed';
      d.questProgress.q03!.rewardGranted = true;
      d.questProgress.q04!.status = 'active';
      d.questProgress.q04!.counters[0] = 5;
    });
    s = days(s, 1); // no farm: net food is negative
    expect(s.questProgress.q04!.counters[0]).toBe(0);
  });

  it('sandbox has no quests', () => {
    const s = days(
      tweak(newCampaign(), (d) => void (d.mode = 'sandbox')),
      5,
    );
    expect(s.eventLog.some((e) => e.kind === 'quest')).toBe(false);
  });
});
