import { makeRng } from '../core/rng';
import type { BuildingInstance, GameState, Province } from '../core/types';
import { defOf } from '../data/buildings';
import { isBuilt, isOperating, totalPopulation } from './economy';
import { logEvent } from './events';
import { dispatchService } from './cityLife';

/** Emergencies start once the settlement is a small town. */
export const HEALTH_MIN_POPULATION = 30;
/** Most happiness a fully covered city gains from its hospitals. */
export const HEALTH_MAX_HAPPINESS = 6;
/** Happiness lost at once when nobody answers an emergency call. */
export const UNTREATED_HAPPINESS_LOSS = 1;

function distanceTo(home: BuildingInstance, site: BuildingInstance): number {
  const [w, h] = defOf(site).footprint;
  return Math.max(site.x - home.x, home.x - site.x - w + 1, 0) +
    Math.max(site.y - home.y, home.y - site.y - h + 1, 0);
}

/** Staffed, connected, paid hospitals. */
export const operatingHospitals = (p: Province): BuildingInstance[] =>
  p.buildings.filter((b) => isOperating(b) && !!defOf(b).services?.healthRadius);

/** Closest operating hospital whose ambulances reach `home`, or null. */
export function hospitalFor(p: Province, home: BuildingInstance): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Infinity;
  for (const hospital of operatingHospitals(p)) {
    const distance = distanceTo(home, hospital);
    if (distance <= defOf(hospital).services!.healthRadius! && distance < bestDistance) {
      best = hospital;
      bestDistance = distance;
    }
  }
  return best;
}

/** Daily chance (percent) that some household needs an ambulance. */
export function emergencyChance(p: Province): number {
  const residents = totalPopulation(p);
  if (residents < HEALTH_MIN_POPULATION) return 0;
  return Math.min(45, 10 + Math.floor((residents - HEALTH_MIN_POPULATION) / 3));
}

/** Shared by the simulation, the happiness model and the population panel. */
export function healthServices(p: Province) {
  const homes = p.buildings
    .filter((b) => b.definitionId === 'hut' && isBuilt(b))
    .map((home) => ({ home, hospital: hospitalFor(p, home) }));
  const covered = homes.filter((entry) => entry.hospital).length;
  const coverage = homes.length ? Math.round((covered * 100) / homes.length) : 0;
  return {
    homes,
    covered,
    coverage,
    chance: emergencyChance(p),
    happiness: Math.round((coverage * HEALTH_MAX_HAPPINESS) / 100),
  };
}

/** One possible emergency call per day; a hospital in range sends an ambulance. */
export function healthDayEnd(s: GameState, p: Province, day: number): void {
  const { homes, chance } = healthServices(p);
  if (chance === 0 || homes.length === 0) return;
  // A separate daily roll keeps growth, weather and crime replay sequences stable.
  const rng = makeRng(s.seed ^ Math.imul(day, 0x2545f491));
  if (rng.int(100) >= chance) return;

  const { home, hospital } = homes[rng.int(homes.length)]!;
  const accident = rng.int(2) === 0;
  const at = { x: home.x, y: home.y };
  const where = { x: at.x + 1, y: at.y + 1 };
  if (hospital) {
    // The ambulance really drives out when an asphalt road links the hospital and the home.
    dispatchService(s, p, hospital, home, 'ambulance');
    logEvent(s, 'info', accident ? 'event.emergencyAccidentTreated' : 'event.emergencyIllnessTreated', where, at);
  } else {
    p.happiness = Math.max(0, p.happiness - UNTREATED_HAPPINESS_LOSS);
    logEvent(s, 'warning', accident ? 'event.emergencyAccidentUntreated' : 'event.emergencyIllnessUntreated', where, at);
  }
}
