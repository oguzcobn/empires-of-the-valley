import { Container, Graphics } from 'pixi.js';
import type { BuildingInstance, GameState, Province } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { defOf } from '../data/buildings';
import { isBuilt } from '../systems/economy';
import { tileAt } from '../systems/grid';
import { bay, door, flightAt, validCityJob } from '../systems/cityLife';
import type { CityFlight, CityPoint } from '../systems/cityLife';
import { P, isoX, isoY } from './iso';
import { drawVillager } from './sprites';
import { drawCityCar, drawFireTruck } from './trafficSprites';

interface Actor {
  root: Container;
  car: Graphics;
  person: Graphics;
  red: Graphics;
  blue: Graphics;
  fx: Graphics;
  key: string;
}

const lerp = (a: CityPoint, b: CityPoint, t: number): CityPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function flightPoint(
  f: CityFlight,
  b: BuildingInstance,
  fraction: number,
): CityPoint & { alt: number; heading: 1 | -1 } {
  const cur = flightAt(f, b),
    next = flightAt({ ...f, step: f.step + 1 }, b);
  return {
    x: cur.x + (next.x - cur.x) * fraction,
    y: cur.y + (next.y - cur.y) * fraction,
    alt: cur.alt + (next.alt - cur.alt) * fraction,
    heading: cur.heading,
  };
}

/** Realistic 2.5D commercial passenger jet airliner with swept wings, twin turbofan engines, cockpit, cabin windows, and tail fin. */
function drawCommercialAirliner(g: Graphics, heading: 1 | -1): void {
  const h = heading;
  // Soft ground/air shadow beneath the fuselage
  const sh = [P(-0.55 * h, -0.05, 0), P(0.65 * h, -0.05, 0), P(0.65 * h, 0.12, 0), P(-0.55 * h, 0.12, 0)].flat();
  g.poly(sh).fill({ color: 0x0f172a, alpha: 0.22 });

  // Swept main wings (drawn first under/mid fuselage) + winglets
  const wingL = [
    P(0.12 * h, -0.06, 2),
    P(-0.18 * h, -0.58, 3),
    P(-0.34 * h, -0.58, 3.5),
    P(-0.18 * h, -0.06, 2),
  ].flat();
  const wingR = [
    P(0.12 * h, 0.06, 2),
    P(-0.18 * h, 0.58, 3),
    P(-0.34 * h, 0.58, 3.5),
    P(-0.18 * h, 0.06, 2),
  ].flat();
  g.poly(wingL).fill(0xdbe4ec).stroke({ color: 0x64748b, width: 0.9 });
  g.poly(wingR).fill(0xcbd5e1).stroke({ color: 0x64748b, width: 0.9 });

  // Twin under-wing turbofan engine nacelles
  for (const wy of [-0.28, 0.28]) {
    const eng = [
      P(0.08 * h, wy - 0.05, 1),
      P(-0.14 * h, wy - 0.05, 1),
      P(-0.14 * h, wy + 0.05, 1),
      P(0.08 * h, wy + 0.05, 1),
    ].flat();
    g.poly(eng).fill(0x475569).stroke({ color: 0x1e293b, width: 0.8 });
    const intake = P(0.09 * h, wy, 1.2);
    g.circle(intake[0], intake[1], 1.8).fill(0x0f172a);
  }

  // Horizontal tailplane stabilizers
  const tailPlane = [
    P(-0.46 * h, 0, 3),
    P(-0.68 * h, -0.26, 3.5),
    P(-0.76 * h, -0.26, 3.5),
    P(-0.62 * h, 0, 3),
    P(-0.76 * h, 0.26, 3.5),
    P(-0.68 * h, 0.26, 3.5),
  ].flat();
  g.poly(tailPlane).fill(0xcbd5e1).stroke({ color: 0x64748b, width: 0.8 });

  // Cylindrical pressurized fuselage with aerodynamic nose cone and tapered tail
  const fuselage = [
    P(0.82 * h, 0, 2.5),
    P(0.62 * h, -0.09, 3.5),
    P(-0.56 * h, -0.09, 3.5),
    P(-0.76 * h, -0.03, 4),
    P(-0.76 * h, 0.03, 4),
    P(-0.56 * h, 0.09, 3.5),
    P(0.62 * h, 0.09, 3.5),
  ].flat();
  g.poly(fuselage).fill(0xf8fafc).stroke({ color: 0x475569, width: 1.1 });

  // Royal Blue airline cheatline stripe along the fuselage
  const stripe = [
    P(0.64 * h, 0.02, 3.8),
    P(-0.62 * h, 0.02, 3.8),
    P(-0.66 * h, 0.06, 3.2),
    P(0.6 * h, 0.06, 3.2),
  ].flat();
  g.poly(stripe).fill(0x0284c7);

  // Cockpit wrap-around dark glass windshield
  const cockpit = [
    P(0.74 * h, 0, 3.2),
    P(0.62 * h, -0.06, 4.2),
    P(0.54 * h, -0.06, 4.2),
    P(0.58 * h, 0.06, 4.2),
  ].flat();
  g.poly(cockpit).fill(0x0f172a);

  // Illuminated passenger cabin windows
  for (let u = -0.42; u <= 0.44; u += 0.11) {
    const wp = P(u * h, 0.04, 4.1);
    g.circle(wp[0], wp[1], 1.05).fill(0xbae6fd);
  }

  // Tall swept vertical tail fin (stabilizer) with airline emblem
  const fin = [
    P(-0.46 * h, 0, 3.8),
    P(-0.68 * h, 0, 14.5),
    P(-0.8 * h, 0, 14.5),
    P(-0.74 * h, 0.04, 3.8),
  ].flat();
  g.poly(fin).fill(0x0284c7).stroke({ color: 0x0369a1, width: 0.9 });
  const logoAt = P(-0.68 * h, 0, 10.5);
  g.circle(logoAt[0], logoAt[1], 2.1).fill(0xfef08a);

  // Wingtip navigation lights (red port / green starboard) + white tail strobe
  const navL = P(-0.28 * h, -0.57, 3.6);
  const navR = P(-0.28 * h, 0.57, 3.6);
  g.circle(navL[0], navL[1], 1.5).fill(0xef4444);
  g.circle(navR[0], navR[1], 1.5).fill(0x22c55e);
}

