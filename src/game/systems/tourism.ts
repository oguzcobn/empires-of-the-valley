import { mulPermille } from '../core/fixed';
import type { BuildingInstance, GameState, Province, ResourceId, TourismState, ShipyardState, VesselKind } from '../core/types';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { VESSELS, VESSEL_KINDS } from '../data/shipyard';
import { bonusesOf, conditionPermille, effectiveLook } from './architecture';
import { homeProvince, isOperating, storageCaps } from './economy';
import { logEvent } from './events';

/**
 * Tourism, culture and the shipyard fleet: computed once per day from the city's real state.
 * Visitors are limited by beds and day-trip capacity, eat food, need safety and services, and
 * pay per visit; satisfaction is the city's reputation and moves slowly. There is no source of
 * gold that does not depend on built, staffed, maintained buildings.
 */

export const emptyTourism = (): TourismState => ({
  culture: 0,
  satisfaction: 50,
  visitorsYesterday: 0,
  demandYesterday: 0,
  incomeYesterday: 0,
  totalVisitors: 0,
});

export const emptyShipyard = (): ShipyardState => ({
  queue: [],
  fleet: { fishing: 0, cargo: 0, yacht: 0 },
  nextOrderId: 1,
  yachtsSold: 0,
});

export const DAYTRIP_BASE = 2;
export const DAYTRIP_PER_MARKET = 2;
export const BASE_SPEND = 600;
export const MAX_SPEND = 1500;
export const FOOD_PER_VISITOR = 250;
export const BASE_SAFETY = 30;

const staffShare = (b: BuildingInstance): number => {
  const slots = specOf(b).workerSlots;
  return slots > 0 ? Math.min(1, b.workers / slots) : 1;
};

const landmarks = (p: Province): BuildingInstance[] =>
  p.buildings.filter((b) => defOf(b).landmark && b.state === 'active' && b.connected);

export function beds(p: Province): number {
  let n = 0;
  for (const b of p.buildings) {
    const svc = defOf(b).services;
    if (!svc?.beds || !isOperating(b)) continue;
    const base = svc.beds + (b.level - 1) * 6 + bonusesOf(b.style).innBeds * b.level;
    n += Math.floor(base * staffShare(b));
  }
  return n;
}

export function marketGold(p: Province): number {
  let g = 0;
  for (const b of p.buildings) {
    const svc = defOf(b).services;
    if (!svc?.marketGold || !isOperating(b)) continue;
    const perLevel = mulPermille(svc.marketGold * b.level, bonusesOf(b.style).marketPermille);
    g += mulPermille(Math.floor(perLevel * staffShare(b)), conditionPermille(b.condition));
  }
  return g;
}

export interface SafetySource {
  id: string;
  label: string;
  value: number;
}

/** City safety 0..100: watch towers (stronger on high ground and in Scottish style) and castles. */
export function safety(p: Province): { value: number; sources: SafetySource[] } {
  const sources: SafetySource[] = [];
  const touristSpots = p.buildings.filter((b) => defOf(b).services?.beds || defOf(b).landmark || defOf(b).services?.marketGold);
  for (const b of p.buildings) {
    const def = defOf(b);
    if (def.services?.safety && isOperating(b)) {
      const tile = p.tiles[b.y * p.width + b.x]!;
      const radius = (def.services.safetyRadius ?? 0) + bonusesOf(b.style).watchRadius + (tile.height >= 1 ? 1 : 0);
      const covers = touristSpots.some((o) => Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= radius + 1);
      const v = (def.services.safety + b.level * 2 + (tile.height >= 1 ? 4 : 0)) * (covers ? 1 : 0.5);
      sources.push({ id: b.id, label: `@building.${b.definitionId}.name`, value: Math.floor(v) });
    }
    if (def.landmark?.safety && b.state === 'active')
      sources.push({ id: b.id, label: `@building.${b.definitionId}.name`, value: def.landmark.safety });
  }
  const value = Math.min(100, BASE_SAFETY + sources.reduce((a, s) => a + s.value, 0));
  return { value, sources };
}

