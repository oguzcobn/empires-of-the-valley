import { Container, Graphics } from 'pixi.js';
import type { GameState, MapPoint, Province } from '../core/types';
import { bay, door, flightDuration, validCityJob } from '../systems/cityLife';
import type { Flight } from '../systems/cityLife';
import { isBuilt } from '../systems/economy';
import { tileAt } from '../systems/grid';
import { defOf } from '../data/buildings';
import { HEIGHT_PX } from '../data/balance';
import { isoX, isoY } from './iso';
import { drawCityCar, drawFireTruck, drawServiceVehicle } from './trafficSprites';
import { drawAirliner, drawLorry } from './vehicles';
import { clockHour } from '../core/time';
import { WALK_FRAMES, drawPedestrian, randomPedLook } from './pedestrians';
import type { PedLook } from './pedestrians';

/** Private cars of shoppers, diners and guests. */
const CAR_PAINTS = [0xe4e7ec, 0xbe4741, 0x345a89, 0x364b54, 0xe4b755, 0x7d9a75, 0x8e44ad, 0x1b1b1b, 0xd35400, 0x95a5a6];

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
  fx: Graphics;
  key: string;
  look: PedLook;
  shown: string;
}

/** Stable random numbers per actor id, so a shopper keeps their clothes. */
function seeded(id: string): () => number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x6d2b79f5;
    return ((h ^ (h >>> 13)) >>> 0) / 0x100000000;
  };
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
      blue = new Graphics(),
      fx = new Graphics();
    root.addChild(car, person, red, blue, fx);
    root.cullable = true;
    this.parent.addChild(root);
    const look = randomPedLook(seeded(id));
    drawPedestrian(person, look, 0);
    red.circle(-1, -11, 2.2).fill(0xff334e);
    blue.circle(2.5, -11, 2.2).fill(0x367eff);
    a = { root, car, person, red, blue, fx, key: '', look, shown: '' };
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
        j.kind === 'fire'
          ? 0xd62828
          : j.kind === 'ambulance'
            ? 0xf5f7f5
            : j.kind === 'patrol'
              ? 0x295383
              : j.kind === 'delivery'
                ? 0xb98749
                : CAR_PAINTS[j.id % CAR_PAINTS.length]!;
      // vehicles face along the dominant axis of their segment; raw deltas would skew and shrink them
      // parked visitors stand nose-in across their bay, which is narrower than a car is long
      const visitor = j.kind === 'shopping' || j.kind === 'dining' || j.kind === 'nightlife' || j.kind === 'hotel';
      const [hx, hy] = !moving && visitor
        ? [0, -1]
        : Math.abs(dx) >= Math.abs(dy) ? [dx < 0 ? -1 : 1, 0] : [0, dy < 0 ? -1 : 1];
      const key = `${j.kind}:${paint}:${hx},${hy}`;
      if (a.key !== key) {
        a.car.clear();
        if (j.kind === 'fire') {
          drawFireTruck(a.car, hx, hy);
        } else if (j.kind === 'delivery') {
          drawLorry(a.car, hx, hy, [0xb98749, 0x2e7d32, 0xc62828][j.id % 3]!, 0x37474f);
        } else if (j.kind === 'ambulance' || j.kind === 'patrol') {
          drawServiceVehicle(a.car, j.kind, hx, hy);
        } else {
          drawCityCar(a.car, paint, false, hx, hy, j.id % 5);
        }
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
        const walking = j.stage !== 'inside' && !reduced && s.speed > 0;
        const to = j.stage === 'walkOut' ? park : entry;
        const from = j.stage === 'walkOut' ? entry : park;
        const hx = walking ? Math.sign(Math.round((to.x - from.x) * 4)) : 0;
        const hy = walking && !hx ? Math.sign(Math.round((to.y - from.y) * 4)) : 0;
        const frame = walking ? Math.floor(this.time / 110) % WALK_FRAMES : 0;
        const shown = `${frame}|${hx},${hy}`;
        if (shown !== a.shown) {
          a.shown = shown;
          drawPedestrian(a.person, a.look, frame, hx, hy);
        }
        a.person.position.set(
          isoX(personAt.x - at.x, personAt.y - at.y),
          isoY(personAt.x - at.x, personAt.y - at.y),
        );
      }
      const emergency = j.kind === 'patrol' || j.kind === 'ambulance' || j.kind === 'fire';
      a.red.visible = emergency && !reduced && Math.floor(this.time / 240) % 2 === 0;
      a.blue.visible = emergency && !reduced && !a.red.visible;

      // Fire emergency flames on the target building + high-pressure water spray from the fire truck!
      a.fx.clear();
      if (j.kind === 'fire' && j.stage !== 'return' && j.stage !== 'walkOut') {
        const [tw, th] = defOf(target).footprint;
        const fireWorldX = target.x + tw * 0.48;
        const fireWorldY = target.y + th * 0.45;
        const fxX = isoX(fireWorldX - at.x, fireWorldY - at.y);
        const fxY = isoY(fireWorldX - at.x, fireWorldY - at.y) - 22;

        // Roaring multi-layered flames & dark smoke rising from the burning building
        for (let k = 0; k < 5; k++) {
          const phase = this.time / 130 + k * 1.4;
          const ox = Math.sin(phase) * 7 + (k - 2) * 4.5;
          const oy = Math.cos(phase * 1.2) * 3;
          const flameH = 9 + Math.sin(phase * 1.7) * 4;
          a.fx.poly([fxX + ox - 5, fxY + oy, fxX + ox, fxY + oy - flameH - 6, fxX + ox + 5, fxY + oy])
            .fill({ color: 0xff3b1f, alpha: 0.85 });
          a.fx.poly([fxX + ox - 3, fxY + oy, fxX + ox, fxY + oy - flameH, fxX + ox + 3, fxY + oy])
            .fill({ color: 0xffb703, alpha: 0.92 });
          // Rising dark smoke clouds above the fire
          const smokeAge = ((this.time / 350 + k * 0.35) % 1);
          a.fx.circle(fxX + ox + smokeAge * 8, fxY - 12 - smokeAge * 26, 4 + smokeAge * 7)
            .fill({ color: 0x334155, alpha: (1 - smokeAge) * 0.55 });
        }

        // High-pressure water jet spraying from the fire truck's roof cannon onto the flames!
        if (j.stage === 'park' || j.stage === 'walkIn' || j.stage === 'inside') {
          const nozzleX = 0;
          const nozzleY = -16;
          const midX = (nozzleX + fxX) * 0.5;
          const midY = Math.min(nozzleY, fxY) - 26;
          // Continuous main water stream + bright white core
          a.fx.moveTo(nozzleX, nozzleY)
            .quadraticCurveTo(midX, midY, fxX, fxY - 2)
            .stroke({ color: 0x38bdf8, width: 3.6, alpha: 0.82, cap: 'round' });
          a.fx.moveTo(nozzleX, nozzleY)
            .quadraticCurveTo(midX, midY - 1.5, fxX, fxY - 2)
            .stroke({ color: 0xe0f2fe, width: 1.8, alpha: 0.92, cap: 'round' });
          // Animated water droplets & foam splash along the jet
          for (let d = 0; d < 8; d++) {
            const u = ((this.time / 220 + d / 8) % 1);
            const inv = 1 - u;
            const wx = inv * inv * nozzleX + 2 * inv * u * midX + u * u * fxX;
            const wy = inv * inv * nozzleY + 2 * inv * u * midY + u * u * (fxY - 2);
            a.fx.circle(wx + Math.sin(d * 2.1 + this.time / 60) * 2.2, wy, 1.8).fill({ color: 0xbae6fd, alpha: 0.9 });
          }
          // Water foam splash on the burning roof
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const ang = (this.time / 90) + sIdx * 1.57;
            a.fx.circle(fxX + Math.cos(ang) * 7, fxY - 2 + Math.sin(ang) * 3.5, 2.5)
              .fill({ color: 0xe0f2fe, alpha: 0.78 });
          }
        }
      }
    }
    for (const b of p.buildings) {
      if (!isBuilt(b) || !['hospital', 'police_station', 'fire_station'].includes(b.definitionId)) continue;
      for (let slot = 0; slot < (b.definitionId === 'hospital' ? 2 : 1); slot++) {
        if (s.cityLife?.jobs.some((j) => j.source === b.id && slot === 0)) continue;
        const id = `idle:${b.id}:${slot}`;
        seen.add(id);
        const a = this.actor(id);
        place(a, bay(b, slot));
        a.root.zIndex = b.x + b.y + 3.1;
        if (a.key !== `idle:${b.definitionId}`) {
          a.car.clear();
          // reversed into the bay, ready to drive out
          if (b.definitionId === 'fire_station') {
            drawFireTruck(a.car, 0, 1);
          } else {
            drawServiceVehicle(a.car, b.definitionId === 'hospital' ? 'ambulance' : 'patrol', 0, 1);
          }
          a.key = `idle:${b.definitionId}`;
        }
        a.person.visible = a.red.visible = a.blue.visible = false;
        a.fx.clear();
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
      // Approach altitude is relative to the runway, not changing terrain under the aircraft.
      a.root.y = isoY(at.x, at.y) - (tileAt(p, b.x, b.y)?.height ?? 0) * HEIGHT_PX - at.alt;
      a.root.zIndex = b.x + b.y + 11.1 + (at.alt > 0 ? 100 : 0);
      a.person.visible = a.red.visible = a.blue.visible = false;
      a.fx.clear();
      // heading from the next point on the flight path; shadow on the apron while airborne
      const ahead = flightPoint(f, b, Math.min(1, this.fraction + 0.08));
      const vx = ahead.x - at.x, vy = ahead.y - at.y;
      const [hx, hy] = Math.abs(vx) >= Math.abs(vy) ? [vx < 0 ? -1 : 1, 0] : [0, vy < 0 ? -1 : 1];
      const night = clockHour(s.tick) >= 19 || clockHour(s.tick) < 6;
      if (at.alt > 0) {
        const k = Math.max(0.25, 1 - at.alt / 140);
        a.fx.ellipse(0, at.alt + 2, 30 * k, 9 * k).fill({ color: 0x0e1b24, alpha: 0.22 * k });
      }
      const planeKey = `${hx},${hy}|${night}`;
      if (a.key !== planeKey) {
        a.car.clear();
        drawAirliner(a.car, hx, hy, s.culture === 'scottish' ? 0x1d3f8f : 0xc8102e, night);
        a.key = planeKey;
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