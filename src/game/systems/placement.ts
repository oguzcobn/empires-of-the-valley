import type { BuildingDefinition, MessageRef, RoadType, SiteRule, TerrainId } from '../core/types';
import {
  NEIGHBORS4,
  canLink,
  connectedRoads,
  footprintTiles,
  idx,
  inBounds,
  perimeterPairs,
  tileAt,
  tilesInRange,
  touchesRoads,
  townCenter,
} from './grid';
import type { GridLike } from './grid';

/** Terrain a road can be laid on (with the structure it becomes). */
const DIRT_TERRAINS: readonly TerrainId[] = ['grass', 'fertile', 'sand', 'hill', 'terrace'];

const chebyshev = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function countInRadius(g: GridLike, x0: number, y0: number, x1: number, y1: number, r: number, test: (x: number, y: number) => boolean): number {
  let n = 0;
  for (let y = y0 - r; y <= y1 + r; y++)
    for (let x = x0 - r; x <= x1 + r; x++) if (inBounds(g, x, y) && test(x, y)) n++;
  return n;
}

/**
 * Special terrain rules of historic landmarks — evaluated on real tile data, never just shown.
 * Returns null when satisfied. Roads are not considered here (see checkSite).
 */
export function siteRuleError(g: GridLike, def: BuildingDefinition, x: number, y: number, rule: SiteRule): MessageRef | null {
  const [w, h] = def.footprint;
  const tiles = footprintTiles(def, x, y).map(([tx, ty]) => tileAt(g, tx, ty)!);
  const heights = tiles.map((t) => t.height);
  const top = Math.max(...heights);
  const low = Math.min(...heights);
  const lowerAround = perimeterPairs(def, x, y).filter(([px, py, fx, fy]) => {
    const t = tileAt(g, px, py);
    return !!t && t.height < tileAt(g, fx, fy)!.height;
  }).length;
  const fail = { key: `err.site.${rule}` } as MessageRef;
  switch (rule) {
    case 'crag':
      return low >= 2 && top === low && lowerAround >= 3 ? null : fail;
    case 'castleHill':
      return low >= 1 && top === low && lowerAround >= 3 ? null : fail;
    case 'cityGarden': {
      const tc = townCenter(g);
      if (!tc || top !== 0 || low !== 0) return fail;
      if (chebyshev(x, y, tc.x, tc.y) > 6) return fail;
      return null;
    }
    case 'mountainside': {
      if (low < 2 || top - low > 1) return fail;
      const behind = [];
      for (let dx = 0; dx < w; dx++) behind.push(tileAt(g, x + dx, y - 1));
      for (let dy = 0; dy < h; dy++) behind.push(tileAt(g, x - 1, y + dy));
      if (!behind.some((t) => t && t.height > top)) return fail;
      const forest = countInRadius(g, x, y, x + w - 1, y + h - 1, 4, (tx, ty) => tileAt(g, tx, ty)!.terrain === 'forest');
      return forest >= 3 ? null : fail;
    }
    case 'hilltopWater': {
      if (low < 1 || top !== low) return fail;
      const water = countInRadius(g, x, y, x + w - 1, y + h - 1, 6, (tx, ty) => {
        const t = tileAt(g, tx, ty)!.terrain;
        return t === 'water' || t === 'lake';
      });
      return water > 0 ? null : fail;
    }
    case 'grandPlain': {
      const tc = townCenter(g);
      if (top - low > 1 || !tc || chebyshev(x, y, tc.x, tc.y) > 10) return fail;
      return null;
    }
  }
}

/** Road-related site requirements that only make sense once the city exists (city garden). */
function siteRoadError(g: GridLike, def: BuildingDefinition, x: number, y: number): MessageRef | null {
  if (def.landmark?.site !== 'cityGarden') return null;
  const [w, h] = def.footprint;
  const roads = countInRadius(g, x, y, x + w - 1, y + h - 1, 3, (tx, ty) => tileAt(g, tx, ty)!.road);
  return roads >= 6 ? null : { key: 'err.site.cityGarden' };
}

/** Terrain-only part of the site check (bounds, collisions, terrain types, flatness, site rule). */
export function terrainSiteError(g: GridLike, def: BuildingDefinition, x: number, y: number): MessageRef | null {
  let first: number | null = null;
  let low = Infinity;
  let top = -Infinity;
  for (const [tx, ty] of footprintTiles(def, x, y)) {
    const t = tileAt(g, tx, ty);
    if (!t) return { key: 'err.outOfBounds' };
    if (t.buildingId) return { key: 'err.occupied' };
    if (t.road) return { key: 'err.onRoad' };
    if (!def.validTerrains.includes(t.terrain)) {
      if (def.id === 'farm') return { key: 'err.needFertile' };
      return { key: `err.terrain.${t.terrain}` };
    }
    first ??= t.height;
    low = Math.min(low, t.height);
    top = Math.max(top, t.height);
  }
  if (!def.allowSlope && top !== low) return { key: 'err.uneven' };
  if (def.landmark) return siteRuleError(g, def, x, y, def.landmark.site);
  return null;
}

