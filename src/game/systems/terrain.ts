import { makeRng } from '../core/rng';
import type { LocalRng } from '../core/rng';
import type { ArchitectureStyle, BuildingId, BuildingInstance, TerrainId, Tile } from '../core/types';
import { CONDITION_MAX, LEGACY_STYLE } from '../data/architecture';
import { FOREST_TILE_MAX, MAP_SIZE, STONE_TILE_MAX } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { footprintTiles } from './grid';
import type { GridLike } from './grid';
import { findSite } from './placement';

export interface StartLayout {
  buildings: { definitionId: BuildingId; x: number; y: number }[];
  roads: [number, number][];
}

/** Fixed, hand-placed starting hamlet in the centre of the valley. */
export const START_LAYOUT: StartLayout = {
  buildings: [
    { definitionId: 'town_center', x: 11, y: 11 },
    { definitionId: 'warehouse', x: 14, y: 11 },
    { definitionId: 'hut', x: 8, y: 14 },
    { definitionId: 'hut', x: 9, y: 14 },
    { definitionId: 'hut', x: 14, y: 14 },
    { definitionId: 'hut', x: 15, y: 14 },
  ],
  roads: Array.from({ length: 10 }, (_, i) => [7 + i, 13] as [number, number]),
};

const CLEAR = { x0: 6, y0: 9, x1: 17, y1: 15 };

function blob(
  set: (x: number, y: number) => void,
  rng: LocalRng,
  cx: number,
  cy: number,
  radius: number,
): void {
  const r = Math.ceil(radius);
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= radius * radius - (rng.chance(300) ? 1 : 0)) set(x, y);
    }
}

function generateAttempt(seed: number): Tile[] {
  const rng = makeRng(seed);
  const size = MAP_SIZE;
  const terrain: TerrainId[] = new Array<TerrainId>(size * size).fill('grass');
  const at = (x: number, y: number): TerrainId | undefined =>
    x >= 0 && y >= 0 && x < size && y < size ? terrain[y * size + x] : undefined;
  const put =
    (t: TerrainId, onlyOn: TerrainId[] = ['grass']) =>
    (x: number, y: number) => {
      const cur = at(x, y);
      if (cur && onlyOn.includes(cur)) terrain[y * size + x] = t;
    };

  // river along one edge, meandering
  const west = rng.chance(500);
  let cx = west ? 2 : size - 3;
  for (let y = 0; y < size; y++) {
    cx += [-1, 0, 0, 1][rng.int(4)]!;
    cx = west ? Math.max(1, Math.min(3, cx)) : Math.max(size - 4, Math.min(size - 2, cx));
    put('water')(cx, y);
    put('water')(cx + (west ? -1 : 1), y);
  }
  // banks: sand and fertile silt
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (at(x, y) !== 'grass') continue;
      let dist = 99;
      for (let d = 1; d <= 4; d++)
        if (at(x - d, y) === 'water' || at(x + d, y) === 'water') dist = Math.min(dist, d);
      if (dist === 1 && rng.chance(450)) terrain[y * size + x] = 'sand';
      else if (dist >= 2 && dist <= 4 && rng.chance(550)) terrain[y * size + x] = 'fertile';
    }
  // random scenery
  const extraForests = 3 + rng.int(3);
  for (let i = 0; i < extraForests; i++)
    blob(put('forest', ['grass', 'fertile']), rng, rng.int(size), rng.int(size), 1.5 + rng.int(2));
  blob(put('stone'), rng, rng.int(size), rng.int(size), 1.2);
  blob(
    put('water', ['grass', 'forest']),
    rng,
    4 + rng.int(size - 8),
    rng.chance(500) ? 1 + rng.int(4) : size - 2 - rng.int(3),
    1.5,
  );
  for (let i = 0; i < size * size; i++) if (terrain[i] === 'grass' && rng.chance(35)) terrain[i] = 'forest';

  // guaranteed resources near the start (forest to the north, stone to the east, fields to the south)
  blob(put('forest', ['grass', 'fertile', 'sand', 'stone']), rng, 7 + rng.int(4), 4 + rng.int(2), 2.6);
  blob(put('stone', ['grass', 'fertile', 'sand', 'forest']), rng, 16 + rng.int(3), 5 + rng.int(2), 1.6);
  const fx = 8 + rng.int(4);
  const fy = 17 + rng.int(2);
  for (let y = fy; y < fy + 4; y++)
    for (let x = fx; x < fx + 5; x++) put('fertile', ['grass', 'sand', 'forest', 'stone', 'water'])(x, y);

  // clear the hamlet area
  for (let y = CLEAR.y0; y <= CLEAR.y1; y++)
    for (let x = CLEAR.x0; x <= CLEAR.x1; x++) terrain[y * size + x] = 'grass';

  return terrain.map((t) => ({
    terrain: t,
    deposit: t === 'forest' ? FOREST_TILE_MAX : t === 'stone' ? STONE_TILE_MAX : 0,
    road: false,
    buildingId: null,
    variant: rng.int(4),
  }));
}

/** Stamps the starting hamlet onto freshly generated tiles and returns its building instances. */
export function stampStart(
  tiles: Tile[],
  provinceId: string,
  style: ArchitectureStyle = LEGACY_STYLE,
): BuildingInstance[] {
  const buildings: BuildingInstance[] = [];
  for (const [x, y] of START_LAYOUT.roads) tiles[y * MAP_SIZE + x]!.road = true;
  START_LAYOUT.buildings.forEach((spec, i) => {
    const id = `b${i + 1}`;
    for (const [tx, ty] of footprintTiles(BUILDINGS[spec.definitionId], spec.x, spec.y))
      tiles[ty * MAP_SIZE + tx]!.buildingId = id;
    buildings.push({
      id,
      definitionId: spec.definitionId,
      provinceId,
      x: spec.x,
      y: spec.y,
      level: 1,
      workers: 0,
      progressTicks: 0,
      state: 'active',
      connected: true,
      unpaid: false,
      style,
      look: null,
      condition: CONDITION_MAX,
    });
  });
  return buildings;
}

/** A start is playable when every Phase 1 building has a reachable, valid site. */
export function isPlayableStart(g: GridLike): boolean {
  const forest = g.tiles.filter((t) => t.terrain === 'forest').length;
  const stone = g.tiles.filter((t) => t.terrain === 'stone').length;
  const water = g.tiles.filter((t) => t.terrain === 'water').length;
  if (forest < 10 || stone < 4 || water < 12) return false;
  return (['lumber_camp', 'farm', 'quarry', 'granary', 'school', 'hut', 'warehouse'] as const).every(
    (id) => findSite(g, BUILDINGS[id]) !== null,
  );
}

export interface GeneratedValley {
  tiles: Tile[];
  buildings: BuildingInstance[];
  attempts: number;
}

/** Seeded valley generation. Retries with derived seeds until the start is verified playable. */
export function generateValley(
  seed: number,
  provinceId: string,
  style: ArchitectureStyle = LEGACY_STYLE,
): GeneratedValley {
  for (let attempt = 0; attempt < 24; attempt++) {
    const tiles = generateAttempt((seed >>> 0) * 31 + attempt * 7919);
    const buildings = stampStart(tiles, provinceId, style);
    if (isPlayableStart({ width: MAP_SIZE, height: MAP_SIZE, tiles, buildings })) {
      return { tiles, buildings, attempts: attempt + 1 };
    }
  }
  throw new Error(`No playable valley for seed ${seed}`);
}