export class CityScenes {
  private actors = new Map<string, Actor>();
  private tick = -1;
  private fraction = 0;
  private time = 0;
  private tint = 0xffffff;
  constructor(private layer: Container) {}
  setTint(tint: number): void {
    this.tint = tint;
    for (const a of this.actors.values()) a.car.tint = a.person.tint = tint;
  }
  private actor(id: string): Actor {
    let a = this.actors.get(id);
    if (a) return a;
    const root = new Container(),
      car = new Graphics(),
      person = new Graphics(),
      red = new Graphics(),
      blue = new Graphics(),
      fx = new Graphics();
    drawVillager(person, 0xdba357, id.length);
    person.scale.set(0.58);
    red.circle(-3, -12, 2.2).fill(0xff334e);
    blue.circle(3, -12, 2.2).fill(0x3794ff);
    car.tint = person.tint = this.tint;
    root.cullable = true;
    root.addChild(car, person, red, blue, fx);
    this.layer.addChild(root);
    a = { root, car, person, red, blue, fx, key: '' };
    this.actors.set(id, a);
    return a;
  }
  update(s: GameState, p: Province, dt: number, reduced: boolean): void {
    if (this.tick !== s.tick) {
      this.tick = s.tick;
      this.fraction = 0;
    }
    if (s.speed && !reduced) {
      this.fraction = Math.min(1, this.fraction + (dt * s.speed) / 4000);
      this.time += dt;
    }
    const seen = new Set<string>();
    const place = (a: Actor, pt: CityPoint, lift = 0): void => {
      const h = (tileAt(p, Math.floor(pt.x), Math.floor(pt.y))?.height ?? 0) * HEIGHT_PX;
      a.root.position.set(isoX(pt.x, pt.y), isoY(pt.x, pt.y) - h - lift);
      a.root.zIndex = pt.x + pt.y + (lift ? 80 : 0.08);
    };
    for (const j of s.cityLife?.jobs ?? []) {
      if (!validCityJob(p, j)) continue;
      const id = `job:${j.id}`;
      seen.add(id);
      const a = this.actor(id),
        target = p.buildings.find((b) => b.id === j.target)!;
      const moving = j.stage === 'outbound' || j.stage === 'return';
      const cur = j.path[j.index]!,
        next = j.path[Math.min(j.index + 1, j.path.length - 1)]!;
      let at = moving ? lerp(cur, next, this.fraction) : j.path.at(-1)!;
      const dx = next.x - cur.x,
        dy = next.y - cur.y;
      if (
        moving &&
        tileAt(p, Math.floor(cur.x), Math.floor(cur.y))?.road &&
        tileAt(p, Math.floor(next.x), Math.floor(next.y))?.road
      ) {
        const len = Math.hypot(dx, dy) || 1,
          side = s.culture === 'scottish' ? -1 : 1;
        at = { x: at.x - (dy / len) * 0.11 * side, y: at.y + (dx / len) * 0.11 * side };
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
                : j.kind === 'business'
                  ? 0x1e293b
                  : 0x619b98;
      const key = `${j.kind}:${paint}:${Math.sign(dx)},${Math.sign(dy)}`;
      if (a.key !== key) {
        a.car.clear();
        if (j.kind === 'fire') {
          drawFireTruck(a.car, dx || 1, dy);
        } else {
          drawCityCar(a.car, paint, false, dx || 1, dy);
          if (j.kind === 'ambulance') {
            a.car.rect(-1, -7, 2, 6).fill(0xdc3345);
            a.car.rect(-3, -5, 6, 2).fill(0xdc3345);
          }
          if (j.kind === 'delivery') a.car.roundRect(-6, -9, 10, 7, 1).fill(0xc9b994);
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
          if (b.definitionId === 'fire_station') {
            drawFireTruck(a.car, 1, 0);
          } else {
            drawCityCar(a.car, b.definitionId === 'hospital' ? 0xf5f7f5 : 0x295383, false, 1, 0);
            if (b.definitionId === 'hospital') {
              a.car.rect(-1, -7, 2, 6).fill(0xdc3345);
              a.car.rect(-3, -5, 6, 2).fill(0xdc3345);
            }
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
      if (a.key !== `${at.heading}`) {
        a.car.clear();
        drawCommercialAirliner(a.car, at.heading);
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