import { u } from '../core/fixed';
import type { Quest, QuestId } from '../core/types';

/** Chapter 1 — "İlk Ateş". Texts live in src/i18n (quest.<id>.title / .desc / .hint). */
export const QUESTS: readonly Quest[] = [
  {
    id: 'q01',
    chapter: 1,
    prerequisites: [],
    objectives: [{ type: 'buildingCount', buildingId: 'lumber_camp', count: 1 }],
    rewards: [{ type: 'addResource', resourceId: 'gold', amount: u(15) }],
  },
  {
    id: 'q02',
    chapter: 1,
    prerequisites: ['q01'],
    objectives: [
      { type: 'staffedBuilding', buildingId: 'lumber_camp', workers: 2 },
      { type: 'resourceGathered', resourceId: 'wood', amount: u(50) },
    ],
    rewards: [{ type: 'addResource', resourceId: 'food', amount: u(10) }],
  },
  {
    id: 'q03',
    chapter: 1,
    prerequisites: ['q02'],
    objectives: [{ type: 'buildingCount', buildingId: 'farm', count: 1 }],
    rewards: [{ type: 'addResource', resourceId: 'wood', amount: u(10) }],
  },
  {
    id: 'q04',
    chapter: 1,
    prerequisites: ['q03'],
    objectives: [{ type: 'foodBalanceStreak', days: 7 }],
    rewards: [{ type: 'addResource', resourceId: 'gold', amount: u(20) }],
  },
  {
    id: 'q05',
    chapter: 1,
    prerequisites: ['q04'],
    objectives: [
      { type: 'buildingCount', buildingId: 'hut', count: 5 },
      { type: 'population', count: 20 },
    ],
    rewards: [{ type: 'addResource', resourceId: 'stone', amount: u(15) }],
  },
  {
    id: 'q06',
    chapter: 1,
    prerequisites: ['q05'],
    objectives: [
      { type: 'buildingCount', buildingId: 'school', count: 1 },
      { type: 'staffedBuilding', buildingId: 'school', workers: 1 },
    ],
    rewards: [{ type: 'addResource', resourceId: 'research', amount: u(20) }],
  },
  {
    id: 'q07',
    chapter: 1,
    prerequisites: ['q06'],
    objectives: [{ type: 'techResearched', techId: 'basic_agriculture' }],
    rewards: [{ type: 'revealProvince', provinceId: 'cinar_ormani' }],
  },
  {
    id: 'q08',
    chapter: 1,
    prerequisites: ['q07'],
    objectives: [{ type: 'prosperityStreak', happiness: 75, days: 10 }],
    rewards: [{ type: 'completeChapter', chapter: 1 }],
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q])) as Record<QuestId, Quest>;
