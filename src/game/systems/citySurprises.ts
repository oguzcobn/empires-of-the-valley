import type { CitySurprise, GameState, Province, SurpriseKind, SurprisePoint } from '../core/types';
import { TICKS_PER_DAY } from '../core/time';
import { makeRng } from '../core/rng';
import { defOf, specOf } from '../data/buildings';
import { findGroundPath, findRoadPath, marchable, musterPoint } from '../rendering/armyPath';
import { detachBuilding, NEIGHBORS4, idx, tileAt, townCenter } from './grid';
import { logEvent } from './events';
import { loseMilitia } from './security';

const DAY = TICKS_PER_DAY;
export const DEFENSE_THRESHOLD = 100;
const distance = (a: SurprisePoint, b: SurprisePoint): number => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const point = ([x, y]: SurprisePoint) => ({ x, y });
const center = (p: Province): SurprisePoint => {
  const building = townCenter(p);
  return building ? [building.x, building.y] : musterPoint(p);
};

export function surpriseTimeline(event: CitySurprise) {
  const landing = event.kind === 'ufo' ? 5 : 8;
  const confrontation = landing + 3 + Math.max(5, Math.ceil(event.walk.length / 2));
  const resolution = confrontation + (event.kind === 'pirates' ? 7 : 3);
  const boarding = resolution + Math.max(5, Math.ceil(event.walk.length / 2)) + 2;
  return { landing, confrontation, resolution, boarding, departure: boarding + 7 };
}

function ufoRoute(p: Province, seed: number): CitySurprise['walk'] | null {
  const city = center(p);
  const nearby = p.tiles.flatMap((tile, i): SurprisePoint[] => {
    const at: SurprisePoint = [i % p.width, Math.floor(i / p.width)];
    return tile.road && !tile.buildingId && distance(at, city) <= 12 ? [at] : [];
  });
  nearby.sort((a, b) => distance(a, city) - distance(b, city));
  const rng = makeRng(seed);
  const start = nearby[Math.min(rng.int(4), nearby.length - 1)] ?? musterPoint(p);
  const circuit = nearby.slice().reverse();
  for (const dest of circuit) {
    const path = findRoadPath(p, start, dest);
    if (path && path.length >= 4) return path.slice(0, 12);
  }
  for (const [dx, dy] of NEIGHBORS4) {
    const dest: SurprisePoint = [start[0] + 4 * dx, start[1] + 4 * dy];
    if (!marchable(p, ...dest)) continue;
    const path = findGroundPath(p, start, dest);
    if (path) return path.slice(0, 12);
  }
  return null;
}

function coastRoute(p: Province): { approach: SurprisePoint[]; walk: SurprisePoint[] } | null {
  const water = (x: number, y: number) => {
    const tile = tileAt(p, x, y);
    return !!tile && (tile.terrain === 'water' || tile.terrain === 'lake') && !tile.road && !tile.buildingId;
  };
  const harbor: SurprisePoint[] = [];
  const prev = new Map<number, number>();
  const queue: SurprisePoint[] = [];
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if ((x === 0 || y === 0 || x === p.width - 1 || y === p.height - 1) && water(x, y)) {
      queue.push([x, y]);
      prev.set(idx(p, x, y), -1);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    const id = idx(p, x, y);
    // Leave the approach open for a ship's silhouette and its wake.
    if (NEIGHBORS4.some(([dx, dy]) => {
      const tile = tileAt(p, x + dx, y + dy);
      return tile && tile.terrain !== 'water' && tile.terrain !== 'lake' && !tile.buildingId;
    })) harbor.push([x, y]);
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx, ny = y + dy;
      const next = idx(p, nx, ny);
      if (!water(nx, ny) || prev.has(next)) continue;
      prev.set(next, id);
      queue.push([nx, ny]);
    }
  }
  const city = center(p);
  const muster = musterPoint(p);
  harbor.sort((a, b) => distance(a, city) - distance(b, city));
  for (const [x, y] of harbor.slice(0, 24)) {
    for (const [dx, dy] of NEIGHBORS4) {
      const landing: SurprisePoint = [x + dx, y + dy];
      const tile = tileAt(p, ...landing);
      if (!tile || tile.terrain === 'water' || tile.terrain === 'lake' || tile.buildingId) continue;
      const walk = findGroundPath(p, landing, muster);
      if (!walk) continue;
      const approach: SurprisePoint[] = [];
      for (let index = idx(p, x, y); index >= 0; index = prev.get(index) ?? -1)
        approach.push([index % p.width, Math.floor(index / p.width)]);
      if (approach.length >= 2) return { approach: approach.reverse(), walk };
    }
  }
  return null;
}

