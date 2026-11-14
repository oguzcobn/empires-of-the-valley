import { makeRng } from '../core/rng';
import type { LocalRng } from '../core/rng';
import type { ArchitectureStyle, BuildingId, BuildingInstance, TerrainId, Tile } from '../core/types';
import { CONDITION_MAX, LEGACY_STYLE } from '../data/architecture';
import { CORE_OFFSET, CORE_SIZE, FOREST_TILE_MAX, MAP_SIZE, STONE_TILE_MAX } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { LANDMARK_IDS } from '../data/landmarks';
import { footprintTiles } from './grid';
import type { GridLike } from './grid';
import { findSite, terrainSiteError } from './placement';

export interface StartLayout {
  buildings: { definitionId: BuildingId; x: number; y: number }[];
  roads: [number, number][];
}

/** Fixed, hand-placed starting hamlet in the centre of the valley (core coordinates). */
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

const tile = (terrain: TerrainId, variant: number, height = 0): Tile => ({
  terrain,
  deposit: terrain === 'forest' ? FOREST_TILE_MAX : terrain === 'stone' ? STONE_TILE_MAX : 0,
  road: false,
  roadType: 'dirt',
  buildingId: null,
  variant,
  height,
});

/** The 24x24 valley floor (unchanged generator of the first version). */
function generateCore(seed: number): Tile[] {
  const rng = makeRng(seed);
  const size = CORE_SIZE;
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

  return terrain.map((t) => tile(t, rng.int(4)));
}

/**
 * Surrounds a 24x24 valley with the outer ring of a 32x32 map: highlands rising towards the back
 * edges (hills, rocks, mountains), the river continuing through a gorge and into a lake on the
 * front shore, and hand-shaped sites so every historic landmark has somewhere to stand.
 * Deterministic in `seed`; also used to migrate older 24x24 saves (their valley is kept intact).
 */
