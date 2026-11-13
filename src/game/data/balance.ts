import { u } from '../core/fixed';
import type { Cost, ResourceMap, RoadType, TaxRate, TradeOffer } from '../core/types';

/** Phase 1 balance sheet. Values are provisional and exercised by src/tests/balance.test.ts. */
export const SCHEMA_VERSION = 4;
export const GAME_VERSION = '0.4.0';

/** The valley (core) is 24x24; since the terrain update it sits inside a 32x32 map ringed by
 * highlands at the back and a lake shore at the front. */
export const MAP_SIZE = 32;
export const CORE_SIZE = 24;
export const CORE_OFFSET = 4;
export const MAX_HEIGHT = 4;
/** Screen pixels per elevation level. */
export const HEIGHT_PX = 12;

/** Road structures: the road tool picks the type from the ground it crosses. */
export const ROAD_COSTS: Record<RoadType, Cost> = {
  dirt: { wood: 2000 },
  stairs: { stone: 3000, wood: 1000 },
  mountain: { stone: 3000 },
  bridge: { wood: 5000, stone: 4000 },
  tunnel: { stone: 12000, wood: 6000, gold: 5000 },
};
/** Retaining wall that turns a hill tile into a flat, farmable terrace. */
export const TERRACE_COST: Cost = { stone: 6000, wood: 2000 };
export const FOOD_PER_CITIZEN_PER_DAY = u(0.25);
export const TOOL_WEAR_PER_WORKER_PER_DAY = u(0.03);
export const NO_TOOLS_OUTPUT_PERMILLE = 500;

export const FOREST_TILE_MAX = u(40);
export const FOREST_REGROW_PER_DAY = u(0.2);
export const STONE_TILE_MAX = u(300);

export const ROAD_COST_WOOD = u(2);
export const ROAD_REFUND_WOOD = u(1);
export const DEMOLISH_REFUND_PERMILLE = 500;

export const GROWTH_INTERVAL_DAYS = 5;
export const GROWTH_INTERVAL_UNHAPPY_DAYS = 8;
export const GROWTH_MIN_HAPPINESS = 50;
export const GROWTH_FOOD_RESERVE_DAYS = 3;
export const MATURATION_INTERVAL_DAYS = 40;
export const STARVATION_GRACE_DAYS = 3;
export const MIN_POPULATION = 6;
export const WINTER_WARNING_DAYS = 10;

export const TAX_PERMILLE: Record<TaxRate, number> = { low: 500, normal: 1000, high: 1500 };
export const TAX_HAPPINESS: Record<TaxRate, number> = { low: 5, normal: 0, high: -10 };

export const START_STOCKS: ResourceMap = {
  wood: u(160),
  food: u(90),
  stone: u(70),
  gold: u(40),
  tools: u(20),
  research: 0,
};
export const START_POPULATION = { children: 3, adults: 8, elders: 1 };
export const START_HAPPINESS = 70;

/** The travelling merchant at the town center: the recovery path when a critical stock runs dry. */
export const TRADE_OFFERS: readonly TradeOffer[] = [
  { id: 'buy_wood', give: { gold: u(8) }, get: { wood: u(10) } },
  { id: 'buy_food', give: { gold: u(10) }, get: { food: u(10) } },
  { id: 'buy_stone', give: { gold: u(10) }, get: { stone: u(10) } },
  { id: 'buy_tools', give: { gold: u(15) }, get: { tools: u(5) } },
  { id: 'sell_wood', give: { wood: u(10) }, get: { gold: u(3) } },
  { id: 'sell_stone', give: { stone: u(10) }, get: { gold: u(4) } },
  { id: 'sell_food', give: { food: u(10) }, get: { gold: u(4) } },
];

export const EVENT_LOG_LIMIT = 80;
