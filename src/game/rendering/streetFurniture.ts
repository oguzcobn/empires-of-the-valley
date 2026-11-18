import { Container, Graphics } from 'pixi.js';
import type { Province } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { tileAt } from '../systems/grid';
import { isoX, isoY, P } from './iso';
import { getPavedLinks, junctionKind } from './roadGeometry';
import { drawPedestrian, randomPedLook } from './pedestrians';

/**
 * Kerbside life along straight asphalt streets: street trees in planters and bus shelters with
 * people waiting, placed on the verge where the neighbouring tile is open ground. Positions are
 * hashed from tile coordinates so they stay put between frames and reloads. Visual only.
 */

const hash = (x: number, y: number, k: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
};

export interface FurnitureSpot {
  kind: 'tree' | 'shelter';
  x: number;
  y: number;
  /** Verge side in tile space: unit vector from the road centre towards the verge. */
  nx: number;
  ny: number;
}

/** Deterministic street furniture for a province's current road network. */
export function furnitureSpots(p: Province): FurnitureSpot[] {
  const spots: FurnitureSpot[] = [];
  let sinceShelter = 99;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const t = tileAt(p, x, y);
      if (!t?.road || !t.paved || t.roadType !== 'dirt') continue;
      const links = getPavedLinks(p, x, y);
      if (junctionKind(links) !== 'straight') continue;
      const alongX = links.negX && links.posX;
      // verge sides are perpendicular to the street
      const sides: [number, number][] = alongX ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      sinceShelter++;
      for (const [nx, ny] of sides) {
        const n = tileAt(p, x + nx, y + ny);
        if (!n || n.road || n.buildingId || n.terrain === 'water' || n.terrain === 'lake' || n.height !== t.height) continue;
        const r = hash(x, y, nx * 3 + ny);
        if (sinceShelter > 9 && r < 0.18) {
          spots.push({ kind: 'shelter', x, y, nx, ny });
          sinceShelter = 0;
        } else if (r > 0.55) {
          spots.push({ kind: 'tree', x, y, nx, ny });
        }
      }
    }
  return spots;
}

function tree(g: Graphics, at: [number, number], s: number, autumn: boolean, snow: boolean): void {
  const [x, y] = at;
  g.ellipse(x + 2, y, 5 * s, 2.2 * s).fill({ color: 0x0e1b24, alpha: 0.2 });
  g.rect(x - 2.6 * s, y - 2 * s, 5.2 * s, 2 * s).fill(0x8d8371);
  g.rect(x - 0.7 * s, y - 10 * s, 1.4 * s, 8 * s).fill(0x6b4a2b);
  const leaf = snow ? 0xe9eef2 : autumn ? 0xd98c2b : 0x4c8a3c;
  g.circle(x, y - 13 * s, 5 * s).fill(leaf);
  g.circle(x - 2.4 * s, y - 11 * s, 3.4 * s).fill(snow ? 0xdfe6ea : autumn ? 0xc9741e : 0x3f7a33);
  g.circle(x + 2.2 * s, y - 15 * s, 3 * s).fill(snow ? 0xf4f7f9 : autumn ? 0xe8a23e : 0x5c9c48);
}

function shelter(g: Graphics, ox: number, oy: number, nx: number, ny: number, culture: string): void {
  // shelter sits on the verge, roof slab on two posts, glass back panel and a timetable
  const along: [number, number] = [Math.abs(ny), Math.abs(nx)];
  const at = (a: number, d: number, z = 0): [number, number] => {
    const p = P(0.5 + along[0] * a + nx * d, 0.5 + along[1] * a + ny * d, z);
    return [p[0] + ox, p[1] + oy];
  };
  const blue = culture === 'scottish' ? 0x7a1f2b : 0x1d6fb8;
  const back = [at(-0.22, 0.47), at(0.22, 0.47), at(0.22, 0.47, 12), at(-0.22, 0.47, 12)];
  g.poly(back.flat()).fill({ color: 0xbfe6f2, alpha: 0.55 });
  for (const a of [-0.22, 0.22]) {
    const [x0, y0] = at(a, 0.37);
    const [x1, y1] = at(a, 0.37, 13);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: 0x59636a, width: 1 });
  }
  const roof = [at(-0.25, 0.34, 13), at(0.25, 0.34, 13), at(0.25, 0.5, 13.5), at(-0.25, 0.5, 13.5)];
  g.poly(roof.flat()).fill(blue);
  const [sx, sy] = at(0.26, 0.4, 0);
  g.moveTo(sx, sy).lineTo(sx, sy - 15).stroke({ color: 0x59636a, width: 0.9 });
  g.circle(sx, sy - 16, 2.2).fill(blue);
  g.rect(sx - 0.9, sy - 17, 1.8, 2).fill(0xffffff);
  const bench = [at(-0.16, 0.45, 3.4), at(0.16, 0.45, 3.4), at(0.16, 0.4, 3.4), at(-0.16, 0.4, 3.4)];
  g.poly(bench.flat()).fill(0x8a5a36);
}

export class StreetFurniture {
  /** Each piece goes straight into the depth-sorted object layer, so buildings overlap it correctly. */
  private pieces: Container[] = [];
  private sig = '';
  private tiles: Province['tiles'] | null = null;

  constructor(private layer: Container) {}

  get count(): number {
    return this.pieces.length;
  }

  destroy(): void {
    for (const piece of this.pieces) piece.destroy({ children: true });
    this.pieces = [];
  }

  /** Rebuilds the furniture after roads, buildings or the season changed. */
  sync(p: Province, season: string, culture: string): void {
    // tiles are replaced, never mutated, whenever a road or building changes
    if (p.tiles === this.tiles && season === this.sig) return;
    this.tiles = p.tiles;
    this.sig = season;
    this.destroy();
    for (const spot of furnitureSpots(p)) {
      const t = tileAt(p, spot.x, spot.y)!;
      const holder = new Container();
      const g = new Graphics();
      holder.addChild(g);
      const ox = isoX(spot.x, spot.y), oy = isoY(spot.x, spot.y) - t.height * HEIGHT_PX;
      if (spot.kind === 'tree') {
        const along = hash(spot.x, spot.y, 9) * 0.5 - 0.25;
        const u = 0.5 + Math.abs(spot.ny) * along + spot.nx * 0.44;
        const v = 0.5 + Math.abs(spot.nx) * along + spot.ny * 0.44;
        const [x, y] = P(u, v);
        tree(g, [x + ox, y + oy], 0.8 + hash(spot.x, spot.y, 4) * 0.3, season === 'autumn', season === 'winter');
        holder.zIndex = spot.x + u + spot.y + v + 0.01;
      } else {
        shelter(g, ox, oy, spot.nx, spot.ny, culture);
        for (let i = 0; i < 2; i++) {
          const person = new Graphics();
          const rand = ((seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(spot.x * 131 + spot.y * 17 + i + 1);
          drawPedestrian(person, randomPedLook(rand), 0);
          const a = i ? 0.1 : -0.08;
          const [x, y] = P(0.5 + Math.abs(spot.ny) * a + spot.nx * 0.33, 0.5 + Math.abs(spot.nx) * a + spot.ny * 0.33);
          person.position.set(x + ox, y + oy);
          person.scale.set(0.72);
          holder.addChild(person);
        }
        holder.zIndex = spot.x + spot.y + 1 + 0.01;
      }
      holder.cullable = true;
      this.layer.addChild(holder);
      this.pieces.push(holder);
    }
  }
}
