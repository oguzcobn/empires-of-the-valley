import { makeRng } from '../core/rng';
import type { BuildingInstance, GameState, Province } from '../core/types';
import { defOf, specOf } from '../data/buildings';
import { idleWorkers, isBuilt, isHome, isOperating, totalPopulation } from './economy';
import { logEvent } from './events';

function distanceTo(home: BuildingInstance, site: BuildingInstance): number {
  const [w, h] = defOf(site).footprint;
  return Math.max(site.x - home.x, home.x - site.x - w + 1, 0) +
    Math.max(site.y - home.y, home.y - site.y - h + 1, 0);
}

export function neighborhoodServices(p: Province) {
  const venues = p.buildings.filter((b) => isOperating(b) && defOf(b).services?.community);
  const stations = p.buildings.filter((b) => isOperating(b) && defOf(b).services?.patrolRadius);
  const residents = totalPopulation(p);
  const pressure = residents < 30 ? 0 : Math.min(65,
    5 + Math.floor((residents - 30) / 2) +
    (p.population.starvationDays > 0 ? 14 : 0) +
    (idleWorkers(p) > p.population.adults / 2 ? 7 : 0) +
    (p.taxRate === 'high' ? 7 : 0),
  );
  const homes = p.buildings.filter((b) => isHome(b) && isBuilt(b)).map((home) => {
    const venuesByType = new Map<string, number>();
    for (const venue of venues) {
      if (distanceTo(home, venue) > 5) continue;
      const score = Math.round(defOf(venue).services!.community! * venue.workers / specOf(venue).workerSlots);
      venuesByType.set(venue.definitionId, Math.max(venuesByType.get(venue.definitionId) ?? 0, score));
    }
    let protection = 0;
    for (const station of stations) {
      if (distanceTo(home, station) <= defOf(station).services!.patrolRadius!) protection += station.workers * 15;
    }
    return {
      home,
      protection,
      risk: Math.max(0, pressure - protection),
      community: Math.min(12, [...venuesByType.values()].reduce((sum, value) => sum + value, 0)),
    };
  });
  const average = (field: 'risk' | 'community') =>
    Math.round(homes.reduce((sum, home) => sum + home[field], 0) / Math.max(1, homes.length));

  return { homes, pressure, risk: average('risk'), community: average('community') };
}

export function crimeDayEnd(s: GameState, p: Province, day: number): void {
  const { homes, pressure } = neighborhoodServices(p);
  if (pressure === 0 || homes.length === 0) return;
  // A separate daily roll keeps growth and weather replay sequences stable.
  const rng = makeRng(s.seed ^ Math.imul(day, 0x6d2b79f5));
  const roll = rng.int(100);
  if (roll >= pressure) return;

  const { home, risk } = homes[rng.int(homes.length)]!;
  const at = { x: home.x, y: home.y };
  const where = { x: at.x + 1, y: at.y + 1 };
  if (roll >= risk) {
    logEvent(s, 'info', 'event.crimePatrol', where, at);
  } else if (rng.int(2) === 0 && p.stocks.gold >= 100) {
    const loss = Math.min(p.stocks.gold, Math.max(500, risk * 60));
    p.stocks.gold -= loss;
    p.today.consumed.gold += loss;
    logEvent(s, 'warning', 'event.crimeTheft', { ...where, gold: loss / 1000 }, at);
  } else {
    home.condition = Math.max(0, home.condition - 450);
    logEvent(s, 'warning', 'event.crimeVandalism', { ...where, building: `@building.${home.definitionId}.name` }, at);
  }
}