export function surroundValley(seed: number, core: readonly Tile[]): Tile[] {
  const rng = makeRng((seed >>> 0) ^ 0x5bd1e995);
  const N = MAP_SIZE;
  const O = CORE_OFFSET;
  const E = O + CORE_SIZE;
  const out: Tile[] = new Array<Tile>(N * N);
  const at = (x: number, y: number): Tile | undefined => (x >= 0 && y >= 0 && x < N && y < N ? out[y * N + x] : undefined);
  const set = (x: number, y: number, t: TerrainId, h: number): void => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    out[y * N + x] = tile(t, out[y * N + x]?.variant ?? rng.int(4), h);
  };
  const noise = (x: number, y: number): number => {
    let h = Math.imul((seed ^ 0x27d4eb2d) + x * 374761393 + y * 668265263, 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (x >= O && y >= O && x < E && y < E) {
        out[y * N + x] = { ...core[(y - O) * CORE_SIZE + (x - O)]!, height: 0 };
        continue;
      }
      const back = x < O || y < O;
      if (back) {
        // plateaus: noise per 2x2 block so flat building spots exist on the slopes
        const base = Math.max(x < O ? O - x : 0, y < O ? O - y : 0);
        const n = noise(x >> 1, y >> 1);
        const h = Math.max(1, Math.min(4, base + (n > 0.82 ? 1 : n < 0.14 ? -1 : 0)));
        const r = noise(x + 101, y + 37);
        const terrain: TerrainId =
          h >= 4 ? 'mountain' : h === 3 ? (r < 0.55 ? 'rocky' : 'mountain') : h === 2 ? (r < 0.4 ? 'hill' : r < 0.72 ? 'rocky' : 'forest') : r < 0.62 ? 'hill' : r < 0.94 ? 'forest' : 'stone';
        out[y * N + x] = tile(terrain, rng.int(4), h);
      } else {
        const r = noise(x + 7, y + 211);
        out[y * N + x] = tile(r < 0.18 ? 'forest' : 'grass', rng.int(4), 0);
      }
    }

  // the river: find where it leaves the valley and carry it through the gorge and to the lake
  const riverCols: number[] = [];
  for (let x = 0; x < CORE_SIZE; x++) if (core[x]!.terrain === 'water') riverCols.push(x + O);
  const exitCols: number[] = [];
  for (let x = 0; x < CORE_SIZE; x++) if (core[(CORE_SIZE - 1) * CORE_SIZE + x]!.terrain === 'water') exitCols.push(x + O);
  for (const x of riverCols) for (let y = 0; y < O; y++) set(x, y, 'water', 0);
  const exitX = exitCols.length ? exitCols[0]! : 15;
  const lakeX = Math.max(7, Math.min(N - 4, exitX + (exitX < N / 2 ? 2 : -1)));
  const lakeY = N - 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (x >= O && y >= O && x < E && y < E) continue;
      if (x < O || y < O) continue;
      const d = Math.hypot(x - lakeX, (y - lakeY) * 1.15);
      if (d <= 3.3) set(x, y, 'lake', 0);
      else if (d <= 4.4 && noise(x, y + 900) < 0.75) set(x, y, 'sand', 0);
    }
  for (const x0 of exitCols) {
    let x = x0;
    for (let y = E; y < N; y++) {
      if (at(x, y)?.terrain !== 'lake') set(x, y, 'water', 0);
      x += Math.sign(lakeX - x);
      if (at(x, y)?.terrain !== 'lake') set(x, y, 'water', 0);
    }
  }

  // Edinburgh-type crag: a flat 3x3 rock at height 2 with drops on three sides (left highlands)
  for (let y = 12; y <= 16; y++) {
    set(0, y, 'mountain', 3);
    for (let x = 1; x <= 3; x++) set(x, y, 'hill', 1);
  }
  for (let y = 13; y <= 15; y++) for (let x = 1; x <= 3; x++) set(x, y, 'rocky', 2);
  // Stirling-type castle hill: 3x3 hill at height 1 above the valley (right highlands)
  for (let x = 17; x <= 21; x++) {
    set(x, 0, 'mountain', 3);
    for (let y = 1; y <= 3; y++) set(x, y, x === 17 || x === 21 ? 'forest' : 'hill', x === 17 || x === 21 ? 2 : 1);
  }
  // Sümela-type mountainside: rocky ledge at height 3 under a higher cliff, forest below, a ramp
  for (let y = 4; y <= 9; y++) set(0, y, 'mountain', 4);
  for (let y = 5; y <= 6; y++) for (let x = 1; x <= 3; x++) set(x, y, 'rocky', 3);
  for (let x = 1; x <= 3; x++) {
    set(x, 4, 'mountain', 4);
    set(x, 7, x === 3 ? 'rocky' : 'forest', 2);
    set(x, 8, x === 3 ? 'hill' : 'forest', 1);
    set(x, 9, 'forest', 1);
  }
  // Galata-type hill overlooking the lake, on one side of it
  const gx = lakeX + 4 <= N - 3 ? lakeX + 4 : lakeX - 11;
  for (let y = E; y <= E + 2; y++) for (let x = gx; x <= gx + 2; x++) if (at(x, y)?.terrain !== 'lake') set(x, y, 'hill', 1);
  // reclaimed shore for a stadium: flat land touching the lake on the other side
  for (let y = E; y < N; y++)
    for (let x = lakeX - 7; x <= lakeX - 4; x++) if (at(x, y) && at(x, y)!.terrain !== 'lake') set(x, y, 'sand', 0);
  return out;
}

/**
 * Stylized city-specific coast and relief on the outer ring. The protected 24x24 playable
 * interior and hand-made landmark sites remain untouched. Existing saves are never regenerated.
 */
