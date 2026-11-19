import type { BuildingInstance, GameState, MapPoint, Province, Tile } from '../core/types';
import { defOf } from '../data/buildings';
import type { Animal } from '../systems/frontier';

/**
 * Camera rotation in quarter turns. The 2D renderer always draws the map from the same corner,
 * so to look at the valley from another side it draws a rotated copy of the map: tiles, building
 * footprints, routes and journeys are turned about the map centre before drawing, and pointer
 * input is turned back before it reaches the game. The simulation never sees a rotated map.
 *
 * Quarter turn r maps tile (x, y) of a W x H map to (H - 1 - y, x), applied r times.
 */
export type Rotation = 0 | 1 | 2 | 3;

export const nextRotation = (r: Rotation, step: 1 | -1): Rotation => (((r + step) % 4) + 4) % 4 as Rotation;

/** Compass name of the side the camera looks from (Turkish UI). */
export const ROTATION_LABEL: Record<Rotation, string> = { 0: 'Güney', 1: 'Doğu', 2: 'Kuzey', 3: 'Batı' };

/** Tile index (x, y) seen in rotation r of a W x H map. */
export function rotTile(x: number, y: number, w: number, h: number, r: Rotation): [number, number] {
  let ax = x, ay = y, aw = w, ah = h;
  for (let i = 0; i < r; i++) {
    [ax, ay] = [ah - 1 - ay, ax];
    [aw, ah] = [ah, aw];
  }
  return [ax, ay];
}

/** Continuous map point (tile centres are x + 0.5) seen in rotation r. */
export function rotPoint(x: number, y: number, w: number, h: number, r: Rotation): [number, number] {
  let ax = x, ay = y, aw = w, ah = h;
  for (let i = 0; i < r; i++) {
    [ax, ay] = [ah - ay, ax];
    [aw, ah] = [ah, aw];
  }
  return [ax, ay];
}

/** Map size after rotation r. */
export const rotSize = (w: number, h: number, r: Rotation): [number, number] => (r % 2 ? [h, w] : [w, h]);

/** Inverse of rotTile: the true tile under rotated tile (x, y). */
export function unrotTile(x: number, y: number, w: number, h: number, r: Rotation): [number, number] {
  const [rw, rh] = rotSize(w, h, r);
  return rotTile(x, y, rw, rh, ((4 - r) % 4) as Rotation);
}

export function unrotPoint(x: number, y: number, w: number, h: number, r: Rotation): [number, number] {
  const [rw, rh] = rotSize(w, h, r);
  return rotPoint(x, y, rw, rh, ((4 - r) % 4) as Rotation);
}

/** A footprint rectangle seen in rotation r: its new top corner and size. */
export function rotRect(x: number, y: number, fw: number, fh: number, w: number, h: number, r: Rotation): { x: number; y: number; w: number; h: number } {
  const [ax, ay] = rotPoint(x, y, w, h, r);
  const [bx, by] = rotPoint(x + fw, y + fh, w, h, r);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Inverse of rotRect: the true top corner of a rotated rectangle. */
export function unrotRect(x: number, y: number, fw: number, fh: number, w: number, h: number, r: Rotation): { x: number; y: number; w: number; h: number } {
  const [rw, rh] = rotSize(w, h, r);
  return rotRect(x, y, fw, fh, rw, rh, ((4 - r) % 4) as Rotation);
}

/** Heading (dx, dy) seen in rotation r. */
export function rotDir(dx: number, dy: number, r: Rotation): [number, number] {
  let ax = dx, ay = dy;
  for (let i = 0; i < r; i++) [ax, ay] = [-ay, ax];
  return [ax === 0 ? 0 : ax, ay === 0 ? 0 : ay];
}

/** Rotated building copies whose footprint is drawn with width and depth swapped. */
const swapped = new WeakSet<BuildingInstance>();

/** Footprint of a building as drawn (rotated copies of non-square buildings swap their sides). */
export function footprintOf(b: Pick<BuildingInstance, 'definitionId'>): [number, number] {
  const [w, h] = defOf(b as BuildingInstance).footprint;
  return swapped.has(b as BuildingInstance) ? [h, w] : [w, h];
}

/** Whether a rotated non-square building is drawn mirrored (its art is laid out along x). */
export const isSwapped = (b: BuildingInstance): boolean => swapped.has(b);

export function footprintTilesOf(b: BuildingInstance): [number, number][] {
  const [w, h] = footprintOf(b);
  const out: [number, number][] = [];
  for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) out.push([x, y]);
  return out;
}