export interface AttractionPart {
  label: string;
  value: number;
}

export function attraction(s: GameState, p: Province): { value: number; parts: AttractionPart[] } {
  const parts: AttractionPart[] = [];
  for (const b of landmarks(p)) {
    const v = Math.floor((defOf(b).landmark!.attraction * conditionPermille(b.condition)) / 1000);
    parts.push({ label: `@building.${b.definitionId}.name`, value: v });
  }
  for (const b of p.buildings) {
    const a = defOf(b).services?.attraction;
    if (a && isOperating(b)) parts.push({ label: `@building.${b.definitionId}.name`, value: a });
  }
  const yachts = s.shipyard.fleet.yacht;
  if (yachts > 0) parts.push({ label: '@tourism.marina', value: yachts * (VESSELS.yacht.attraction ?? 0) });
  const beauty = Math.min(
    6,
    p.buildings.filter((b) => {
      if (!b.look) return false;
      const l = effectiveLook(b);
      return l.garden !== 'none' || l.decor !== 'none' || l.courtyard !== 'none';
    }).length,
  );
  if (beauty > 0) parts.push({ label: '@tourism.beauty', value: beauty });
  return { value: parts.reduce((a, x) => a + x.value, 0), parts };
}

export const prestige = (s: GameState, p: Province): number =>
  Math.floor(s.tourism.culture / 1000 / 20) + landmarks(p).length * 5;

export interface TourismReport {
  attraction: number;
  parts: AttractionPart[];
  safety: number;
  safetySources: SafetySource[];
  prestige: number;
  beds: number;
  capacity: number;
  demand: number;
  visitors: number;
  spend: number;
  income: number;
  food: number;
  foodOk: boolean;
  satisfactionTarget: number;
  culturePerDay: number;
  marketGold: number;
}

/** Pure forecast of today's tourism (the same numbers the day end applies). */
export function tourismReport(s: GameState): TourismReport {
  const p = homeProvince(s);
  const at = attraction(s, p);
  const sf = safety(p);
  const pr = prestige(s, p);
  const markets = p.buildings.filter((b) => defOf(b).services?.marketGold && isOperating(b)).length;
  const bedCount = beds(p);
  const capacity = bedCount + DAYTRIP_BASE + DAYTRIP_PER_MARKET * markets;
  let d = at.value * 1000;
  d = Math.floor((d * (500 + Math.min(500, pr * 5))) / 1000);
  d = Math.floor((d * sf.value) / 100);
  d = Math.floor((d * (s.tourism.satisfaction + 50)) / 150);
  d = Math.floor((d * p.happiness) / 100);
  const demand = Math.floor(d / 1000);
  const visitors = Math.min(demand, capacity);
  const lm = landmarks(p);
  const spend = Math.min(MAX_SPEND, BASE_SPEND + lm.reduce((a, b) => a + defOf(b).landmark!.museumGold, 0));
  const food = visitors * FOOD_PER_VISITOR;
  const foodOk = p.stocks.food >= food;
  const income = foodOk ? Math.floor((visitors * spend * s.tourism.satisfaction) / 100) : Math.floor((visitors * spend * s.tourism.satisfaction) / 200);
  const avgCond = lm.length ? lm.reduce((a, b) => a + b.condition, 0) / lm.length : 10000;
  let target = 40;
  if (markets > 0) target += 10;
  if (avgCond >= 5000) target += 10;
  if (sf.value >= 60) target += 10;
  if (p.happiness >= 60) target += 5;
  target += capacity >= demand ? 10 : -10;
  target += foodOk ? 5 : -10;
  const culturePerDay = lm.reduce((a, b) => a + mulPermille(defOf(b).landmark!.culturePerDay, conditionPermille(b.condition)), 0);
  return {
    attraction: at.value,
    parts: at.parts,
    safety: sf.value,
    safetySources: sf.sources,
    prestige: pr,
    beds: bedCount,
    capacity,
    demand,
    visitors,
    spend,
    income,
    food,
    foodOk,
    satisfactionTarget: Math.max(0, Math.min(100, target)),
    culturePerDay,
    marketGold: marketGold(p),
  };
}

