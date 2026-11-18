import type { BuildingInstance, Province } from '../core/types';
import { defOf } from '../data/buildings';
import { NEIGHBORS4, footprintTiles, tileAt } from '../systems/grid';
import { vehicleLaneOffset } from './trafficMath';

export type GridPoint = [number, number];

/** Road tiles a wheeled vehicle can use: everything except stairways. */
export const drivable = (p: Province, x: number, y: number): boolean => {
  const t = tileAt(p, x, y);
  return !!t?.road && t.roadType !== 'stairs';
};

/** Shortest drivable route between two road tiles (both included), or null. */
export function findDrivePath(p: Province, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  if (!drivable(p, start[0], start[1]) || !drivable(p, goal[0], goal[1])) return null;
  const index = (x: number, y: number): number => y * p.width + x;
  const from = new Map<number, number>([[index(start[0], start[1]), -1]]);
  const queue: GridPoint[] = [start];
  const goalId = index(goal[0], goal[1]);
  for (let i = 0; i < queue.length && !from.has(goalId); i++) {
    const [cx, cy] = queue[i]!;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx, ny = cy + dy;
      if (!drivable(p, nx, ny) || from.has(index(nx, ny))) continue;
      from.set(index(nx, ny), index(cx, cy));
      queue.push([nx, ny]);
    }
  }
  if (!from.has(goalId)) return null;
  const path: GridPoint[] = [];
  for (let id = goalId; id !== -1; id = from.get(id)!) path.push([id % p.width, Math.floor(id / p.width)]);
  return path.reverse();
}

/** Drivable road tiles touching a building's footprint, nearest to `near` (tile units) first. */
export function gateTiles(p: Province, b: BuildingInstance, near: readonly [number, number]): GridPoint[] {
  const seen = new Set<string>();
  const gates: GridPoint[] = [];
  for (const [fx, fy] of footprintTiles(defOf(b), b.x, b.y)) {
    for (const [dx, dy] of NEIGHBORS4) {
      const x = fx + dx, y = fy + dy;
      const key = `${x},${y}`;
      if (seen.has(key) || tileAt(p, x, y)?.buildingId === b.id || !drivable(p, x, y)) continue;
      seen.add(key);
      gates.push([x, y]);
    }
  }
  const distance = ([x, y]: GridPoint): number => Math.abs(x + 0.5 - near[0]) + Math.abs(y + 0.5 - near[1]);
  return gates.sort((a, c) => distance(a) - distance(c));
}

/** Closest drivable road tile to a map point within `reach` tiles (Manhattan), or null. */
export function roadNear(p: Province, at: { x: number; y: number }, reach = 4): GridPoint | null {
  let best: GridPoint | null = null;
  let bestDistance = Infinity;
  for (let y = at.y - reach; y <= at.y + reach; y++) {
    for (let x = at.x - reach; x <= at.x + reach; x++) {
      const distance = Math.abs(x - at.x) + Math.abs(y - at.y);
      if (distance > reach || distance >= bestDistance || !drivable(p, x, y)) continue;
      best = [x, y];
      bestDistance = distance;
    }
  }
  return best;
}

/** Drivable road tiles within `radius` of a building's footprint (patrol beat). */
export function beatTiles(p: Province, b: BuildingInstance, radius: number): GridPoint[] {
  const [w, h] = defOf(b).footprint;
  const tiles: GridPoint[] = [];
  for (let y = b.y - radius; y < b.y + h + radius; y++) {
    for (let x = b.x - radius; x < b.x + w + radius; x++) {
      const distance = Math.max(b.x - x, x - b.x - w + 1, 0) + Math.max(b.y - y, y - b.y - h + 1, 0);
      if (distance <= radius && drivable(p, x, y)) tiles.push([x, y]);
    }
  }
  return tiles;
}

export interface Waypoint {
  /** Position in fractional tile units. */
  x: number;
  y: number;
  /** Tile the point belongs to (for elevation and re-routing). */
  tile: GridPoint;
}

/**
 * Lane-keeping polyline through the centres of `tiles`: vehicles hold their side of the road
 * and square the corners inside the junction tile, so every segment stays axis-aligned.
 */
export function laneWaypoints(tiles: readonly GridPoint[], leftSideDriving: boolean): Waypoint[] {
  return tiles.map((tile, i) => {
    const prev = tiles[i - 1];
    const next = tiles[i + 1];
    const inward = prev ? vehicleLaneOffset(tile[0] - prev[0], tile[1] - prev[1], leftSideDriving) : null;
    const outward = next ? vehicleLaneOffset(next[0] - tile[0], next[1] - tile[1], leftSideDriving) : null;
    const a = inward ?? outward ?? [0, 0];
    const b = outward ?? inward ?? [0, 0];
    const straight = a[0] === b[0] && a[1] === b[1];
    return {
      x: tile[0] + 0.5 + (straight ? a[0] : a[0] + b[0]),
      y: tile[1] + 0.5 + (straight ? a[1] : a[1] + b[1]),
      tile,
    };
  });
}
