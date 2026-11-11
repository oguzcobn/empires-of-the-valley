import { rngInt } from '../core/rng';
import type { GameState, Province } from '../core/types';
import {
  FOOD_PER_CITIZEN_PER_DAY,
  GROWTH_FOOD_RESERVE_DAYS,
  GROWTH_INTERVAL_DAYS,
  GROWTH_INTERVAL_UNHAPPY_DAYS,
  GROWTH_MIN_HAPPINESS,
  MATURATION_INTERVAL_DAYS,
  MIN_POPULATION,
  STARVATION_GRACE_DAYS,
  TAX_HAPPINESS,
} from '../data/balance';
import { assignedWorkers, housingCapacity, idleWorkers, isOperating, totalPopulation } from './economy';
import { logEvent } from './events';

export interface HappinessFactor {
  id: 'base' | 'food' | 'housing' | 'employment' | 'education' | 'tax' | 'tools';
  value: number;
}

/** Transparent happiness model: the population panel shows exactly these factors. */
export function happinessFactors(p: Province): HappinessFactor[] {
  const pop = totalPopulation(p);
  const cap = housingCapacity(p);
  const daysOfFood = pop > 0 ? p.stocks.food / (pop * FOOD_PER_CITIZEN_PER_DAY) : 99;
  const starving = p.population.shortfallToday > 0 || p.population.starvationDays > 0 || p.stocks.food <= 0;
  const idleRatio = p.population.adults > 0 ? idleWorkers(p) / p.population.adults : 0;
  return [
    { id: 'base', value: 60 },
    { id: 'food', value: starving ? -25 : daysOfFood >= 5 ? 10 : daysOfFood >= 2 ? 4 : -5 },
    { id: 'housing', value: pop > cap ? -12 : pop === cap ? 0 : 5 },
    { id: 'employment', value: idleRatio <= 0.25 ? 5 : idleRatio <= 0.5 ? 0 : -5 },
    {
      id: 'education',
      value: p.buildings.some((b) => b.definitionId === 'school' && isOperating(b)) ? 5 : 0,
    },
    { id: 'tax', value: TAX_HAPPINESS[p.taxRate] },
    { id: 'tools', value: p.stocks.tools <= 0 ? -3 : 0 },
  ];
}

export const happinessTarget = (p: Province): number =>
  Math.max(
    0,
    Math.min(
      100,
      happinessFactors(p).reduce((sum, f) => sum + f.value, 0),
    ),
  );

/** Frees workers (last staffed building first) when there are fewer adults than assignments. */
export function enforceWorkerLimit(p: Province): void {
  let excess = assignedWorkers(p) - p.population.adults;
  for (let i = p.buildings.length - 1; i >= 0 && excess > 0; i--) {
    const b = p.buildings[i]!;
    const take = Math.min(b.workers, excess);
    b.workers -= take;
    excess -= take;
  }
}

export type GrowthBlocker = 'housing' | 'food' | 'happiness' | 'starvation' | 'interval' | null;

export function growthBlocker(p: Province, day: number): GrowthBlocker {
  const pop = totalPopulation(p);
  if (pop >= housingCapacity(p)) return 'housing';
  if (p.population.starvationDays > 0 || p.population.shortfallToday > 0) return 'starvation';
  if (p.stocks.food < pop * FOOD_PER_CITIZEN_PER_DAY * GROWTH_FOOD_RESERVE_DAYS) return 'food';
  if (p.happiness < GROWTH_MIN_HAPPINESS) return 'happiness';
  const interval = p.happiness >= 60 ? GROWTH_INTERVAL_DAYS : GROWTH_INTERVAL_UNHAPPY_DAYS;
  if (day - p.population.lastGrowthDay < interval) return 'interval';
  return null;
}

/** Runs once per in-game day, after the day's production and consumption are settled. */
export function populationDayEnd(s: GameState, p: Province, day: number): void {
  const pop = p.population;

  // famine: after a grace period residents leave, but never below a recoverable minimum
  if (pop.shortfallToday > 0) {
    pop.starvationDays += 1;
    if (pop.starvationDays === 1) logEvent(s, 'danger', 'event.famineStart');
    if (
      pop.starvationDays >= STARVATION_GRACE_DAYS &&
      (pop.starvationDays - STARVATION_GRACE_DAYS) % 2 === 0 &&
      totalPopulation(p) > MIN_POPULATION
    ) {
      if (pop.elders > 0) pop.elders -= 1;
      else if (pop.children > 0) pop.children -= 1;
      else pop.adults -= 1;
      enforceWorkerLimit(p);
      logEvent(s, 'danger', 'event.famineLeave');
    }
  } else {
    pop.starvationDays = 0;
  }
  pop.shortfallToday = 0;

  // happiness drifts toward its target (no sudden jumps)
  const delta = happinessTarget(p) - p.happiness;
  p.happiness += Math.max(-3, Math.min(2, delta));

  // children grow up
  if (day - pop.lastMaturationDay >= MATURATION_INTERVAL_DAYS) {
    pop.lastMaturationDay = day;
    if (pop.children > 0) {
      pop.children -= 1;
      pop.adults += 1;
      logEvent(s, 'info', 'event.matured');
    }
  }

  // growth: newcomers arrive when the valley can house and feed them
  if (growthBlocker(p, day) === null) {
    const roll = rngInt(s, 100);
    if (roll < 70) pop.adults += 1;
    else if (roll < 95) pop.children += 1;
    else pop.elders += 1;
    pop.lastGrowthDay = day;
    logEvent(s, 'success', roll < 70 ? 'event.newAdult' : 'event.newResident', { n: totalPopulation(p) });
  }
}
