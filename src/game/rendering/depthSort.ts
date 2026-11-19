/**
 * Draw order for building footprints. The usual key (sum of the far corner) ties or inverts for
 * neighbours that are offset along both axes, which painted a building over the house standing in
 * front of it. Two footprints that overlap on screen are ordered by their separating axis instead:
 * A is in front of B when A lies wholly beyond B along x or along y. The result keeps every
 * building at or just above its usual key, so people and vehicles still interleave as before.
 */
export interface Footprint {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const baseDepth = (f: Footprint): number => f.x + f.w + f.y + f.h - 1;

/** Screen x extent of a footprint in half-tile units: iso x = (u - v). */
const span = (f: Footprint): [number, number] => [f.x - (f.y + f.h), f.x + f.w - f.y];

/** Whether `a` must be drawn after (in front of) `b`. */
export function inFront(a: Footprint, b: Footprint): boolean {
  const [a0, a1] = span(a), [b0, b1] = span(b);
  if (a1 <= b0 || b1 <= a0) return false; // side by side on screen: order does not matter
  return a.x >= b.x + b.w || a.y >= b.y + b.h;
}

export function buildingDepths(list: readonly Footprint[]): Map<string, number> {
  const n = list.length;
  const behind: number[][] = list.map(() => []);
  const ahead: number[][] = list.map(() => []);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j && inFront(list[i]!, list[j]!)) {
        behind[i]!.push(j);
        ahead[j]!.push(i);
      }
  // Kahn's algorithm from the back of the scene forwards
  const pending = behind.map((b) => b.length);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (!pending[i]) queue.push(i);
  queue.sort((a, b) => baseDepth(list[a]!) - baseDepth(list[b]!));
  const z = new Map<string, number>();
  const done = new Set<number>();
  while (queue.length) {
    const i = queue.shift()!;
    done.add(i);
    let depth = baseDepth(list[i]!);
    for (const j of behind[i]!) depth = Math.max(depth, (z.get(list[j]!.id) ?? baseDepth(list[j]!)) + 0.02);
    z.set(list[i]!.id, depth);
    for (const k of ahead[i]!) if (--pending[k]! === 0) queue.push(k);
  }
  // footprints never overlap, so there are no cycles; keep a fallback anyway
  for (let i = 0; i < n; i++) if (!done.has(i)) z.set(list[i]!.id, baseDepth(list[i]!));
  return z;
}
