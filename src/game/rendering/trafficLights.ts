import { Container, Graphics } from 'pixi.js';
import type { Province } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { tileAt } from '../systems/grid';
import { isoX, isoY, P } from './iso';
import { getPavedLinks, junctionKind } from './roadGeometry';

/**
 * Signalised junctions on asphalt: every tee and crossroads gets two signal poles, one for the
 * x-axis approaches and one for the y-axis. Ambient traffic waits at the stop line on red.
 * Visual only; the simulation never reads the lights.
 */

export type Signal = 'green' | 'yellow' | 'red';

/** Phase lengths in real milliseconds: green and yellow for one axis, then a short all-red. */
const GREEN = 3600;
const YELLOW = 900;
const ALL_RED = 500;
export const CYCLE = 2 * (GREEN + YELLOW + ALL_RED);

/** Signal shown to traffic moving along the x axis (`alongX`) or the y axis at `t` ms. */
export function signalAt(t: number, alongX: boolean, offset = 0): Signal {
  const half = GREEN + YELLOW + ALL_RED;
  let k = (((t + offset) % CYCLE) + CYCLE) % CYCLE;
  if (!alongX) k = (k + half) % CYCLE;
  if (k < GREEN) return 'green';
  if (k < GREEN + YELLOW) return 'yellow';
  return 'red';
}

interface Junction {
  x: number;
  y: number;
  offset: number;
  c: Container;
  heads: [Graphics, Graphics];
  shown: string;
}

const LAMP: Record<Signal, number> = { red: 0xff2b2b, yellow: 0xffc400, green: 0x2bff6a };

function drawHead(g: Graphics, state: Signal, night: number): void {
  g.clear();
  g.roundRect(-1.9, -8.6, 3.8, 9.2, 1).fill(0x1d2226);
  (['red', 'yellow', 'green'] as const).forEach((lamp, i) => {
    const y = -7 + i * 2.9;
    const on = lamp === state;
    if (on && night > 0.2) g.circle(0, y, 4.5).fill({ color: LAMP[lamp], alpha: 0.18 + night * 0.2 });
    g.circle(0, y, 1.15).fill(on ? LAMP[lamp] : 0x3a3f44);
  });
}

export class TrafficLights {
  private junctions = new Map<number, Junction>();

  constructor(private layer: Container) {}

  get count(): number {
    return this.junctions.size;
  }

  destroy(): void {
    for (const j of this.junctions.values()) j.c.destroy({ children: true });
    this.junctions.clear();
  }

  /** Rebuilds the set of signalised junctions after the roads changed. */
  sync(p: Province): void {
    const seen = new Set<number>();
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) {
        const t = tileAt(p, x, y);
        if (!t?.road || !t.paved || t.roadType !== 'dirt') continue;
        const kind = junctionKind(getPavedLinks(p, x, y));
        if (kind !== 'tee' && kind !== 'cross') continue;
        const key = y * p.width + x;
        seen.add(key);
        if (this.junctions.has(key)) continue;
        const c = new Container();
        const heads: [Graphics, Graphics] = [new Graphics(), new Graphics()];
        // pole A on the near-left corner serves the x axis, pole B on the near-right corner the y axis
        const lift = t.height * HEIGHT_PX;
        const corners: [number, number][] = [[0.1, 0.9], [0.9, 0.1]];
        corners.forEach(([u, v], i) => {
          const pole = new Graphics();
          const base = P(u, v);
          pole.ellipse(base[0], base[1], 2, 1).fill({ color: 0x0e1b24, alpha: 0.3 });
          pole.moveTo(base[0], base[1]).lineTo(base[0], base[1] - 17).stroke({ color: 0x4a5258, width: 1.3 });
          heads[i]!.position.set(base[0] + (i === 0 ? -1.5 : 1.5), base[1] - 15.5);
          c.addChild(pole, heads[i]!);
        });
        c.position.set(isoX(x, y), isoY(x, y) - lift);
        c.zIndex = x + y + 1.02;
        c.cullable = true;
        this.layer.addChild(c);
        this.junctions.set(key, { x, y, offset: ((x * 7919 + y * 104729) % 9) * 700, c, heads, shown: '' });
      }
    for (const [key, j] of this.junctions)
      if (!seen.has(key)) {
        j.c.destroy({ children: true });
        this.junctions.delete(key);
      }
  }

  update(time: number, night: number): void {
    for (const j of this.junctions.values()) {
      const a = signalAt(time, true, j.offset);
      const b = signalAt(time, false, j.offset);
      const key = `${a}|${b}|${night > 0.2 ? Math.round(night * 4) : 0}`;
      if (key === j.shown) continue;
      j.shown = key;
      drawHead(j.heads[0], a, night);
      drawHead(j.heads[1], b, night);
    }
  }

  /** Whether a vehicle moving by (dx, dy) may enter tile (x, y) now. */
  mayEnter(p: Province, x: number, y: number, dx: number, _dy: number, time: number): boolean {
    const j = this.junctions.get(y * p.width + x);
    if (!j) return true;
    return signalAt(time, dx !== 0, j.offset) === 'green';
  }
}
