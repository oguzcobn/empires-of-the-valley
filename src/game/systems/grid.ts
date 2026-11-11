import { BUILDINGS, defOf } from '../data/buildings';
import type { BuildingDefinition, BuildingInstance, Province, Tile } from '../core/types';

/** Minimal province shape needed by spatial helpers (lets terrain generation reuse them). */
export type GridLike = Pick<Province, 'width' | 'height' | 'tiles' | 'buildings'>;

export const idx = (g: Pick<Province, 'width'>, x: number, y: number): number => y * g.width + x;
export const inBounds = (g: Pick<Province, 'width' | 'height'>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < g.width && y < g.height;
export const tileAt = (g: GridLike, x: number, y: number): Tile | undefined =>
  inBounds(g, x, y) ? g.tiles[idx(g, x, y)] : undefined;

export const NEIGHBORS4: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function footprintTiles(def: BuildingDefinition, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = 0; dy < def.footprint[1]; dy++)
    for (let dx = 0; dx < def.footprint[0]; dx++) out.push([x + dx, y + dy]);
  return out;
}

/** Tiles 4-adjacent to a footprint rectangle (outside it). */
export function perimeterTiles(def: BuildingDefinition, x: number, y: number): [number, number][] {
  const [w, h] = def.footprint;
  const out: [number, number][] = [];
  for (let dx = 0; dx < w; dx++) out.push([x + dx, y - 1], [x + dx, y + h]);
  for (let dy = 0; dy < h; dy++) out.push([x - 1, y + dy], [x + w, y + dy]);
  return out;
}

/** Indexes of tiles of `terrain` within Chebyshev `radius` of the footprint. */
export function tilesInRange(g: GridLike, def: BuildingDefinition, x: number, y: number): number[] {
  if (!def.harvests) return [];
  const { terrain, radius } = def.harvests;
  const out: number[] = [];
  for (let ty = y - radius; ty < y + def.footprint[1] + radius; ty++)
    for (let tx = x - radius; tx < x + def.footprint[0] + radius; tx++) {
      const t = tileAt(g, tx, ty);
      if (t && t.terrain === terrain) out.push(idx(g, tx, ty));
    }
  return out;
}

export const buildingById = (p: Pick<Province, 'buildings'>, id: string): BuildingInstance | undefined =>
  p.buildings.find((b) => b.id === id);

export const townCenter = (p: Pick<Province, 'buildings'>): BuildingInstance | undefined =>
  p.buildings.find((b) => b.definitionId === 'town_center');

/**
 * Set of road tile indexes reachable from the town center.
 * Roads are the logistics network: only buildings touching this set operate.
 */
export function connectedRoads(g: GridLike): Set<number> {
  const seen = new Set<number>();
  const tc = townCenter(g);
  if (!tc) return seen;
  const queue: [number, number][] = [];
  for (const [x, y] of perimeterTiles(BUILDINGS.town_center, tc.x, tc.y)) {
    const t = tileAt(g, x, y);
    if (t?.road && !seen.has(idx(g, x, y))) {
      seen.add(idx(g, x, y));
      queue.push([x, y]);
    }
  }
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      const t = tileAt(g, nx, ny);
      if (t?.road && !seen.has(idx(g, nx, ny))) {
        seen.add(idx(g, nx, ny));
        queue.push([nx, ny]);
      }
    }
  }
  return seen;
}

export function touchesRoads(
  g: GridLike,
  def: BuildingDefinition,
  x: number,
  y: number,
  roads: Set<number>,
): boolean {
  return perimeterTiles(def, x, y).some(([px, py]) => inBounds(g, px, py) && roads.has(idx(g, px, py)));
}

/** Recomputes the cached `connected` flag of every building. Call after any structural change. */
export function refreshConnectivity(p: Province): void {
  const roads = connectedRoads(p);
  for (const b of p.buildings) {
    b.connected = b.definitionId === 'town_center' || touchesRoads(p, defOf(b), b.x, b.y, roads);
  }
}
