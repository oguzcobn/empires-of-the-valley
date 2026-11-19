/**
 * Right-of-way rules for ambient street traffic. Pure geometry in tile coordinates so the rules
 * can be tested without a canvas.
 *
 * - Car following: a vehicle stops when another one sits ahead of it in its own lane, closer than
 *   half their two lengths plus a safety margin.
 * - Junction box: a vehicle only enters a junction or corner tile when no vehicle going another
 *   way is inside it.
 * - Bodies never overlap: a move that would put two vehicles into each other is not made.
 * - Mutual blocking (two vehicles each seeing the other ahead, e.g. nose to nose on a turn) is
 *   broken by id so traffic never freezes on a pair.
 */

export interface TrafficAgent {
  id: number;
  /** Centre of the vehicle in tile coordinates (lane offset included). */
  x: number;
  y: number;
  /** Unit heading of the road segment it drives on. */
  hx: number;
  hy: number;
  /** Body length in tiles. */
  len: number;
}

/** Sideways tolerance: lanes are 0.26 tiles apart, so this keeps the opposite lane out. */
export const LANE_HALF = 0.15;
export const MARGIN = 0.07;

/** Distance ahead along a's heading at which b would be in the way, or null if b is not in a's lane ahead. */
export function aheadDistance(a: TrafficAgent, b: TrafficAgent): number | null {
  const rx = b.x - a.x, ry = b.y - a.y;
  const along = rx * a.hx + ry * a.hy;
  const side = Math.abs(rx * a.hy - ry * a.hx);
  if (along <= 0 || side >= LANE_HALF + 0.04) return null;
  return along;
}

/** Whether b blocks a under car following. */
export function blocksFollowing(a: TrafficAgent, b: TrafficAgent): boolean {
  const d = aheadDistance(a, b);
  return d !== null && d < (a.len + b.len) / 2 + MARGIN;
}

/** Ids of agents that must hold this frame because someone is right ahead of them. */
export function heldByFollowing(agents: readonly TrafficAgent[]): Set<number> {
  const held = new Set<number>();
  for (const a of agents)
    for (const b of agents) {
      if (a === b || !blocksFollowing(a, b)) continue;
      // nose to nose: the lower id goes first
      if (blocksFollowing(b, a) && a.id < b.id) continue;
      held.add(a.id);
      break;
    }
  return held;
}

/**
 * Whether `me` may enter junction tile (tx, ty) now: no other vehicle is inside the tile unless it
 * travels along my axis (same lane ahead is car following's job; the opposite lane is separate).
 */
export function junctionClear(me: TrafficAgent, agents: readonly TrafficAgent[], tx: number, ty: number): boolean {
  for (const o of agents) {
    if (o.id === me.id) continue;
    if (o.x < tx - 0.02 || o.x > tx + 1.02 || o.y < ty - 0.02 || o.y > ty + 1.02) continue;
    // only traffic ahead in my own direction may share the box (car following spaces it);
    // oncoming vehicles can turn across my lane, so I wait for them too
    const sameWay = o.hx * me.hx + o.hy * me.hy > 0.99;
    if (!sameWay) return false;
  }
  return true;
}

/** Half width of a vehicle body in tiles (cars ~0.21 wide after scaling). */
export const HALF_WIDTH = 0.1;

/** Whether two vehicle bodies (oriented rectangles) overlap: separating-axis test on both headings. */
export function bodiesOverlap(a: TrafficAgent, b: TrafficAgent): boolean {
  const axes: [number, number][] = [[a.hx, a.hy], [-a.hy, a.hx], [b.hx, b.hy], [-b.hy, b.hx]];
  const rx = b.x - a.x, ry = b.y - a.y;
  const radius = (c: TrafficAgent, ax: number, ay: number): number =>
    Math.abs(c.hx * ax + c.hy * ay) * (c.len / 2) + Math.abs(-c.hy * ax + c.hx * ay) * HALF_WIDTH;
  for (const [ax, ay] of axes) {
    if (!ax && !ay) continue;
    if (Math.abs(rx * ax + ry * ay) >= radius(a, ax, ay) + radius(b, ax, ay)) return false;
  }
  return true;
}
