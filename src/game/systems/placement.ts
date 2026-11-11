import type { BuildingDefinition, MessageRef } from '../core/types';
import {
  NEIGHBORS4,
  connectedRoads,
  footprintTiles,
  idx,
  inBounds,
  tileAt,
  tilesInRange,
  touchesRoads,
} from './grid';
import type { GridLike } from './grid';

const ROAD_TERRAINS = ['grass', 'fertile', 'sand'];

/** Terrain/collision/logistics rules for a footprint. Cost and unlock checks live in commands.ts. */
export function checkSite(
  g: GridLike,
  def: BuildingDefinition,
  x: number,
  y: number,
  roads: Set<number> = connectedRoads(g),
): MessageRef | null {
  for (const [tx, ty] of footprintTiles(def, x, y)) {
    const t = tileAt(g, tx, ty);
    if (!t) return { key: 'err.outOfBounds' };
    if (t.buildingId) return { key: 'err.occupied' };
    if (t.road) return { key: 'err.onRoad' };
    if (!def.validTerrains.includes(t.terrain)) {
      if (def.id === 'farm') return { key: 'err.needFertile' };
      return { key: `err.terrain.${t.terrain}` };
    }
  }
  if (def.harvests && !tilesInRange(g, def, x, y).some((i) => g.tiles[i]!.deposit > 0)) {
    return { key: def.harvests.terrain === 'forest' ? 'err.needForest' : 'err.needStone' };
  }
  if (!touchesRoads(g, def, x, y, roads)) return { key: 'err.noRoad' };
  return null;
}

export function canHoldRoad(g: GridLike, x: number, y: number): boolean {
  const t = tileAt(g, x, y);
  return !!t && !t.road && !t.buildingId && ROAD_TERRAINS.includes(t.terrain);
}

export function checkRoadSite(g: GridLike, x: number, y: number): MessageRef | null {
  const t = tileAt(g, x, y);
  if (!t) return { key: 'err.outOfBounds' };
  if (t.road) return { key: 'err.alreadyRoad' };
  if (t.buildingId) return { key: 'err.occupied' };
  if (!ROAD_TERRAINS.includes(t.terrain)) return { key: `err.terrain.${t.terrain}` };
  const adjacent = NEIGHBORS4.some(([dx, dy]) => tileAt(g, x + dx, y + dy)?.road);
  if (!adjacent) return { key: 'err.roadNotAdjacent' };
  return null;
}

export interface SitePlan {
  x: number;
  y: number;
  /** Road tiles to lay (in order) so that the site touches the network. */
  roads: [number, number][];
}

/**
 * Finds the nearest valid site for a building, including the road that has to be built to reach
 * it. Used by terrain validation (guaranteed playable start) and by automated playthrough tests.
 */
export function findSite(g: GridLike, def: BuildingDefinition): SitePlan | null {
  const start = connectedRoads(g);
  const prev = new Map<number, number>();
  const queue: number[] = [...start].sort((a, b) => a - b);
  const seen = new Set<number>(queue);
  while (queue.length) {
    const cur = queue.shift()!;
    const cx = cur % g.width;
    const cy = Math.floor(cur / g.width);
    // path of new road tiles from the existing network to `cur`
    const path: [number, number][] = [];
    for (let n: number | undefined = cur; n !== undefined && !start.has(n); n = prev.get(n)) {
      path.unshift([n % g.width, Math.floor(n / g.width)]);
    }
    const pathSet = new Set(path.map(([px, py]) => idx(g, px, py)));
    const roadsAfter = new Set([...start, ...pathSet]);
    const [w, h] = def.footprint;
    for (let oy = cy - h; oy <= cy + 1; oy++)
      for (let ox = cx - w; ox <= cx + 1; ox++) {
        if (
          footprintTiles(def, ox, oy).some(([fx, fy]) => !inBounds(g, fx, fy) || pathSet.has(idx(g, fx, fy)))
        )
          continue;
        if (checkSite(g, def, ox, oy, roadsAfter) === null) return { x: ox, y: oy, roads: path };
      }
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(g, nx, ny)) continue;
      const ni = idx(g, nx, ny);
      if (seen.has(ni) || !canHoldRoad(g, nx, ny)) continue;
      seen.add(ni);
      prev.set(ni, cur);
      queue.push(ni);
    }
  }
  return null;
}
