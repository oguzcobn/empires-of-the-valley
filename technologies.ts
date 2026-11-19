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
  guild_charters: {
    id: 'guild_charters',
    era: 2,
    branch: 'economy',
    cost: u(110),
    prerequisites: ['storage', 'literacy'],
    effects: [
      { type: 'outputMultiplier', buildingId: 'market', permille: 1250 },
      { type: 'outputMultiplier', buildingId: 'bazaar', permille: 1250 },
    ],
  },
  urban_sanitation: {
    id: 'urban_sanitation',
    era: 2,
    branch: 'governance',
    cost: u(120),
    prerequisites: ['architecture'],
    effects: [
      { type: 'storageMultiplier', permille: 1200 },
      { type: 'outputMultiplier', buildingId: 'bakery', permille: 1200 },
    ],
  },
  steam_logistics: {
    id: 'steam_logistics',
    era: 3,
    branch: 'engineering',
    cost: u(180),
    prerequisites: ['guild_charters', 'forestry'],
    effects: [
      { type: 'outputMultiplier', buildingId: 'factory', permille: 1300 },
      { type: 'outputMultiplier', buildingId: 'lumber_camp', permille: 1300 },
    ],
  },
  hydro_engineering: {
    id: 'hydro_engineering',
    era: 3,
    branch: 'agriculture',
    cost: u(190),
    prerequisites: ['urban_sanitation', 'masonry'],
    effects: [
      { type: 'outputMultiplier', buildingId: 'farm', permille: 1300 },
      { type: 'outputMultiplier', buildingId: 'quarry', permille: 1300 },
    ],
  },
  modern_grid: {
    id: 'modern_grid',
    era: 4,
    branch: 'engineering',
    cost: u(260),
    prerequisites: ['steam_logistics', 'hydro_engineering'],
    effects: [
      { type: 'outputMultiplier', buildingId: 'solar_farm', permille: 1350 },
      { type: 'outputMultiplier', buildingId: 'wind_turbine', permille: 1350 },
    ],
  },
  smart_metropolis: {
    id: 'smart_metropolis',
    era: 4,
    branch: 'governance',
    cost: u(320),
    prerequisites: ['modern_grid'],
    effects: [
      { type: 'outputMultiplier', buildingId: 'university', permille: 1400 },
      { type: 'storageMultiplier', permille: 1250 },
    ],
  },
};

export const TECH_IDS = Object.keys(TECHNOLOGIES) as TechId[];