/** Attempts to start an encounter without changing RNG, units or buildings on failure. */
export function startCitySurprise(s: GameState, p: Province, kind: SurpriseKind): boolean {
  if (s.surprise) return false;
  if (kind === 'ufo') {
    const walk = ufoRoute(p, s.seed ^ s.tick);
    if (!walk) return false;
    const [x, y] = walk[0]!;
    s.surprise = { kind, startedAt: s.tick, approach: [[x, 0], [x, y]], walk, defense: [] };
    logEvent(s, 'warning', 'event.surpriseUfo', undefined, { x, y });
    return true;
  }
  const route = coastRoute(p);
  if (!route) return false;
  const goal = route.walk.at(-1)!;
  const from: SurprisePoint = s.armyTarget ? [s.armyTarget.x, s.armyTarget.y] : musterPoint(p);
  const defense = findGroundPath(p, from, goal) ?? [goal];
  s.surprise = { kind, startedAt: s.tick, ...route, defense };
  logEvent(s, 'danger', 'event.surprisePirates', undefined, point(route.walk[0]!));
  return true;
}

function resolveRaid(s: GameState, p: Province, event: CitySurprise): void {
  const defenders = s.militia ?? 0;
  const win = defenders > DEFENSE_THRESHOLD;
  const losses = loseMilitia(s, win ? 3 : 8);
  const at = event.walk.at(-1)!;
  event.defenders = defenders;
  event.outcome = win ? 'repelled' : 'breached';
  const homes = win ? [] : p.buildings.filter(b => defOf(b).demolishable && b.state !== 'construction'
    && specOf(b).housing > 0 && Object.keys(specOf(b).storage).length === 0)
    .sort((a, b) => distance([a.x, a.y], at) - distance([b.x, b.y], at))
    .slice(0, defenders < 50 ? 2 : 1);
  const first = homes[0];
  event.damage = homes.map(home => [home.x, home.y]);
  for (const home of homes) detachBuilding(p, home);
  logEvent(s, win ? 'success' : 'danger', win ? 'event.surpriseRepelled' : 'event.surpriseBreach',
    { defenders, houses: homes.length, losses }, first ? { x: first.x, y: first.y } : point(at));
}

export function citySurpriseTick(s: GameState, p: Province): void {
  const active = s.surprise;
  if (active) {
    const age = s.tick - active.startedAt;
    const { resolution, departure } = surpriseTimeline(active);
    if (active.kind === 'pirates' && !active.outcome && age >= resolution) resolveRaid(s, p, active);
    if (age >= departure) {
      if (active.kind === 'ufo') logEvent(s, 'info', 'event.surpriseUfoGone');
      delete s.surprise;
      s.nextSurpriseKind = active.kind === 'ufo' ? 'pirates' : 'ufo';
      s.nextSurpriseTick = s.tick + (17 + makeRng(s.seed ^ s.tick).int(18)) * DAY;
    }
    return;
  }

  if (s.tick % DAY !== 10) return;
  const first = (15 + makeRng(s.seed).int(12)) * DAY;
  if (s.tick < (s.nextSurpriseTick ?? first)) return;
  const next = s.nextSurpriseKind ?? 'ufo';
  if (next === 'pirates' && s.mode === 'campaign' && !s.completedChapters.includes(1)) {
    s.nextSurpriseTick = s.tick + 5 * DAY;
    return;
  }
  if (!startCitySurprise(s, p, next) && !startCitySurprise(s, p, 'ufo'))
    s.nextSurpriseTick = s.tick + 3 * DAY;
}
