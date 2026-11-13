import { u } from '../core/fixed';
import type { TechId, Technology } from '../core/types';

export const TECHNOLOGIES: Record<TechId, Technology> = {
  basic_agriculture: {
    id: 'basic_agriculture',
    era: 1,
    branch: 'agriculture',
    cost: u(30),
    prerequisites: [],
    effects: [{ type: 'outputMultiplier', buildingId: 'farm', permille: 1250 }],
  },
  forestry: {
    id: 'forestry',
    era: 1,
    branch: 'agriculture',
    cost: u(40),
    prerequisites: [],
    effects: [
      { type: 'outputMultiplier', buildingId: 'lumber_camp', permille: 1250 },
      { type: 'forestRegrowMultiplier', permille: 1500 },
    ],
  },
  masonry: {
    id: 'masonry',
    era: 1,
    branch: 'engineering',
    cost: u(50),
    prerequisites: [],
    effects: [{ type: 'outputMultiplier', buildingId: 'quarry', permille: 1250 }],
  },
  storage: {
    id: 'storage',
    era: 1,
    branch: 'economy',
    cost: u(40),
    prerequisites: [],
    effects: [{ type: 'storageMultiplier', permille: 1200 }],
  },
  literacy: {
    id: 'literacy',
    era: 1,
    branch: 'governance',
    cost: u(60),
    prerequisites: ['basic_agriculture'],
    effects: [{ type: 'outputMultiplier', buildingId: 'school', permille: 1500 }],
  },
  architecture: {
    id: 'architecture',
    era: 1,
    branch: 'engineering',
    cost: u(70),
    prerequisites: ['masonry', 'literacy'],
    // unlocks the historic landmarks (checked by their level requirements)
    effects: [],
  },
};

export const TECH_IDS = Object.keys(TECHNOLOGIES) as TechId[];
