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
