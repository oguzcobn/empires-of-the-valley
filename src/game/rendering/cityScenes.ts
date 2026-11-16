import { Container, Graphics } from 'pixi.js';
import type { GameState, MapPoint, Province } from '../core/types';
import { bay, door, flightDuration, validCityJob } from '../systems/cityLife';
import type { Flight } from '../systems/cityLife';
import { isBuilt } from '../systems/economy';
import { tileAt } from '../systems/grid';
import { defOf } from '../data/buildings';
import { HEIGHT_PX } from '../data/balance';
import { isoX, isoY, P } from './iso';
import { drawCityCar } from './trafficSprites';
import { drawVillager } from './sprites';

const lerp = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function flightPoint(
  f: Flight,
  b: MapPoint,
  fraction: number,
): MapPoint & { alt: number; heading: number } {
  const t = Math.min(1, (f.age + fraction) / flightDuration(f.phase));
  if (f.phase === 'landing') return { x: b.x - 2 + t * 7.7, y: b.y + 0.72, alt: 50 * (1 - t), heading: 1 };
  if (f.phase === 'takeoff')
    return { x: b.x + 0.5 + t * 10, y: b.y + 0.72, alt: Math.max(0, t - 0.4) * 110, heading: 1 };
  if (f.phase === 'terminal') return { x: b.x + 5.5, y: b.y + 1.85, alt: 0, heading: -1 };
  const path =
    f.phase === 'taxiIn'
      ? [
          { x: 5.7, y: 0.72 },
          { x: 6.8, y: 0.72 },
          { x: 6.8, y: 1.85 },
          { x: 5.5, y: 1.85 },
        ]
      : [
          { x: 5.5, y: 1.85 },
          { x: 0.5, y: 1.85 },
          { x: 0.5, y: 0.72 },
        ];
  const i = Math.min(path.length - 2, Math.floor(t * (path.length - 1))),
    local = t * (path.length - 1) - i;
  const at = lerp(path[i]!, path[i + 1]!, local);
  return { x: b.x + at.x, y: b.y + at.y, alt: 0, heading: f.phase === 'taxiIn' ? 1 : -1 };
}
interface Actor {
  root: Container;
  car: Graphics;
  person: Graphics;
  red: Graphics;
  blue: Graphics;
  key: string;
}
export class CityScenes {
  private actors = new Map<string, Actor>();
  private tick = -1;
  private fraction = 0;
  private time = 0;
  constructor(private parent: Container) {}
  private actor(id: string): Actor {
    let a = this.actors.get(id);
    if (a) return a;
    const root = new Container(),
      car = new Graphics(),
      person = new Graphics(),
      red = new Graphics(),
      blue = new Graphics();
    root.addChild(car, person, red, blue);
    root.cullable = true;
    this.parent.addChild(root);
    drawVillager(person, 0xdfa454, 0);
    red.circle(-1, -8, 2).fill(0xff334e);
    blue.circle(2, -8, 2).fill(0x367eff);
    a = { root, car, person, red, blue, key: '' };
    this.actors.set(id, a);
    return a;
  }
  update(s: GameState, p: Province, dt: number, reduced: boolean): void {
    if (s.tick !== this.tick) {
      this.tick = s.tick;
      this.fraction = 0;
    }
    if (s.speed > 0 && !reduced) {
      this.fraction = Math.min(1, this.fraction + (dt * s.speed) / 4000);
      this.time += dt;
    }
    const seen = new Set<string>();
    const place = (a: Actor, at: MapPoint, alt = 0): void => {
      const h =
        (tileAt(
          p,
          Math.max(0, Math.min(p.width - 1, Math.floor(at.x))),
          Math.max(0, Math.min(p.height - 1, Math.floor(at.y))),
        )?.height ?? 0) * HEIGHT_PX;
      a.root.position.set(isoX(at.x, at.y), isoY(at.x, at.y) - h - alt);
      a.root.zIndex = at.x + at.y + 0.08 + (alt > 0 ? 100 : 0);
    };
    for (const j of s.cityLife?.jobs ?? []) {
      if (!validCityJob(p, j)) continue;
      const target = p.buildings.find((b) => b.id === j.target)!;
      const id = `job:${j.id}`;
      seen.add(id);
      const a = this.actor(id);
      const moving = j.stage === 'outbound' || j.stage === 'return';
      const start = j.path[j.index]!,
        end = j.path[Math.min(j.index + 1, j.path.length - 1)]!;
      let at = moving ? lerp(start, end, this.fraction) : j.path.at(-1)!;
      const dx = end.x - start.x,
        dy = end.y - start.y;
      // Consistent opposite lanes; parking/access points remain on their reserved lot.
      if (
        moving &&
        tileAt(p, Math.floor(start.x), Math.floor(start.y))?.road &&
        tileAt(p, Math.floor(end.x), Math.floor(end.y))?.road
      ) {
        const len = Math.hypot(dx, dy) || 1,
          side = s.culture === 'scottish' ? -1 : 1;
        at = { x: at.x - (dy / len) * 0.13 * side, y: at.y + (dx / len) * 0.13 * side };
      }
      place(a, at);
      const own = p.buildings.find((b) => b.id === tileAt(p, Math.floor(at.x), Math.floor(at.y))?.buildingId);
      if (own && at.y >= own.y + 1.12) {
        const [w, h] = defOf(own).footprint;
        a.root.zIndex = own.x + own.y + w + h - 0.9;
      }
      const paint =
        j.kind === 'ambulance'
          ? 0xf5f7f5
          : j.kind === 'patrol'
            ? 0x295383
            : j.kind === 'delivery'
              ? 0xb98749
              : 0x619b98;
      const key = `${paint}:${Math.sign(dx)},${Math.sign(dy)}`;
      if (a.key !== key) {
        a.car.clear();
        drawCityCar(a.car, paint, false, dx || 1, dy);
        if (j.kind === 'ambulance') {
          a.car.rect(-1, -7, 2, 6).fill(0xdc3345);
          a.car.rect(-3, -5, 6, 2).fill(0xdc3345);
        }
        if (j.kind === 'delivery') a.car.roundRect(-6, -9, 10, 7, 1).fill(0xc9b994);
        a.key = key;
      }
      a.car.visible = true;
      a.person.visible =
        ['walkIn', 'walkOut'].includes(j.stage) || (j.stage === 'inside' && j.kind === 'dining');
      if (a.person.visible) {
        const park = j.path.at(-1)!,
          entry = door(target);
        let personAt =
          j.stage === 'walkOut'
            ? lerp(entry, park, this.fraction)
            : j.stage === 'inside'
              ? { x: target.x + 0.45, y: target.y + 1.85 }
              : lerp(park, entry, this.fraction);
        if (reduced) personAt = park;
        a.person.position.set(
          isoX(personAt.x - at.x, personAt.y - at.y),
          isoY(personAt.x - at.x, personAt.y - at.y),
        );
      }
      const emergency = j.kind === 'patrol' || j.kind === 'ambulance';
      a.red.visible = emergency && !reduced && Math.floor(this.time / 280) % 2 === 0;
      a.blue.visible = emergency && !reduced && !a.red.visible;
    }
    for (const b of p.buildings) {
      if (!isBuilt(b) || !['hospital', 'police_station'].includes(b.definitionId)) continue;
      for (let slot = 0; slot < (b.definitionId === 'hospital' ? 2 : 1); slot++) {
        if (s.cityLife?.jobs.some((j) => j.source === b.id && slot === 0)) continue;
        const id = `idle:${b.id}:${slot}`;
        seen.add(id);
        const a = this.actor(id);
        place(a, bay(b, slot));
        a.root.zIndex = b.x + b.y + 3.1;
        if (a.key !== 'idle') {
          a.car.clear();
          drawCityCar(a.car, b.definitionId === 'hospital' ? 0xf5f7f5 : 0x295383, false, 1, 0);
          if (b.definitionId === 'hospital') {
            a.car.rect(-1, -7, 2, 6).fill(0xdc3345);
            a.car.rect(-3, -5, 6, 2).fill(0xdc3345);
          }
          a.key = 'idle';
        }
        a.person.visible = a.red.visible = a.blue.visible = false;
      }
    }
    for (const f of s.cityLife?.flights ?? []) {
      const b = p.buildings.find((b) => b.id === f.airport && isBuilt(b));
      if (!b) continue;
      const id = `flight:${b.id}`;
      seen.add(id);
      const a = this.actor(id),
        at = flightPoint(f, b, this.fraction);
      place(a, at, at.alt);
      a.root.zIndex = b.x + b.y + 11.1 + (at.alt > 0 ? 100 : 0);
      a.person.visible = a.red.visible = a.blue.visible = false;
      if (a.key !== `${at.heading}`) {
        a.car.clear();
        const pts = [
          [0.7, 0],
          [-0.25, -0.12],
          [-0.45, -0.45],
          [-0.65, -0.45],
          [-0.5, -0.04],
          [-0.7, 0.04],
          [-0.5, 0.12],
          [-0.6, 0.45],
          [-0.4, 0.45],
          [-0.2, 0.12],
        ];
        a.car
          .poly(pts.flatMap(([x, y]) => P(x! * at.heading, y!)))
          .fill(0xf5f5ec)
          .stroke({ color: 0x54728a, width: 1 });
        a.car
          .poly(
            [
              P(-0.45 * at.heading, 0, 1),
              P(-0.65 * at.heading, 0, 10),
              P(-0.65 * at.heading, 0.08, 1),
            ].flat(),
          )
          .fill(0x258eae);
        a.key = `${at.heading}`;
      }
    }
    for (const [id, a] of this.actors)
      if (!seen.has(id)) {
        a.root.destroy({ children: true });
        this.actors.delete(id);
      }
  }
  destroy(): void {
    for (const a of this.actors.values()) a.root.destroy({ children: true });
    this.actors.clear();
  }
  get count(): number {
    return this.actors.size;
  }
}
