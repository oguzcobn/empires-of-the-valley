import { Container, Graphics } from 'pixi.js';
import type { Province } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { NEIGHBORS4, tileAt } from '../systems/grid';
import { isoX, isoY, P } from './iso';
import { drawPedestrian, randomPedLook } from './pedestrians';

/**
 * Leisure on the water's edge: on summer days sunbathers under parasols on sandy shores and
 * swimmers bobbing just off the beach; sailing dinghies drift across lakes whenever it is light
 * and not winter. Positions are hashed from tiles; everything is visual only.
 */

const hash = (x: number, y: number, k: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};

const isWater = (p: Province, x: number, y: number): boolean => {
  const t = tileAt(p, x, y);
  return !!t && (t.terrain === 'water' || t.terrain === 'lake') && !t.road;
};

/** Sand tiles touching water, and the water tiles in front of them. */
export function shoreTiles(p: Province): { beach: [number, number][]; shallows: [number, number][] } {
  const beach: [number, number][] = [];
  const shallows = new Map<number, [number, number]>();
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const t = tileAt(p, x, y)!;
      if (t.terrain !== 'sand' || t.buildingId || t.road) continue;
      const wet = NEIGHBORS4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).filter(([nx, ny]) => isWater(p, nx, ny));
      if (!wet.length) continue;
      beach.push([x, y]);
      for (const [nx, ny] of wet) shallows.set(ny * p.width + nx, [nx, ny]);
    }
  return { beach, shallows: [...shallows.values()] };
}

interface Sail {
  c: Container;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  speed: number;
}

function drawSailboat(g: Graphics, sail: number, flip: boolean): void {
  const s = flip ? -1 : 1;
  g.ellipse(0, 1.2, 8, 2.6).fill({ color: 0x1b3a55, alpha: 0.22 });
  g.moveTo(-9 * s, 0.5).lineTo(-16 * s, -1).stroke({ color: 0xe8f7fb, width: 1.1, alpha: 0.5 });
  g.poly([-6 * s, -1.5, 7 * s, -1.5, 5 * s, 1.5, -4.5 * s, 1.5]).fill(0xf4f1e6);
  g.poly([-6 * s, -1.5, 7 * s, -1.5, 6.2 * s, -0.3, -5.4 * s, -0.3]).fill(0x8d6e63);
  g.moveTo(0, -1.5).lineTo(0, -20).stroke({ color: 0x6d6d6d, width: 0.9 });
  g.poly([0.6 * s, -19, 0.6 * s, -3, 9 * s, -3]).fill(sail);
  g.poly([-0.6 * s, -16, -0.6 * s, -3, -6 * s, -3]).fill(0xf8f8f8);
}

export class WaterLife {
  private beachProps: Container[] = [];
  private swimmers: { g: Graphics; base: number; phase: number }[] = [];
  private sails: Sail[] = [];
  private beachKey = '';
  private sailKey = '';
  private ref: unknown = null;

  constructor(private layer: Container) {}

  get count(): number {
    return this.beachProps.length + this.swimmers.length + this.sails.length;
  }

  destroy(): void {
    for (const c of this.beachProps) c.destroy({ children: true });
    for (const s of this.swimmers) s.g.destroy();
    for (const s of this.sails) s.c.destroy({ children: true });
    this.beachProps = [];
    this.swimmers = [];
    this.sails = [];
  }

  setTint(tint: number): void {
    for (const c of this.beachProps) c.tint = tint;
    for (const s of this.swimmers) s.g.tint = tint;
    for (const s of this.sails) s.c.tint = tint;
  }

  private clearBeach(): void {
    for (const c of this.beachProps) c.destroy({ children: true });
    for (const s of this.swimmers) s.g.destroy();
    this.beachProps = [];
    this.swimmers = [];
  }

  update(p: Province, tilesRef: unknown, season: string, hour: number, rain: boolean, dt: number, motion: boolean): void {
    const beachDay = season === 'summer' && hour >= 9 && hour < 19 && !rain;
    const key = beachDay ? `${season}|${hour >= 9 && hour < 19}` : 'off';
    if (key !== this.beachKey || (beachDay && tilesRef !== this.ref)) {
      this.beachKey = key;
      this.ref = tilesRef;
      this.clearBeach();
      if (beachDay) this.buildBeach(p);
    }
    for (const s of this.swimmers) {
      s.phase += motion ? dt / 600 : 0;
      s.g.y = s.base + Math.sin(s.phase) * 0.9;
    }
    this.updateSails(p, season, hour, dt, motion);
  }

