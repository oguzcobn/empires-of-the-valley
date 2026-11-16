import type { Province, Tile } from '../core/types';
import { canLink, tileAt } from '../systems/grid';
import { LEVEL_H } from './geo';

/** Side indexes: 0 = +x, 1 = +y, 2 = -x, 3 = -y (grid y is world z). */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export const opposite = (side: number): number => (side + 2) % 4;

export type RoadKind = 'dirt' | 'paved' | 'bridge' | 'stairs' | 'mountain' | 'tunnel';

export interface RoadNode {
  kind: RoadKind;
  /** Which sides connect to a neighbouring road tile. */
  links: [boolean, boolean, boolean, boolean];
  /** Height of the carriageway in the middle of the tile. */
  y: number;
  /** Height of the carriageway at each side (ramps climb on the lower tile). */
  edgeY: [number, number, number, number];
}

const kindOf = (t: Tile): RoadKind => (t.roadType === 'dirt' ? (t.paved ? 'paved' : 'dirt') : t.roadType);

/** Road geometry of one tile, or null when the tile has no road. */
export function roadNode(p: Province, x: number, y: number): RoadNode | null {
  const t = tileAt(p, x, y);
  if (!t?.road) return null;
  const base = t.height * LEVEL_H;
  const node: RoadNode = { kind: kindOf(t), links: [false, false, false, false], y: base, edgeY: [base, base, base, base] };
  DIRS.forEach(([dx, dy], side) => {
    const n = tileAt(p, x + dx, y + dy);
    if (!n?.road || !canLink(t, n)) return;
    node.links[side] = true;
    // Tunnels keep their approach flat (the portal hides the level change); every other climb is a
    // ramp on the lower tile that reaches the higher tile's level exactly at the shared edge.
    if (t.roadType !== 'tunnel' && n.roadType !== 'tunnel') node.edgeY[side] = Math.max(t.height, n.height) * LEVEL_H;
  });
  return node;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  /** Unit direction of travel on the ground plane. */
  hx: number;
  hz: number;
}

/**
 * Point at `t` (0..1) of the lane through tile (tx, ty), entering at side `entry` and leaving at
 * side `exit` (-1 = the tile centre). Perpendicular sides give a quarter-circle, so vehicles and
 * the painted road follow the same smooth curve. `offset` shifts to the right of travel.
 */
export function lanePoint(tx: number, ty: number, node: RoadNode, entry: number, exit: number, t: number, offset = 0): PathPoint {
  const cx = tx + 0.5;
  const cz = ty + 0.5;
  const yIn = entry >= 0 ? node.edgeY[entry]! : node.y;
  const yOut = exit >= 0 ? node.edgeY[exit]! : node.y;
  const y = t < 0.5 ? yIn + (node.y - yIn) * (t * 2) : node.y + (yOut - node.y) * ((t - 0.5) * 2);
  const perpendicular = entry >= 0 && exit >= 0 && entry !== opposite(exit) && entry !== exit;
  if (perpendicular) {
    const e = DIRS[entry]!;
    const o = DIRS[exit]!;
    const kx = cx + 0.5 * (e[0] + o[0]);
    const kz = cz + 0.5 * (e[1] + o[1]);
    // start direction of travel is -e; its right-hand side is (e.z, -e.x)
    const rightAway = e[1] * -o[0] + -e[0] * -o[1] > 0;
    const r = 0.5 + (rightAway ? offset : -offset);
    const a = (t * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: kx - r * (o[0] * cos + e[0] * sin),
      y,
      z: kz - r * (o[1] * cos + e[1] * sin),
      hx: o[0] * sin - e[0] * cos,
      hz: o[1] * sin - e[1] * cos,
    };
  }
  const from = entry >= 0 ? DIRS[entry]! : ([0, 0] as const);
  const to = exit >= 0 ? DIRS[exit]! : ([0, 0] as const);
  let hx = to[0] - from[0];
  let hz = to[1] - from[1];
  const len = Math.hypot(hx, hz) || 1;
  hx /= len;
  hz /= len;
  // dead ends: the lane offset fades to the centre line so the turn-around has no sideways jump
  const side = offset * (entry < 0 ? t : exit < 0 ? 1 - t : 1);
  return {
    x: cx + 0.5 * (from[0] + (to[0] - from[0]) * t) - hz * side,
    y,
    z: cz + 0.5 * (from[1] + (to[1] - from[1]) * t) + hx * side,
    hx,
    hz,
  };
}

/** Centre-line polylines that draw the road surface of one tile. */
export function tileCentrelines(tx: number, ty: number, node: RoadNode, samples = 8): [number, number, number][][] {
  const sides = [0, 1, 2, 3].filter((s) => node.links[s]);
  const line = (entry: number, exit: number, n: number): [number, number, number][] => {
    const out: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const p = lanePoint(tx, ty, node, entry, exit, i / n);
      out.push([p.x, p.y, p.z]);
    }
    return out;
  };
  if (sides.length === 0) return [[[tx + 0.3, node.y, ty + 0.5], [tx + 0.7, node.y, ty + 0.5]]];
  if (sides.length === 1) {
    const end = line(sides[0]!, -1, 2);
    const d = DIRS[sides[0]!]!;
    // run slightly past the centre so a dead end has a rounded-looking stub
    end.push([tx + 0.5 - d[0] * 0.12, node.y, ty + 0.5 - d[1] * 0.12]);
    return [end];
  }
  if (sides.length === 2) {
    const straight = sides[0] === opposite(sides[1]!);
    return [line(sides[0]!, sides[1]!, straight ? 2 : samples)];
  }
  return sides.map((s) => line(s, -1, 2));
}

/** Tiles a car may drive on (asphalt and bridges), and the sides that lead to another such tile. */
export function drivableLinks(p: Province, x: number, y: number): number[] {
  const drivable = (nx: number, ny: number): boolean => {
    const t = tileAt(p, nx, ny);
    return !!t?.road && (t.roadType === 'bridge' || (t.roadType === 'dirt' && !!t.paved));
  };
  if (!drivable(x, y)) return [];
  const t = tileAt(p, x, y)!;
  return [0, 1, 2, 3].filter((s) => {
    const [dx, dy] = DIRS[s]!;
    const n = tileAt(p, x + dx, y + dy);
    return drivable(x + dx, y + dy) && !!n && n.height === t.height;
  });
}
