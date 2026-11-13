import { mulPermille } from '../core/fixed';
import { calendar } from '../core/time';
import type {
  BuildingId,
  BuildingInstance,
  GameState,
  Province,
  ResourceId,
  ResourceMap,
} from '../core/types';
import {
  FOOD_PER_CITIZEN_PER_DAY,
  NO_TOOLS_OUTPUT_PERMILLE,
  TAX_PERMILLE,
  TOOL_WEAR_PER_WORKER_PER_DAY,
} from '../data/balance';
import { defOf, specOf } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { tilesInRange } from './grid';
import { bonusesOf, conditionPermille } from './architecture';

export const UNCAPPED = Number.MAX_SAFE_INTEGER;

export const homeProvince = (s: GameState): Province => s.provinces[s.homeProvinceId]!;
export const totalPopulation = (p: Province): number =>
  p.population.children + p.population.adults + p.population.elders;
export const isBuilt = (b: BuildingInstance): boolean => b.state !== 'construction';
export const assignedWorkers = (p: Province): number => p.buildings.reduce((sum, b) => sum + b.workers, 0);
export const idleWorkers = (p: Province): number => p.population.adults - assignedWorkers(p);

export function housingCapacity(p: Province): number {
  return p.buildings.reduce((sum, b) => sum + (isBuilt(b) && b.connected ? specOf(b).housing : 0), 0);
}

export function techOutputPermille(s: Pick<GameState, 'researchedTechIds'>, buildingId: BuildingId): number {
  let permille = 1000;
  for (const id of s.researchedTechIds)
    for (const e of TECHNOLOGIES[id].effects)
      if (e.type === 'outputMultiplier' && e.buildingId === buildingId)
        permille = mulPermille(permille, e.permille);
  return permille;
}

export function techScalar(
  s: Pick<GameState, 'researchedTechIds'>,
  type: 'storageMultiplier' | 'forestRegrowMultiplier',
): number {
  let permille = 1000;
  for (const id of s.researchedTechIds)
    for (const e of TECHNOLOGIES[id].effects)
      if (e.type === type) permille = mulPermille(permille, e.permille);
  return permille;
}

/** Storage caps from completed storage buildings. Gold (treasury) and research are uncapped. */
export function storageCaps(
  s: Pick<GameState, 'researchedTechIds'>,
  p: Province,
  without?: string,
): ResourceMap {
  const caps: ResourceMap = { wood: 0, stone: 0, food: 0, tools: 0, gold: UNCAPPED, research: UNCAPPED };
  for (const b of p.buildings) {
    if (!isBuilt(b) || b.id === without) continue;
    const storage = specOf(b).storage;
    for (const key of Object.keys(storage) as ResourceId[]) caps[key] += storage[key] ?? 0;
  }
  const mult = techScalar(s, 'storageMultiplier');
  for (const key of ['wood', 'stone', 'food', 'tools'] as const) caps[key] = mulPermille(caps[key], mult);
  return caps;
}

/** A building does work only when built, road-connected, paid for and staffed. */
export const isOperating = (b: BuildingInstance): boolean =>
  isBuilt(b) && b.connected && !b.unpaid && b.workers > 0;

/**
 * Daily output of a production building under current staffing, season, technology and tools.
 * Shared by the tick and by the economy panel, so the UI can never disagree with the simulation.
 */
export function dailyOutput(s: GameState, p: Province, b: BuildingInstance): number {
  const spec = specOf(b);
  if (!spec.produces || !isOperating(b)) return 0;
  const def = defOf(b);
  if (def.seasonal && calendar(s.tick).season === 'winter') return 0;
  let rate = Math.floor((spec.produces.perDay * Math.min(b.workers, spec.workerSlots)) / spec.workerSlots);
  rate = mulPermille(rate, techOutputPermille(s, def.id));
  rate = mulPermille(rate, conditionPermille(b.condition));
  if (def.id === 'school') rate = mulPermille(rate, bonusesOf(b.style).schoolPermille);
  if (def.usesTools && p.stocks.tools <= 0) rate = mulPermille(rate, NO_TOOLS_OUTPUT_PERMILLE);
  // extraction can never exceed what is physically left in range
  if (def.harvests) rate = Math.min(rate, depositInRange(p, b));
  return rate;
}

/** Harvestable stock (wood or stone) within the building's working radius. */
export function depositInRange(p: Province, b: Pick<BuildingInstance, 'definitionId' | 'x' | 'y'>): number {
  return tilesInRange(p, defOf(b), b.x, b.y).reduce((sum, i) => sum + p.tiles[i]!.deposit, 0);
}

export const dailyToolWear = (b: BuildingInstance): number =>
  defOf(b).usesTools && isOperating(b) ? b.workers * TOOL_WEAR_PER_WORKER_PER_DAY : 0;

export const dailyFoodNeed = (p: Province): number => totalPopulation(p) * FOOD_PER_CITIZEN_PER_DAY;

export function dailyTaxIncome(p: Province): number {
  const cap = housingCapacity(p);
  if (cap <= 0) return 0;
  const full = p.buildings.reduce((sum, b) => sum + (isBuilt(b) && b.connected ? specOf(b).taxIncome : 0), 0);
  const occupied = Math.floor((full * Math.min(totalPopulation(p), cap)) / cap);
  return mulPermille(occupied, TAX_PERMILLE[p.taxRate]);
}

export const dailyTownIncome = (p: Province): number =>
  p.buildings.reduce((sum, b) => sum + (isBuilt(b) ? specOf(b).goldIncome : 0), 0);

export function emptyResourceMap(): ResourceMap {
  return { wood: 0, stone: 0, food: 0, gold: 0, tools: 0, research: 0 };
}

export interface FlowLine {
  label: string;
  amount: number;
}
export interface Flow {
  sources: FlowLine[];
  consumers: FlowLine[];
  net: number;
}

/** Expected daily flows per resource (before storage caps), with named sources and consumers. */
export function computeFlows(s: GameState): Record<ResourceId, Flow> {
  const p = homeProvince(s);
  const flows = {} as Record<ResourceId, Flow>;
  for (const id of Object.keys(p.stocks) as ResourceId[]) flows[id] = { sources: [], consumers: [], net: 0 };
  const add = (res: ResourceId, kind: 'sources' | 'consumers', label: string, amount: number): void => {
    if (amount <= 0) return;
    const line = flows[res][kind].find((l) => l.label === label);
    if (line) line.amount += amount;
    else flows[res][kind].push({ label, amount });
  };
  for (const b of p.buildings) {
    const spec = specOf(b);
    const name = `@building.${b.definitionId}.name`;
    if (spec.produces) add(spec.produces.resourceId, 'sources', name, dailyOutput(s, p, b));
    add('tools', 'consumers', name, p.stocks.tools > 0 ? dailyToolWear(b) : 0);
    if (isBuilt(b)) add('gold', 'consumers', name, spec.upkeepGold);
  }
  add('gold', 'sources', '@building.town_center.name', dailyTownIncome(p));
  add('gold', 'sources', '@flow.taxes', dailyTaxIncome(p));
  add('food', 'consumers', '@flow.citizens', dailyFoodNeed(p));
  for (const id of Object.keys(flows) as ResourceId[]) {
    const f = flows[id];
    f.net = f.sources.reduce((a, l) => a + l.amount, 0) - f.consumers.reduce((a, l) => a + l.amount, 0);
  }
  return flows;
}