  private buildBeach(p: Province): void {
    const { beach, shallows } = shoreTiles(p);
    const parasols = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xff7043, 0xffffff];
    let n = 0;
    for (const [x, y] of beach) {
      if (n >= 14 || hash(x, y, 1) > 0.55) continue;
      n++;
      const t = tileAt(p, x, y)!;
      const c = new Container();
      const g = new Graphics();
      c.addChild(g);
      const ox = isoX(x, y), oy = isoY(x, y) - t.height * HEIGHT_PX;
      const u = 0.3 + hash(x, y, 2) * 0.4, v = 0.3 + hash(x, y, 3) * 0.4;
      const [px, py] = P(u, v);
      // towel, parasol and a sunbather lying on it; sometimes a sandcastle or a cool box
      const towel = parasols[Math.floor(hash(x, y, 4) * parasols.length)]!;
      g.poly([px - 7 + ox, py + oy, px + ox, py - 3 + oy, px + 7 + ox, py + oy, px + ox, py + 3 + oy]).fill(towel);
      g.ellipse(px + ox, py - 1 + oy, 4.5, 1.5).fill(0xe0ac69);
      g.ellipse(px + 4 + ox, py - 2 + oy, 1.6, 1.4).fill(0x5d4037);
      g.moveTo(px - 3 + ox, py + oy).lineTo(px - 3 + ox, py - 16 + oy).stroke({ color: 0xdddddd, width: 0.8 });
      const shade = parasols[Math.floor(hash(x, y, 5) * parasols.length)]!;
      g.poly([px - 12 + ox, py - 13 + oy, px - 3 + ox, py - 18 + oy, px + 6 + ox, py - 13 + oy]).fill(shade);
      g.ellipse(px - 3 + ox, py - 13 + oy, 9, 1.6).fill({ color: 0x000000, alpha: 0.12 });
      if (hash(x, y, 6) < 0.3) g.rect(px + 8 + ox, py - 3 + oy, 4, 3).fill(0x1e88e5);
      if (hash(x, y, 7) < 0.3) {
        // a child building a sandcastle
        g.poly([px - 10 + ox, py + 4 + oy, px - 6 + ox, py - 1 + oy, px - 2 + ox, py + 4 + oy]).fill(0xd8b878);
        const kid = new Graphics();
        const seed = x * 31 + y;
        drawPedestrian(kid, { ...randomPedLook(() => hash(seed, 0, 9)), kind: 'child', extra: 'none' }, 0);
        kid.position.set(px - 13 + ox, py + 5 + oy);
        kid.scale.set(0.6);
        c.addChild(kid);
      }
      c.zIndex = x + y + 0.5;
      c.cullable = true;
      this.layer.addChild(c);
      this.beachProps.push(c);
    }
    let m = 0;
    for (const [x, y] of shallows) {
      if (m >= 12 || hash(x, y, 11) > 0.6) continue;
      m++;
      const g = new Graphics();
      const [px, py] = P(0.3 + hash(x, y, 12) * 0.4, 0.3 + hash(x, y, 13) * 0.4);
      const caps = [0xe53935, 0xfdd835, 0x1e88e5, 0xffffff];
      g.ellipse(0, 1, 4, 1.4).fill({ color: 0xffffff, alpha: 0.35 });
      g.circle(0, -1.5, 2).fill(0xe0ac69);
      g.ellipse(0, -2.6, 2.1, 1.1).fill(caps[Math.floor(hash(x, y, 14) * caps.length)]!);
      if (hash(x, y, 15) < 0.4) g.ellipse(4, 0, 3, 1.6).fill(0xff7043); // inflatable ring
      g.position.set(isoX(x, y) + px, isoY(x, y) + py + 2);
      g.zIndex = x + y + 0.4;
      this.layer.addChild(g);
      this.swimmers.push({ g, base: g.y, phase: hash(x, y, 16) * 6 });
    }
  }

  private updateSails(p: Province, season: string, hour: number, dt: number, motion: boolean): void {
    const lake: [number, number][] = [];
    const wanted = season !== 'winter' && hour >= 7 && hour < 20;
    const key = wanted ? 'on' : 'off';
    if (key !== this.sailKey) {
      this.sailKey = key;
      for (const s of this.sails) s.c.destroy({ children: true });
      this.sails = [];
      if (wanted) {
        for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (tileAt(p, x, y)?.terrain === 'lake') lake.push([x, y]);
        const n = Math.min(4, Math.floor(lake.length / 25));
        const colors = [0xe53935, 0x1e88e5, 0xfdd835, 0x8e24aa];
        for (let i = 0; i < n; i++) {
          const at = lake[Math.floor(hash(i, lake.length, 21) * lake.length)]!;
          const c = new Container();
          const g = new Graphics();
          drawSailboat(g, colors[i % colors.length]!, false);
          c.addChild(g);
          c.cullable = true;
          this.layer.addChild(c);
          this.sails.push({ c, x: at[0], y: at[1], tx: at[0], ty: at[1], t: 1, speed: 0.12 + hash(i, 3, 22) * 0.08 });
        }
      }
    }
    for (const s of this.sails) {
      if (motion) s.t += (dt / 1000) * s.speed;
      if (s.t >= 1) {
        s.x = s.tx;
        s.y = s.ty;
        const options = NEIGHBORS4.map(([dx, dy]) => [s.x + dx, s.y + dy] as [number, number]).filter(([x, y]) => tileAt(p, x, y)?.terrain === 'lake' && !tileAt(p, x, y)!.road);
        const next = options.length ? options[Math.floor(Math.random() * options.length)]! : [s.x, s.y];
        s.tx = next[0];
        s.ty = next[1];
        s.t = 0;
        const g = s.c.children[0] as Graphics;
        g.scale.x = s.tx - s.x - (s.ty - s.y) < 0 ? -1 : 1;
      }
      const fx = s.x + (s.tx - s.x) * s.t + 0.5;
      const fy = s.y + (s.ty - s.y) * s.t + 0.5;
      s.c.position.set(isoX(fx, fy), isoY(fx, fy) + Math.sin(fx * 3 + fy) * 0.6);
      s.c.zIndex = fx + fy;
    }
  }
}
