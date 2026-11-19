import type { Province } from '../core/types';
import { tileAt } from '../systems/grid';

export type GridPoint = [number, number];

export function findRoadPath(p: Province, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  const valid = ([x, y]: GridPoint): boolean => tileAt(p, x, y)?.road === true;
  if (!valid(goal)) return null;
  // If the original assembly area has been paved over, start at the closest road.
  if (!valid(start)) {
    let best = Infinity;
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      if (!valid([x, y])) continue;
      const dist = Math.abs(x - start[0]) + Math.abs(y - start[1]);
      if (dist < best) { best = dist; start = [x, y]; }
    }
  }
  if (!valid(start)) return null;
  const index = ([x, y]: GridPoint): number => y * p.width + x;
  const from = new Map<number, number>();
  const queue: GridPoint[] = [start];
  const startId = index(start);
  const goalId = index(goal);
  from.set(startId, -1);
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    if (index(cur) === goalId) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: GridPoint = [cur[0] + dx, cur[1] + dy];
      const id = index(next);
      if (!valid(next) || from.has(id)) continue;
      from.set(id, index(cur));
      queue.push(next);
    }
  }
  if (!from.has(goalId)) return null;
  const result: GridPoint[] = [];
  for (let id = goalId; id !== -1; id = from.get(id)!) result.push([id % p.width, Math.floor(id / p.width)]);
  return result.reverse();
}

/**
 * Tiles soldiers can cross on foot: any dry land without a building (fields, forest, hills,
 * mountains), every road including bridges; never open water. A building tile is allowed only
 * as the destination, where the troops muster in front of it.
 */
export function marchable(p: Province, x: number, y: number, goal?: GridPoint): boolean {
  const t = tileAt(p, x, y);
  if (!t) return false;
  if (t.road) return true;
  if (t.terrain === 'water' || t.terrain === 'lake') return false;
  if (t.buildingId) return !!goal && goal[0] === x && goal[1] === y;
  return true;
}

/** Shortest cross-country route (4-neighbour BFS) between two marchable tiles, or null. */
export function findGroundPath(p: Province, start: GridPoint, goal: GridPoint): GridPoint[] | null {
  if (!marchable(p, goal[0], goal[1], goal)) return null;
  if (!marchable(p, start[0], start[1], start)) {
    // the last position may have been built over: step off to the closest open tile
    let best = Infinity;
    let found: GridPoint | null = null;
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const dist = Math.abs(x - start[0]) + Math.abs(y - start[1]);
      if (dist < best && marchable(p, x, y)) { best = dist; found = [x, y]; }
    }
    if (!found) return null;
    start = found;
  }
  const index = ([x, y]: GridPoint): number => y * p.width + x;
  const from = new Map<number, number>([[index(start), -1]]);
  const queue: GridPoint[] = [start];
  const goalId = index(goal);
  for (let i = 0; i < queue.length && !from.has(goalId); i++) {
    const cur = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: GridPoint = [cur[0] + dx, cur[1] + dy];
      const id = index(next);
      if (from.has(id) || !marchable(p, next[0], next[1], goal)) continue;
      from.set(id, index(cur));
      queue.push(next);
    }
  }
  if (!from.has(goalId)) return null;
  const result: GridPoint[] = [];
  for (let id = goalId; id !== -1; id = from.get(id)!) result.push([id % p.width, Math.floor(id / p.width)]);
  return result.reverse();
}

/** Where the troops stand before their first order: the town centre's doorstep. */
export function musterPoint(p: Province): GridPoint {
  const tc = p.buildings.find((b) => b.definitionId === 'town_center');
  if (tc) {
    for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r + 1; dy++) for (let dx = -r; dx <= r + 1; dx++) {
        const x = tc.x + dx, y = tc.y + dy;
        if (marchable(p, x, y)) return [x, y];
      }
  }
  const id = p.tiles.findIndex((_, i) => marchable(p, i % p.width, Math.floor(i / p.width)));
  return [Math.max(0, id) % p.width, Math.floor(Math.max(0, id) / p.width)];
}
