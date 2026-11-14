import { produce } from 'immer';
import { securityDayEnd } from './security';
import { mulPermille, portion } from '../core/fixed';
import { TICKS_PER_DAY, calendar, daysUntilWinter } from '../core/time';
import type { BuildingInstance, GameState, Province, ResourceId } from '../core/types';
import { FOREST_REGROW_PER_DAY, FOREST_TILE_MAX, WINTER_WARNING_DAYS } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import {
  dailyFoodNeed,
  dailyOutput,
  dailyTaxIncome,
  dailyToolWear,
  dailyTownIncome,
  emptyResourceMap,
  homeProvince,
  isBuilt,
  storageCaps,
  techScalar,
} from './economy';
import { logEvent } from './events';
import { refreshConnectivity, tilesInRange } from './grid';
import { populationDayEnd } from './population';
import { decayPerDay } from './architecture';
import { shipyardTick, tourismDayEnd } from './tourism';
import { evaluateQuests, questOnDayEnd, questOnProduced } from './quests';

/** Ticks needed to finish the building's current job (first construction or upgrade). */
export function requiredTicks(b: BuildingInstance): number {
  const def = BUILDINGS[b.definitionId];
  if (def.landmark && b.state === 'construction') return stageBoundary(b, def.landmark.stages.length);
  const levels = def.levels;
  return b.state === 'upgrading' ? levels[b.level]!.buildTicks : levels[b.level - 1]!.buildTicks;
}

/**
 * Landmark work units completed when stage `k` ends (k = 1..n). One work unit is one builder-hour;
 * with all builders assigned a stage takes exactly its listed days.
 */
export function stageBoundary(b: Pick<BuildingInstance, 'definitionId'>, k: number): number {
  const spec = BUILDINGS[b.definitionId].landmark!;
  let total = 0;
  for (let i = 0; i < k; i++) total += spec.stages[i]!.days * 24 * spec.builders;
  return total;
}

/** Current landmark stage (1-based) and whether it is waiting for the next stage's materials. */
export function landmarkStage(b: BuildingInstance): { stage: number; waiting: boolean } {
  const spec = BUILDINGS[b.definitionId].landmark!;
  const waiting = b.progressTicks >= stageBoundary(b, b.paidStages) && b.paidStages < spec.stages.length;
  return { stage: Math.min(spec.stages.length, b.paidStages), waiting };
}

/** Landmark construction: builders do the work, every stage is paid before it starts. */
function landmarkStep(s: GameState, p: Province, b: BuildingInstance): boolean {
  const spec = defOf(b).landmark!;
  const n = spec.stages.length;
  if (b.progressTicks >= stageBoundary(b, b.paidStages) && b.paidStages < n) {
    const cost = spec.stages[b.paidStages]!.cost;
    const ids = Object.keys(cost) as ResourceId[];
    if (ids.some((id) => p.stocks[id] < (cost[id] ?? 0))) {
      if (!b.unpaid)
        logEvent(s, 'warning', 'event.landmarkWaiting', { building: `@building.${b.definitionId}.name` }, { x: b.x, y: b.y });
      b.unpaid = true; // during landmark construction: waiting for the next stage's materials
      return false;
    }
    for (const id of ids) spend(p, id, cost[id] ?? 0);
    b.paidStages += 1;
    b.unpaid = false;
    logEvent(s, 'info', 'event.landmarkStage', { building: `@building.${b.definitionId}.name`, n: b.paidStages });
  }
  b.progressTicks = Math.min(stageBoundary(b, b.paidStages), b.progressTicks + Math.min(b.workers, spec.builders));
  if (b.paidStages < n || b.progressTicks < stageBoundary(b, n)) return false;
  b.state = 'active';
  b.progressTicks = 0;
  b.workers = Math.min(b.workers, specOf(b).workerSlots);
  logEvent(s, 'success', 'event.built', { building: `@building.${b.definitionId}.name` }, { x: b.x, y: b.y });
  return true;
}

function constructionStep(s: GameState, p: Province): void {
  let structural = false;
  for (const b of p.buildings) {
    if (b.state === 'active' || !b.connected) continue;
    if (b.state === 'construction' && defOf(b).landmark) {
      if (landmarkStep(s, p, b)) structural = true;
      continue;
    }
    // Non-monument construction and upgrades progress three work units
    // per simulation hour. 4x clock speed remains unchanged: this does
    // not accelerate day/night, food consumption, taxation or seasons.
    // Monuments keep their separate, staged builder-hours system.
    b.progressTicks = Math.min(requiredTicks(b), b.progressTicks + 3);
    if (b.progressTicks < requiredTicks(b)) continue;
    if (b.state === 'upgrading') {
      b.level += 1;
      logEvent(
        s,
        'success',
        'event.upgraded',
        { building: `@building.${b.definitionId}.name`, level: b.level },
        { x: b.x, y: b.y },
      );
    } else {
      logEvent(
        s,
        'success',
        'event.built',
        { building: `@building.${b.definitionId}.name` },
        { x: b.x, y: b.y },
      );
    }
    b.state = 'active';
    b.progressTicks = 0;
    structural = true;
  }
  if (structural) refreshConnectivity(p);
}

function gain(p: Province, id: ResourceId, amount: number, cap: number): number {
  const added = Math.max(0, Math.min(amount, cap - p.stocks[id]));
  p.stocks[id] += added;
  p.today.produced[id] += added;
  return added;
}