/** Happiness from well-kept monuments (capped), shown in the population panel. */
export function heritageHappiness(p: Province): number {
  return Math.min(10, landmarks(p).reduce((a, b) => a + (b.condition >= 5000 ? defOf(b).landmark!.happiness : 0), 0));
}

function credit(p: Province, id: ResourceId, amount: number, cap: number): number {
  const add = Math.max(0, Math.min(amount, cap - p.stocks[id]));
  p.stocks[id] += add;
  p.today.produced[id] += add;
  return add;
}

/** Applies a day of tourism, culture, markets and the fleet (mutates a draft). */
export function tourismDayEnd(s: GameState, p: Province): void {
  const r = tourismReport(s);
  const caps = storageCaps(s, p);
  const eat = Math.min(r.food, p.stocks.food);
  p.stocks.food -= eat;
  p.today.consumed.food += eat;
  credit(p, 'gold', r.income + r.marketGold, caps.gold);
  s.tourism.culture += r.culturePerDay;
  s.tourism.satisfaction += Math.trunc((r.satisfactionTarget - s.tourism.satisfaction) / 5);
  s.tourism.visitorsYesterday = r.visitors;
  s.tourism.demandYesterday = r.demand;
  s.tourism.incomeYesterday = r.income;
  s.tourism.totalVisitors += r.visitors;
  for (const b of landmarks(p)) {
    const research = defOf(b).landmark!.researchPerDay;
    if (research) credit(p, 'research', research, caps.research);
  }
  fleetDayEnd(s, p);
}

/** Fleet upkeep and output. Vessels whose upkeep cannot be paid stay in port that day. */
function fleetDayEnd(s: GameState, p: Province): void {
  const fleet = s.shipyard.fleet;
  const caps = storageCaps(s, p);
  const hasMarket = p.buildings.some((b) => defOf(b).services?.marketGold && isOperating(b));
  for (const kind of VESSEL_KINDS) {
    const spec = VESSELS[kind];
    for (let i = 0; i < fleet[kind]; i++) {
      if (p.stocks.gold < spec.upkeepGold) break;
      p.stocks.gold -= spec.upkeepGold;
      p.today.consumed.gold += spec.upkeepGold;
      if (spec.foodPerDay) credit(p, 'food', spec.foodPerDay, caps.food);
      if (spec.goldPerDay && hasMarket) credit(p, 'gold', spec.goldPerDay, caps.gold);
    }
  }
}

/** Shipwright-hours available this tick from staffed shipyards. */
export function shipwrightHours(p: Province): number {
  return p.buildings.reduce((a, b) => (b.definitionId === 'shipyard' && isOperating(b) ? a + b.workers * b.level : a), 0);
}

/** Hourly shipbuilding: the first order in the queue receives all shipwright work. */
export function shipyardTick(s: GameState, p: Province): void {
  const order = s.shipyard.queue[0];
  if (!order) return;
  order.progress = Math.min(VESSELS[order.kind].work, order.progress + shipwrightHours(p));
  if (order.progress < VESSELS[order.kind].work) return;
  s.shipyard.queue.shift();
  s.shipyard.fleet[order.kind] += 1;
  logEvent(s, 'success', 'event.vesselLaunched', { vessel: `@vessel.${order.kind}` });
}

export const fleetCount = (s: GameState, kind: VesselKind): number =>
  s.shipyard.fleet[kind] + s.shipyard.queue.filter((o) => o.kind === kind).length;

export const hasWaterBuilding = (id: string): boolean => !!BUILDINGS[id as keyof typeof BUILDINGS]?.needsWater;
