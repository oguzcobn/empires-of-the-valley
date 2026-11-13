import { mulPermille } from '../core/fixed';
import type {
  ArchitectureStyle,
  BuildingId,
  BuildingInstance,
  BuildingLook,
  Cost,
  ResourceId,
} from '../core/types';
import {
  BASE_DECAY_PER_DAY,
  CONDITION_MAX,
  CONDITION_POOR,
  CONDITION_WORN,
  CULTURES,
  REPAIR_COST_PERMILLE,
  REPAIR_GOLD_PER_FULL,
  RESTYLE_COST_PERMILLE,
  RESTYLE_GOLD,
  ROOF_RULES,
  WALL_RULES,
  defaultLook,
} from '../data/architecture';
import type { CultureBonuses } from '../data/architecture';
import { BUILDINGS } from '../data/buildings';

type StyledRef = Pick<BuildingInstance, 'definitionId' | 'style' | 'look' | 'level'>;

/** Look actually shown and used for rules: the custom design, or the culture default for the level. */
export function effectiveLook(b: StyledRef): BuildingLook {
  return b.look ?? defaultLook(b.style, b.definitionId, b.level);
}

export const bonusesOf = (style: ArchitectureStyle): CultureBonuses => CULTURES[style].bonuses;

/** Rounds to whole units so a displayed price is always exactly what is paid. */
const wholeUnits = (milli: number): number => Math.round(milli / 1000) * 1000;

/** Base cost of a level adjusted by wall and roof materials. Every command and UI reads this. */
export function levelCost(
  definitionId: BuildingId,
  levelIndex: number,
  style: ArchitectureStyle,
  customLook: BuildingLook | null = null,
): Cost {
  const base = BUILDINGS[definitionId].levels[levelIndex]?.cost ?? {};
  const look = customLook ?? defaultLook(style, definitionId, levelIndex + 1);
  const wall = WALL_RULES[look.wall].cost;
  const roof = ROOF_RULES[look.roofMaterial].cost;
  const out: Cost = {};
  for (const id of Object.keys(base) as ResourceId[]) {
    let amount = base[id] ?? 0;
    amount = mulPermille(amount, wall[id] ?? 1000);
    amount = mulPermille(amount, roof[id] ?? 1000);
    out[id] = id === 'gold' || id === 'research' ? amount : wholeUnits(amount);
  }
  return out;
}

/** Total cost invested in a building up to its current level (for demolition refunds). */
export function investedCost(b: StyledRef): Cost {
  const total: Cost = {};
  for (let l = 0; l < b.level; l++) {
    const cost = levelCost(b.definitionId, l, b.style, b.look);
    for (const id of Object.keys(cost) as ResourceId[]) total[id] = (total[id] ?? 0) + (cost[id] ?? 0);
  }
  return total;
}

/** Daily condition loss in basis points: base x wall x roof x culture. */
export function decayPerDay(b: StyledRef): number {
  const look = effectiveLook(b);
  let d = BASE_DECAY_PER_DAY * 1000;
  d = mulPermille(d, WALL_RULES[look.wall].decay);
  d = mulPermille(d, ROOF_RULES[look.roofMaterial].decay);
  d = mulPermille(d, bonusesOf(b.style).decayPermille);
  return Math.max(1, Math.round(d / 1000));
}

/** Output multiplier from condition. Worn buildings slow down but never stop. */
export function conditionPermille(condition: number): number {
  if (condition >= CONDITION_WORN) return 1000;
  if (condition >= CONDITION_POOR) return 850;
  return 700;
}

export type ConditionBand = 'good' | 'worn' | 'poor';
export const conditionBand = (condition: number): ConditionBand =>
  condition >= CONDITION_WORN ? 'good' : condition >= CONDITION_POOR ? 'worn' : 'poor';

function scaleCost(cost: Cost, permille: number): Cost {
  const out: Cost = {};
  for (const id of Object.keys(cost) as ResourceId[]) {
    const v = wholeUnits(mulPermille(cost[id] ?? 0, permille));
    if (v > 0) out[id] = v;
  }
  return out;
}

/** Cost to restore a building to full condition. Empty when nothing is missing. */
export function repairCost(b: StyledRef & Pick<BuildingInstance, 'condition'>): Cost {
  const missing = CONDITION_MAX - b.condition;
  if (missing <= 0) return {};
  const base = levelCost(b.definitionId, 0, b.style, b.look);
  const share = Math.floor((REPAIR_COST_PERMILLE * missing) / CONDITION_MAX);
  const culture = bonusesOf(b.style).repairPermille;
  const materials = scaleCost({ wood: base.wood ?? 0, stone: base.stone ?? 0 }, mulPermille(share, culture));
  const raw = mulPermille(Math.floor((REPAIR_GOLD_PER_FULL * missing) / CONDITION_MAX), culture);
  const gold = Math.round(raw / 100) * 100; // tenths of gold, shown with one decimal
  return gold > 0 ? { ...materials, gold } : materials;
}

/** Cost to change an existing building's culture or design. */
export function restyleCost(definitionId: BuildingId, style: ArchitectureStyle, look: BuildingLook | null): Cost {
  const base = levelCost(definitionId, 0, style, look);
  const out = scaleCost({ wood: base.wood ?? 0, stone: base.stone ?? 0 }, RESTYLE_COST_PERMILLE);
  out.gold = RESTYLE_GOLD;
  return out;
}

export const sameLook = (a: BuildingLook | null, b: BuildingLook | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);