export function applyCityGeography(tiles: Tile[], style: ArchitectureStyle): Tile[] {
  if (style !== 'turkish' && style !== 'scottish') return tiles;
  const out = tiles.map((t) => ({ ...t }));
  const set = (x: number, y: number, terrain: TerrainId, height = 0): void => {
    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
    const original = out[y * MAP_SIZE + x]!;
    out[y * MAP_SIZE + x] = tile(terrain, original.variant, height);
  };

  // Black Sea in the north of Trabzon; Firth of Forth in the north of Edinburgh.
  // Preserve the 3x3 hill at x=17..21 needed by the original landmark catalogue.
  const seaDepth = style === 'turkish' ? 3 : 2;
  for (let x = 5; x < MAP_SIZE; x++) {
    if (x >= 17 && x <= 21) continue;
    for (let y = 0; y < seaDepth; y++) set(x, y, 'lake');
    set(x, seaDepth, 'sand');
  }

  if (style === 'turkish') {
    // The steep southern and eastern Black Sea mountain flanks.
    for (let y = 25; y < MAP_SIZE; y++)
      for (let x = 28; x < MAP_SIZE; x++) {
        const edge = Math.min(4, 1 + (x - 28) + Math.floor((y - 25) / 2));
        set(x, y, edge >= 3 ? 'mountain' : 'hill', edge);
      }
    // Forested uplands on the western flank, clear of the Sümela ledge.
    for (let y = 24; y < 29; y++)
      for (let x = 0; x < 3; x++) set(x, y, 'forest', 1);
  } else {
    // Edinburgh's Arthur's Seat inspired crag, on the outer east edge.
    for (let y = 16; y <= 23; y++)
      for (let x = 28; x < MAP_SIZE; x++) {
        const crest = x >= 30 && y >= 18 && y <= 21;
        set(x, y, crest ? 'mountain' : 'hill', crest ? 3 : 1);
      }
  }
  return out;
}

/** Stamps the starting hamlet onto freshly generated tiles and returns its building instances. */
export function stampStart(
  tiles: Tile[],
  provinceId: string,
  style: ArchitectureStyle = LEGACY_STYLE,
): BuildingInstance[] {
  const buildings: BuildingInstance[] = [];
  const O = CORE_OFFSET;
  for (const [x, y] of START_LAYOUT.roads) tiles[(y + O) * MAP_SIZE + x + O]!.road = true;
  START_LAYOUT.buildings.forEach((spec, i) => {
    const id = `b${i + 1}`;
    for (const [tx, ty] of footprintTiles(BUILDINGS[spec.definitionId], spec.x + O, spec.y + O))
      tiles[ty * MAP_SIZE + tx]!.buildingId = id;
    buildings.push({
      id,
      definitionId: spec.definitionId,
      provinceId,
      x: spec.x + O,
      y: spec.y + O,
      level: 1,
      workers: 0,
      progressTicks: 0,
      state: 'active',
      connected: true,
      unpaid: false,
      style,
      look: null,
      condition: CONDITION_MAX,
      paidStages: 0,
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
  if (
    !(['lumber_camp', 'farm', 'quarry', 'granary', 'school', 'hut', 'warehouse'] as const).every(
      (id) => findSite(g, BUILDINGS[id]) !== null,
    )
  )
    return false;
  return LANDMARK_IDS.every((id) => hasTerrainFor(g, id));
}

/** True when the terrain somewhere satisfies a landmark's site rule (roads and costs ignored). */
export function hasTerrainFor(g: GridLike, id: (typeof LANDMARK_IDS)[number]): boolean {
  const def = BUILDINGS[id];
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) if (terrainSiteError(g, def, x, y) === null) return true;
  return false;
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
    const tiles = applyCityGeography(surroundValley(seed, generateCore((seed >>> 0) * 31 + attempt * 7919)), style);
    const buildings = stampStart(tiles, provinceId, style);
    if (isPlayableStart({ width: MAP_SIZE, height: MAP_SIZE, tiles, buildings })) {
      return { tiles, buildings, attempts: attempt + 1 };
    }
  }
  throw new Error(`No playable valley for seed ${seed}`);
}