/** Terrain/collision/logistics rules for a footprint. Cost and unlock checks live in commands.ts. */
export function checkSite(
  g: GridLike,
  def: BuildingDefinition,
  x: number,
  y: number,
  roads: Set<number> = connectedRoads(g),
): MessageRef | null {
  const terrain = terrainSiteError(g, def, x, y);
  if (terrain) return terrain;
  if (def.harvests && !tilesInRange(g, def, x, y).some((i) => g.tiles[i]!.deposit > 0)) {
    return { key: def.harvests.terrain === 'forest' ? 'err.needForest' : 'err.needStone' };
  }
  const roadRule = siteRoadError(g, def, x, y);
  if (roadRule) return roadRule;
  if (!touchesRoads(g, def, x, y, roads)) return { key: 'err.noRoad' };
  return null;
}

/**
 * The structure a new road on (x, y) becomes: bridge over the river, tunnel through mountains,
 * mountain road on rocks, stairs where it climbs one level from a neighbour, otherwise dirt.
 * `from` is the road tile it will join when planning (defaults to existing roads around it).
 */
export function roadTypeFor(g: GridLike, x: number, y: number, from?: { height: number }): RoadType | null {
  const t = tileAt(g, x, y);
  if (!t) return null;
  if (t.terrain === 'water') return 'bridge';
  if (t.terrain === 'mountain') return 'tunnel';
  if (t.terrain === 'rocky') return 'mountain';
  if (!DIRT_TERRAINS.includes(t.terrain)) return null;
  const climbs = from
    ? Math.abs(from.height - t.height) === 1
    : NEIGHBORS4.some(([dx, dy]) => {
        const n = tileAt(g, x + dx, y + dy);
        return !!n?.road && Math.abs(n.height - t.height) === 1;
      });
  return climbs ? 'stairs' : 'dirt';
}

export function canHoldRoad(g: GridLike, x: number, y: number): boolean {
  const t = tileAt(g, x, y);
  return !!t && !t.road && !t.buildingId && roadTypeFor(g, x, y) !== null;
}

export function checkRoadSite(g: GridLike, x: number, y: number): MessageRef | null {
  const t = tileAt(g, x, y);
  if (!t) return { key: 'err.outOfBounds' };
  if (t.road) return { key: 'err.alreadyRoad' };
  if (t.buildingId) return { key: 'err.occupied' };
  if (t.terrain === 'lake') return { key: 'err.lakeRoad' };
  const type = roadTypeFor(g, x, y);
  if (!type) return { key: `err.terrain.${t.terrain}` };
  const neighbours = NEIGHBORS4.map(([dx, dy]) => tileAt(g, x + dx, y + dy)).filter((n) => n?.road);
  if (!neighbours.length) return { key: 'err.roadNotAdjacent' };
  const me = { height: t.height, roadType: type };
  if (!neighbours.some((n) => canLink(me, n!))) {
    const dh = Math.min(...neighbours.map((n) => Math.abs(n!.height - t.height)));
    return { key: 'err.roadTooSteep', params: { n: dh } };
  }
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
 * Planned roads follow the same height rules as real ones (stairs, mountain roads, bridges; no
 * tunnels, which need research).
 */
export function findSite(g: GridLike, def: BuildingDefinition, maxRoads = 60): SitePlan | null {
  const start = connectedRoads(g);
  const prev = new Map<number, number>();
  const depth = new Map<number, number>();
  const queue: number[] = [...start].sort((a, b) => a - b);
  const seen = new Set<number>(queue);
  for (const i of queue) depth.set(i, 0);
  const virtual = new Map<number, { height: number; roadType: RoadType }>();
  const roadOf = (i: number): { height: number; roadType: RoadType } => virtual.get(i) ?? g.tiles[i]!;
  while (queue.length) {
    const cur = queue.shift()!;
    const cx = cur % g.width;
    const cy = Math.floor(cur / g.width);
    const path: [number, number][] = [];
    for (let n: number | undefined = cur; n !== undefined && !start.has(n); n = prev.get(n)) {
      path.unshift([n % g.width, Math.floor(n / g.width)]);
    }
    const pathSet = new Set(path.map(([px, py]) => idx(g, px, py)));
    const roadsAfter = new Set([...start, ...pathSet]);
    const [w, h] = def.footprint;
    for (let oy = cy - h; oy <= cy + 1; oy++)
      for (let ox = cx - w; ox <= cx + 1; ox++) {
        if (footprintTiles(def, ox, oy).some(([fx, fy]) => !inBounds(g, fx, fy) || pathSet.has(idx(g, fx, fy)))) continue;
        if (checkSite(g, def, ox, oy, roadsAfter) === null) return { x: ox, y: oy, roads: path };
      }
    if ((depth.get(cur) ?? 0) >= maxRoads) continue;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(g, nx, ny)) continue;
      const ni = idx(g, nx, ny);
      if (seen.has(ni) || !canHoldRoad(g, nx, ny)) continue;
      const t = g.tiles[ni]!;
      const type = roadTypeFor(g, nx, ny, roadOf(cur));
      if (!type || type === 'tunnel') continue;
      const node = { height: t.height, roadType: type };
      if (!canLink(roadOf(cur), node)) continue;
      seen.add(ni);
      prev.set(ni, cur);
      depth.set(ni, (depth.get(cur) ?? 0) + 1);
      virtual.set(ni, node);
      queue.push(ni);
    }
  }
  return null;
}