const tileCache = new WeakMap<Tile[], Map<number, Tile[]>>();

function rotateTiles(p: Province, r: Rotation): Tile[] {
  let byRot = tileCache.get(p.tiles);
  if (!byRot) tileCache.set(p.tiles, (byRot = new Map()));
  const hit = byRot.get(r);
  if (hit) return hit;
  const [rw] = rotSize(p.width, p.height, r);
  const out = new Array<Tile>(p.tiles.length);
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const [nx, ny] = rotTile(x, y, p.width, p.height, r);
      out[ny * rw + nx] = p.tiles[y * p.width + x]!;
    }
  byRot.set(r, out);
  return out;
}

const tilePoint = (pt: MapPoint, p: Province, r: Rotation): MapPoint => {
  const [x, y] = rotTile(pt.x, pt.y, p.width, p.height, r);
  return { x, y };
};

const buildingCache = new WeakMap<BuildingInstance, Map<number, BuildingInstance>>();

function rotateBuilding(b: BuildingInstance, p: Province, r: Rotation): BuildingInstance {
  let byRot = buildingCache.get(b);
  if (!byRot) buildingCache.set(b, (byRot = new Map()));
  const key = r * 1_000_000 + p.width * 1000 + p.height;
  const hit = byRot.get(key);
  if (hit) return hit;
  const [fw, fh] = defOf(b).footprint;
  const rect = rotRect(b.x, b.y, fw, fh, p.width, p.height, r);
  const copy = { ...b, x: rect.x, y: rect.y };
  if (r % 2 && fw !== fh) swapped.add(copy);
  byRot.set(key, copy);
  return copy;
}

const provinceCache = new WeakMap<Province, Map<number, Province>>();

export function rotateProvince(p: Province, r: Rotation): Province {
  if (r === 0) return p;
  let byRot = provinceCache.get(p);
  if (!byRot) provinceCache.set(p, (byRot = new Map()));
  const hit = byRot.get(r);
  if (hit) return hit;
  const [rw, rh] = rotSize(p.width, p.height, r);
  const transit: Province['transit'] = p.transit
    ? Object.fromEntries(Object.entries(p.transit).map(([k, line]) => [k, line && { ...line, route: line.route.map((pt) => tilePoint(pt, p, r)) }]))
    : undefined;
  const out: Province = {
    ...p,
    width: rw,
    height: rh,
    tiles: rotateTiles(p, r),
    buildings: p.buildings.map((b) => rotateBuilding(b, p, r)),
    ...(p.hunt ? { hunt: { ...p.hunt, route: p.hunt.route.map((pt) => tilePoint(pt, p, r)) } } : {}),
    ...(transit ? { transit } : {}),
  };
  byRot.set(r, out);
  return out;
}

const gameCache = new WeakMap<GameState, Map<number, GameState>>();

/** The game as seen in rotation r: the home province and every map position in it turned. */
export function rotateGame(s: GameState, r: Rotation): GameState {
  if (r === 0) return s;
  let byRot = gameCache.get(s);
  if (!byRot) gameCache.set(s, (byRot = new Map()));
  const hit = byRot.get(r);
  if (hit) return hit;
  const home = s.provinces[s.homeProvinceId]!;
  const pt = (x: number, y: number): [number, number] => rotPoint(x, y, home.width, home.height, r);
  const out: GameState = {
    ...s,
    provinces: { ...s.provinces, [s.homeProvinceId]: rotateProvince(home, r) },
    ...(s.armyTarget ? { armyTarget: (() => { const [x, y] = rotTile(s.armyTarget.x, s.armyTarget.y, home.width, home.height, r); return { x, y }; })() } : {}),
    ...(s.cityLife
      ? {
          cityLife: {
            ...s.cityLife,
            jobs: s.cityLife.jobs.map((j) => ({ ...j, path: j.path.map((q) => { const [x, y] = pt(q.x, q.y); return { x, y }; }) })),
          },
        }
      : {}),
  };
  byRot.set(r, out);
  return out;
}

/** Hunt animals found on the true map, moved to where the rotated map draws them. */
export function rotateAnimals(list: Animal[], p: Province, r: Rotation): Animal[] {
  if (r === 0) return list;
  return list.map((a) => {
    const [x, y] = rotTile(a.x, a.y, p.width, p.height, r);
    return { ...a, x, y };
  });
}
