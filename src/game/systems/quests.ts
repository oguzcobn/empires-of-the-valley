import type { GameState, Objective, Province, QuestId, QuestProgress, ResourceId } from '../core/types';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { homeProvince, isBuilt, storageCaps, totalPopulation } from './economy';
import { logEvent } from './events';

export function initialQuestProgress(): Partial<Record<QuestId, QuestProgress>> {
  const out: Partial<Record<QuestId, QuestProgress>> = {};
  for (const q of QUESTS) {
    out[q.id] = {
      status: q.prerequisites.length === 0 ? 'active' : 'locked',
      counters: q.objectives.map(() => 0),
      rewardGranted: false,
      completedTick: null,
    };
  }
  return out;
}

/**
 * Extends an older save with quests introduced in later releases.
 * Previous quest states, counters and rewards are never reset or re-granted.
 * Call before save validation, not only on the next simulation tick.
 */
export function ensureQuestProgress(s: GameState): void {
  if (s.mode !== 'campaign') return;
  for (const q of QUESTS) {
    if (s.questProgress[q.id]) continue;
    s.questProgress[q.id] = {
      status: q.prerequisites.every((id) => s.questProgress[id]?.status === 'completed') ? 'active' : 'locked',
      counters: q.objectives.map(() => 0),
      rewardGranted: false,
      completedTick: null,
    };
  }
}

/** Current/target value of one objective — the single source of truth for logic and UI. */
export function objectiveProgress(
  s: GameState,
  objective: Objective,
  counter: number,
): { current: number; target: number } {
  const p = homeProvince(s);
  switch (objective.type) {
    case 'buildingCount':
      return {
        current: p.buildings.filter((b) => b.definitionId === objective.buildingId && isBuilt(b)).length,
        target: objective.count,
      };
    case 'staffedBuilding':
      return {
        current: Math.max(
          0,
          ...p.buildings
            .filter((b) => b.definitionId === objective.buildingId && isBuilt(b))
            .map((b) => b.workers),
        ),
        target: objective.workers,
      };
    case 'resourceGathered':
      return { current: counter, target: objective.amount };
    case 'foodBalanceStreak':
      return { current: counter, target: objective.days };
    case 'population':
      return { current: totalPopulation(p), target: objective.count };
    case 'techResearched':
      return { current: s.researchedTechIds.includes(objective.techId) ? 1 : 0, target: 1 };
    case 'prosperityStreak':
      return { current: counter, target: objective.days };
  }
}

function forEachActiveObjective(
  s: GameState,
  fn: (o: Objective, progress: QuestProgress, index: number) => void,
): void {
  for (const q of QUESTS) {
    const progress = s.questProgress[q.id];
    if (progress?.status !== 'active') continue;
    q.objectives.forEach((o, i) => fn(o, progress, i));
  }
}

/** Called by production whenever a resource is actually produced (purchases do not count). */
export function questOnProduced(s: GameState, resourceId: ResourceId, amount: number): void {
  forEachActiveObjective(s, (o, progress, i) => {
    if (o.type === 'resourceGathered' && o.resourceId === resourceId) {
      progress.counters[i] = Math.min(o.amount, progress.counters[i]! + amount);
    }
  });
}

/** Called once per day before the daily ledger is rolled over. */
export function questOnDayEnd(s: GameState, p: Province): void {
  const foodNet = p.today.produced.food - p.today.consumed.food;
  const fed = p.population.shortfallToday === 0;
  forEachActiveObjective(s, (o, progress, i) => {
    if (o.type === 'foodBalanceStreak') {
      progress.counters[i] = foodNet >= 0 && fed ? Math.min(o.days, progress.counters[i]! + 1) : 0;
    } else if (o.type === 'prosperityStreak') {
      const ok = p.happiness >= o.happiness && p.stocks.gold > 0;
      progress.counters[i] = ok ? Math.min(o.days, progress.counters[i]! + 1) : 0;
    }
  });
}

function grantRewards(s: GameState, questId: QuestId): void {
  const p = homeProvince(s);
  const caps = storageCaps(s, p);
  for (const reward of QUEST_BY_ID[questId].rewards) {
    if (reward.type === 'addResource') {
      const space = Math.max(0, caps[reward.resourceId] - p.stocks[reward.resourceId]);
      p.stocks[reward.resourceId] += Math.min(reward.amount, space);
    } else if (reward.type === 'revealProvince') {
      if (!s.revealedProvinceIds.includes(reward.provinceId)) s.revealedProvinceIds.push(reward.provinceId);
    } else if (!s.completedChapters.includes(reward.chapter)) {
      s.completedChapters.push(reward.chapter);
      logEvent(s, 'quest', 'event.chapterComplete', { n: reward.chapter });
    }
  }
}

/**
 * Completes every active quest whose objectives all hold, grants its reward exactly once and
 * activates successors. Loops so a chain can resolve within one evaluation.
 */
export function evaluateQuests(s: GameState): void {
  if (s.mode !== 'campaign') return;
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of QUESTS) {
      const progress = s.questProgress[q.id];
      // Upgrade older saves in place when a newly introduced quest is encountered.
      const entry = progress ?? (s.questProgress[q.id] = {
        status: 'locked', counters: q.objectives.map(() => 0), rewardGranted: false, completedTick: null,
      });
      if (
        entry.status === 'locked' &&
        q.prerequisites.every((id) => s.questProgress[id]?.status === 'completed')
      ) {
        entry.status = 'active';
        changed = true;
      }
      if (entry.status !== 'active') continue;
      const done = q.objectives.every((o, i) => {
        const { current, target } = objectiveProgress(s, o, entry.counters[i] ?? 0);
        return current >= target;
      });
      if (!done) continue;
      entry.status = 'completed';
      entry.completedTick = s.tick;
      if (!entry.rewardGranted) {
        entry.rewardGranted = true;
        grantRewards(s, q.id);
      }
      logEvent(s, 'quest', 'event.questComplete', { title: `@quest.${q.id}.title` });
      changed = true;
    }
  }
}

export const activeQuestId = (s: GameState): QuestId | null =>
  QUESTS.find((q) => s.questProgress[q.id]?.status === 'active')?.id ?? null;