function spend(p: Province, id: ResourceId, amount: number): number {
  const taken = Math.min(amount, p.stocks[id]);
  p.stocks[id] -= taken;
  p.today.consumed[id] += taken;
  return taken;
}

/** Removes up to `amount` from the richest deposits in range; returns what was actually taken. */
function harvest(p: Province, b: BuildingInstance, amount: number): number {
  const candidates = tilesInRange(p, defOf(b), b.x, b.y)
    .filter((i) => p.tiles[i]!.deposit > 0)
    .sort((a, c) => p.tiles[c]!.deposit - p.tiles[a]!.deposit || a - c);
  let left = amount;
  for (const i of candidates) {
    if (left <= 0) break;
    const take = Math.min(left, p.tiles[i]!.deposit);
    p.tiles[i]!.deposit -= take;
    left -= take;
  }
  return amount - left;
}

function economyStep(s: GameState, p: Province, hour: number): void {
  const caps = storageCaps(s, p);

  // 1. income
  gain(p, 'gold', portion(dailyTownIncome(p) + dailyTaxIncome(p) + 1000 * Object.values(s.treaties ?? {}).filter((v) => v === 'trade').length, hour), caps.gold);

  // 2. upkeep, in stable building order. Unpaid buildings stand idle this tick.
  for (const b of p.buildings) {
    if (!isBuilt(b)) continue;
    const due = portion(specOf(b).upkeepGold, hour);
    if (p.stocks.gold >= due) {
      spend(p, 'gold', due);
      b.unpaid = false;
    } else {
      b.unpaid = true;
    }
  }

  // 3. production: limited by workers, tools, season, storage space and physical deposits
  for (const b of p.buildings) {
    const produces = specOf(b).produces;
    if (!produces) continue;
    const def = defOf(b);
    let amount = portion(dailyOutput(s, p, b), hour);
    spend(p, 'tools', portion(dailyToolWear(b), hour));
    if (amount <= 0) continue;
    amount = Math.min(amount, Math.max(0, caps[produces.resourceId] - p.stocks[produces.resourceId]));
    if (def.harvests) amount = harvest(p, b, amount);
    const added = gain(p, produces.resourceId, amount, caps[produces.resourceId]);
    if (added > 0) questOnProduced(s, produces.resourceId, added);
  }

  // 4. research points flow into the active project
  const activeTech = s.researchQueue[0];
  if (activeTech) {
    const cost = TECHNOLOGIES[activeTech].cost;
    const invest = Math.min(p.stocks.research, cost - s.researchProgress);
    p.stocks.research -= invest;
    p.today.consumed.research += invest;
    s.researchProgress += invest;
    if (s.researchProgress >= cost) {
      s.researchedTechIds.push(activeTech);
      s.researchQueue.shift();
      s.researchProgress = 0;
      logEvent(s, 'success', 'event.researched', { tech: `@tech.${activeTech}.name` });
    }
  }

  // 5. shipwrights work on the first vessel order
  shipyardTick(s, p);

  // 6. citizens eat
  const need = portion(dailyFoodNeed(p), hour);
  const eaten = spend(p, 'food', need);
  p.population.shortfallToday += need - eaten;
}

function dayEnd(s: GameState, p: Province): void {
  const cal = calendar(s.tick);
  questOnDayEnd(s, p);
  populationDayEnd(s, p, cal.day);
  tourismDayEnd(s, p);
  securityDayEnd(s, p);

  // buildings weather: stone lasts, timber and thatch need care (see data/architecture.ts)
  for (const b of p.buildings) {
    if (b.state === 'construction') continue;
    const before = b.condition;
    b.condition = Math.max(0, b.condition - decayPerDay(b));
    if (before >= 5000 && b.condition < 5000)
      logEvent(s, 'warning', 'event.worn', { building: `@building.${b.definitionId}.name` }, { x: b.x, y: b.y });
  }

  // forests regrow slowly
  const regrow = mulPermille(FOREST_REGROW_PER_DAY, techScalar(s, 'forestRegrowMultiplier'));
  for (const t of p.tiles) {
    if (t.terrain === 'forest' && t.deposit < FOREST_TILE_MAX)
      t.deposit = Math.min(FOREST_TILE_MAX, t.deposit + regrow);
  }

  if (cal.dayOfSeason === 1)
    logEvent(s, cal.season === 'winter' ? 'warning' : 'info', `event.season.${cal.season}`);
  if (daysUntilWinter(s.tick) === WINTER_WARNING_DAYS)
    logEvent(s, 'warning', 'event.winterSoon', { n: WINTER_WARNING_DAYS });

  p.yesterday = p.today;
  p.today = { produced: emptyResourceMap(), consumed: emptyResourceMap() };
}

/**
 * Advances the simulation by exactly one tick (one in-game hour), mutating a draft.
 * Order is fixed: construction -> income -> upkeep -> production -> research -> consumption ->
 * day end -> quests. Nothing here reads wall-clock time, FPS or the game speed.
 */
export function tickMut(s: GameState): void {
  const p = homeProvince(s);
  const hour = s.tick % TICKS_PER_DAY;
  constructionStep(s, p);
  economyStep(s, p, hour);
  s.tick += 1;
  if (s.tick % TICKS_PER_DAY === 0) dayEnd(s, p);
  evaluateQuests(s);
}

/** Pure tick: returns the next state, never mutates its input. */
export const applyTick = (state: GameState): GameState => produce(state, tickMut);

export function applyTicks(state: GameState, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) next = applyTick(next);
  return next;
}
