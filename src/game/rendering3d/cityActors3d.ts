import * as THREE from 'three';
import type { GameState, Province } from '../core/types';
import { bay, door, validCityJob } from '../systems/cityLife';
import type { CityJobKind } from '../systems/cityLife';
import { defOf } from '../data/buildings';
import { flightPoint } from '../rendering/cityScenes';
import { standY } from './terrain3d';
import { tileAt } from '../systems/grid';

type ActorVariant = CityJobKind | 'plane';

export class CityActors3D {
  readonly group = new THREE.Group();
  private actors = new Map<string, THREE.Group>();
  private tick = -1;
  private fraction = 0;
  private time = 0;
  private box = new THREE.BoxGeometry(1, 1, 1);
  private paints = new Map<number, THREE.MeshStandardMaterial>();

  private part(
    g: THREE.Object3D,
    color: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ): THREE.Mesh {
    let mat = this.paints.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color });
      this.paints.set(color, mat);
    }
    const mesh = new THREE.Mesh(this.box, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    g.add(mesh);
    return mesh;
  }

  private buildPerson(firefighter = false): THREE.Group {
    const p = new THREE.Group();
    p.name = 'person';
    p.visible = false;
    this.part(p, 0x353d4a, 0, 0.035, -0.014, 0.024, 0.07, 0.022);
    this.part(p, 0x353d4a, 0, 0.035, 0.014, 0.024, 0.07, 0.022);
    this.part(p, firefighter ? 0xb91c1c : 0xdba357, 0, 0.1, 0, 0.042, 0.075, 0.056);
    this.part(p, 0xf0c9a0, 0, 0.16, 0, 0.038, 0.04, 0.038);
    this.part(p, firefighter ? 0xfacc15 : 0x3a2c22, -0.004, 0.184, 0, 0.046, 0.018, 0.046);
    return p;
  }

  private buildFireFx(): THREE.Group {
    const fx = new THREE.Group();
    fx.name = 'fireFx';
    fx.visible = false;
    // 4 flame tongues + 3 smoke puffs + 8 water stream droplets
    for (let i = 0; i < 4; i++) {
      const f = this.part(fx, i % 2 === 0 ? 0xff3b1f : 0xffb703, 0, 0, 0, 0.09, 0.18, 0.09);
      f.name = `flame:${i}`;
    }
    for (let i = 0; i < 3; i++) {
      const s = this.part(fx, 0x334155, 0, 0, 0, 0.12, 0.1, 0.12);
      s.name = `smoke:${i}`;
    }
    for (let i = 0; i < 8; i++) {
      const w = this.part(fx, i % 2 === 0 ? 0x38bdf8 : 0xe0f2fe, 0, 0, 0, 0.045, 0.045, 0.045);
      w.name = `water:${i}`;
    }
    return fx;
  }

  private get(id: string, variant: ActorVariant, paint: number): THREE.Group {
    let g = this.actors.get(id);
    if (g && g.userData.variant === variant && g.userData.paint === paint) return g;
    if (g) {
      g.removeFromParent();
      this.actors.delete(id);
    }
    g = new THREE.Group();
    g.userData.variant = variant;
    g.userData.paint = paint;
    this.actors.set(id, g);
    this.group.add(g);

    if (variant === 'plane') {
      // Detailed commercial airliner: fuselage, nose, swept wings, twin engines, tail fin & windows
      this.part(g, 0xf5f5ec, 0, 0.11, 0, 0.78, 0.11, 0.13);
      this.part(g, 0xf5f5ec, 0.42, 0.1, 0, 0.12, 0.08, 0.1);
      this.part(g, 0x2b4256, 0.39, 0.125, 0, 0.08, 0.035, 0.095);
      this.part(g, 0x258eae, 0.02, 0.115, 0, 0.68, 0.024, 0.134);
      // Swept main wings + winglets + navigation lights
      this.part(g, 0xdfe4e8, -0.02, 0.095, 0, 0.22, 0.018, 0.96);
      this.part(g, 0x258eae, -0.06, 0.13, -0.47, 0.08, 0.06, 0.016);
      this.part(g, 0x258eae, -0.06, 0.13, 0.47, 0.08, 0.06, 0.016);
      this.part(g, 0xff334e, -0.02, 0.105, -0.48, 0.03, 0.02, 0.02);
      this.part(g, 0x2ecc71, -0.02, 0.105, 0.48, 0.03, 0.02, 0.02);
      // Twin under-wing jet engines
      for (const z of [-0.22, 0.22]) {
        this.part(g, 0x6c7a86, 0.04, 0.065, z, 0.14, 0.045, 0.05);
        this.part(g, 0x222830, 0.11, 0.065, z, 0.015, 0.038, 0.042);
      }
      // Tailplane and vertical stabilizer
      this.part(g, 0xdfe4e8, -0.35, 0.115, 0, 0.12, 0.015, 0.34);
      this.part(g, 0x258eae, -0.35, 0.21, 0, 0.15, 0.18, 0.022);
      this.part(g, 0xf5f5ec, -0.36, 0.22, 0, 0.07, 0.06, 0.026);
      // Landing gear
      this.part(g, 0x1d2228, 0.28, 0.03, 0, 0.035, 0.05, 0.03);
      this.part(g, 0x1d2228, -0.05, 0.03, -0.08, 0.04, 0.05, 0.03);
      this.part(g, 0x1d2228, -0.05, 0.03, 0.08, 0.04, 0.05, 0.03);
    } else if (variant === 'fire') {
      // Detailed 3D Fire Truck (İtfaiye Arabası): 6 wheels, crew cab, pump body, shutters, extension ladder & water cannon
      for (const x of [-0.16, -0.04, 0.15]) {
        for (const z of [-0.095, 0.095]) {
          this.part(g, 0x181c20, x, 0.03, z, 0.065, 0.06, 0.028);
          this.part(g, 0xcbd5e1, x, 0.03, z > 0 ? z + 0.008 : z - 0.008, 0.032, 0.032, 0.016);
        }
      }
      // Heavy chassis & chrome bumpers
      this.part(g, 0x2b3138, 0, 0.038, 0, 0.46, 0.026, 0.185);
      this.part(g, 0xcbd5e1, 0.235, 0.045, 0, 0.018, 0.032, 0.195);
      // Rear pump & water tank body + silver roll-up equipment shutters
      this.part(g, 0xd62828, -0.07, 0.115, 0, 0.28, 0.145, 0.188);
      this.part(g, 0x94a3b8, -0.13, 0.115, 0, 0.09, 0.095, 0.194);
      this.part(g, 0x94a3b8, -0.01, 0.115, 0, 0.09, 0.095, 0.194);
      this.part(g, 0xfacc15, -0.18, 0.11, 0, 0.035, 0.045, 0.196);
      // Front double crew cab + white roof + windshield + chrome radiator grille
      this.part(g, 0xd62828, 0.14, 0.125, 0, 0.15, 0.165, 0.186);
      this.part(g, 0xf8fafc, 0.14, 0.21, 0, 0.145, 0.016, 0.182);
      this.part(g, 0xf8fafc, 0.02, 0.075, 0, 0.44, 0.022, 0.192);
      this.part(g, 0x1e293b, 0.216, 0.145, 0, 0.012, 0.065, 0.165);
      this.part(g, 0xcbd5e1, 0.218, 0.08, 0, 0.012, 0.048, 0.13);
      this.part(g, 0xfff4cf, 0.22, 0.072, -0.068, 0.014, 0.024, 0.032);
      this.part(g, 0xfff4cf, 0.22, 0.072, 0.068, 0.014, 0.024, 0.032);
      // Roof turntable + white extension ladder (merdiven) + cyan water monitor nozzle
      this.part(g, 0x475569, -0.14, 0.195, 0, 0.09, 0.022, 0.09);
      this.part(g, 0xf8fafc, -0.01, 0.225, -0.038, 0.36, 0.018, 0.016);
      this.part(g, 0xf8fafc, -0.01, 0.225, 0.038, 0.36, 0.018, 0.016);
      for (let rx = -0.16; rx <= 0.14; rx += 0.06) {
        this.part(g, 0xe2e8f0, rx, 0.225, 0, 0.012, 0.014, 0.076);
      }
      this.part(g, 0x38bdf8, 0.18, 0.242, 0, 0.05, 0.028, 0.032);
    } else {
      // 4 wheels
      for (const x of [-0.1, 0.1]) {
        for (const z of [-0.082, 0.082]) {
          this.part(g, 0x181c20, x, 0.028, z, 0.06, 0.055, 0.026);
        }
      }
      // Lower chassis + headlights & taillights
      this.part(g, 0x2b3138, 0, 0.035, 0, 0.34, 0.024, 0.16);
      this.part(g, 0xfff4cf, 0.172, 0.065, -0.055, 0.012, 0.022, 0.032);
      this.part(g, 0xfff4cf, 0.172, 0.065, 0.055, 0.012, 0.022, 0.032);
      this.part(g, 0xd2332b, -0.172, 0.068, -0.055, 0.012, 0.022, 0.032);
      this.part(g, 0xd2332b, -0.172, 0.068, 0.055, 0.012, 0.022, 0.032);

      if (variant === 'ambulance') {
        // Ambulance van: white body, red emergency stripe & cross, cab windshield
        this.part(g, 0xf5f7f5, -0.01, 0.1, 0, 0.34, 0.12, 0.165);
        this.part(g, 0xdc3345, -0.01, 0.085, 0, 0.344, 0.026, 0.17);
        this.part(g, 0x2b4256, 0.12, 0.12, 0, 0.09, 0.055, 0.145);
        // Red cross on roof
        this.part(g, 0xdc3345, -0.04, 0.163, 0, 0.09, 0.008, 0.03);
        this.part(g, 0xdc3345, -0.04, 0.163, 0, 0.03, 0.008, 0.09);
      } else if (variant === 'patrol') {
        // Police cruiser: navy lower body, white doors & roof, tinted windows
        this.part(g, 0x224675, 0, 0.068, 0, 0.34, 0.06, 0.165);
        this.part(g, 0xf4f6f8, 0, 0.07, 0, 0.16, 0.058, 0.169);
        this.part(g, 0x2b4256, -0.01, 0.125, 0, 0.18, 0.055, 0.142);
        this.part(g, 0xf4f6f8, -0.01, 0.158, 0, 0.15, 0.014, 0.136);
      } else if (variant === 'delivery') {
        // Delivery truck: front cab + tall rear cargo box
        this.part(g, paint, 0.1, 0.095, 0, 0.13, 0.11, 0.16);
        this.part(g, 0x2b4256, 0.14, 0.115, 0, 0.055, 0.05, 0.142);
        this.part(g, 0xe8dfd0, -0.06, 0.12, 0, 0.22, 0.15, 0.172);
        this.part(g, 0xb98749, -0.06, 0.09, 0, 0.224, 0.025, 0.175);
      } else {
        // Passenger sedan
        this.part(g, paint, 0, 0.068, 0, 0.33, 0.058, 0.162);
        this.part(g, 0x2b4256, -0.01, 0.122, 0, 0.17, 0.052, 0.14);
        this.part(g, paint, -0.01, 0.152, 0, 0.145, 0.014, 0.134);
      }
    }

    g.add(this.buildPerson(variant === 'fire'));
    g.add(this.buildFireFx());
    const sirenY = variant === 'fire' ? 0.23 : 0.185;
    const sirenX = variant === 'fire' ? 0.16 : 0.02;
    const red = this.part(g, 0xff2e4c, sirenX, sirenY, -0.042, 0.048, 0.028, 0.048);
    red.name = 'red';
    red.visible = false;
    const blue = this.part(g, variant === 'fire' ? 0xfbbf24 : 0x2e7bff, sirenX, sirenY, 0.042, 0.048, 0.028, 0.048);
    blue.name = 'blue';
    blue.visible = false;
    return g;
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
    for (const j of s.cityLife?.jobs ?? []) {
      if (!validCityJob(p, j)) continue;
      const target = p.buildings.find((b) => b.id === j.target)!;
      const moving = j.stage === 'outbound' || j.stage === 'return';
      const a = j.path[j.index]!,
        b = j.path[Math.min(j.index + 1, j.path.length - 1)]!;
      let at = moving
        ? { x: a.x + (b.x - a.x) * this.fraction, y: a.y + (b.y - a.y) * this.fraction }
        : j.path.at(-1)!;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      if (
        moving &&
        tileAt(p, Math.floor(a.x), Math.floor(a.y))?.road &&
        tileAt(p, Math.floor(b.x), Math.floor(b.y))?.road
      ) {
        const len = Math.hypot(dx, dy) || 1,
          side = s.culture === 'scottish' ? -1 : 1;
        at = { x: at.x - (dy / len) * 0.11 * side, y: at.y + (dx / len) * 0.11 * side };
      }
      const id = `job:${j.id}`;
      seen.add(id);
      const paint =
        j.kind === 'fire'
          ? 0xd62828
          : j.kind === 'patrol'
            ? 0x295383
            : j.kind === 'ambulance'
              ? 0xf5f7f5
              : j.kind === 'delivery'
                ? 0xb98749
                : [0x619b98, 0xd46a4c, 0x4b77a8, 0xd8a848][j.id % 4]!;
      const g = this.get(id, j.kind, paint);
      g.position.set(at.x, standY(tileAt(p, Math.floor(at.x), Math.floor(at.y))) + 0.015, at.y);
      g.rotation.y = moving ? -Math.atan2(dy, dx) : 0;
      const person = g.getObjectByName('person')!;
      person.visible = ['walkIn', 'walkOut'].includes(j.stage);
      if (person.visible) {
        g.rotation.y = 0;
        const park = j.path.at(-1)!,
          entry = door(target),
          t = j.stage === 'walkOut' ? 1 - this.fraction : this.fraction;
        const bob = reduced ? 0 : Math.abs(Math.sin(this.time / 85 + j.id)) * 0.015;
        person.position.set(
          park.x + (entry.x - park.x) * t - at.x,
          0.01 + bob,
          park.y + (entry.y - park.y) * t - at.y,
        );
      }
      const siren = !reduced && (j.kind === 'patrol' || j.kind === 'ambulance' || j.kind === 'fire');
      g.getObjectByName('red')!.visible = siren && Math.floor(this.time / 240) % 2 === 0;
      g.getObjectByName('blue')!.visible = siren && !g.getObjectByName('red')!.visible;

      const fireFx = g.getObjectByName('fireFx')!;
      fireFx.visible = j.kind === 'fire' && j.stage !== 'return' && j.stage !== 'walkOut';
      if (fireFx.visible) {
        g.rotation.y = 0;
        const [tw, td] = defOf(target).footprint;
        const fxX = target.x + tw * 0.5 - at.x;
        const fxZ = target.y + td * 0.5 - at.y;
        const baseY = 0.52;
        for (let i = 0; i < 4; i++) {
          const flame = fireFx.getObjectByName(`flame:${i}`)!;
          const ph = this.time / 120 + i * 1.5;
          flame.position.set(
            fxX + Math.cos(ph) * 0.14,
            baseY + Math.abs(Math.sin(ph * 1.3)) * 0.12,
            fxZ + Math.sin(ph) * 0.14,
          );
        }
        for (let i = 0; i < 3; i++) {
          const smoke = fireFx.getObjectByName(`smoke:${i}`)!;
          const age = ((this.time / 450 + i * 0.33) % 1);
          smoke.position.set(fxX + age * 0.15, baseY + 0.18 + age * 0.55, fxZ - age * 0.1);
        }
        const spraying = j.stage === 'park' || j.stage === 'walkIn' || j.stage === 'inside';
        for (let i = 0; i < 8; i++) {
          const water = fireFx.getObjectByName(`water:${i}`)!;
          water.visible = spraying;
          if (spraying) {
            const u = ((this.time / 240 + i / 8) % 1);
            const inv = 1 - u;
            const midX = fxX * 0.5;
            const midZ = fxZ * 0.5;
            const midY = baseY + 0.48;
            water.position.set(
              2 * inv * u * midX + u * u * fxX,
              inv * inv * 0.25 + 2 * inv * u * midY + u * u * baseY,
              2 * inv * u * midZ + u * u * fxZ,
            );
          }
        }
      }
    }
    for (const b of p.buildings) {
      if (b.state === 'construction' || !['hospital', 'police_station', 'fire_station'].includes(b.definitionId)) continue;
      for (let slot = 0; slot < (b.definitionId === 'hospital' ? 2 : 1); slot++) {
        if (s.cityLife?.jobs.some((j) => j.source === b.id && slot === 0)) continue;
        const id = `idle:${b.id}:${slot}`;
        seen.add(id);
        const at = bay(b, slot),
          variant: ActorVariant =
            b.definitionId === 'hospital'
              ? 'ambulance'
              : b.definitionId === 'fire_station'
                ? 'fire'
                : 'patrol',
          g = this.get(
            id,
            variant,
            b.definitionId === 'hospital' ? 0xf5f7f5 : b.definitionId === 'fire_station' ? 0xd62828 : 0x295383,
          );
        g.position.set(at.x, standY(tileAt(p, b.x, b.y)) + 0.015, at.y);
      }
    }
    for (const f of s.cityLife?.flights ?? []) {
      const b = p.buildings.find((b) => b.id === f.airport);
      if (!b) continue;
      const id = `flight:${b.id}`;
      seen.add(id);
      const at = flightPoint(f, b, this.fraction),
        g = this.get(id, 'plane', 0xf5f5ec);
      g.position.set(at.x, standY(tileAt(p, b.x, b.y)) + 0.03 + at.alt / 30, at.y);
      g.rotation.y = at.heading < 0 ? Math.PI : 0;
      g.rotation.z = f.phase === 'takeoff' && at.alt > 2 ? 0.14 : f.phase === 'landing' && at.alt > 2 ? -0.09 : 0;
    }
    for (const [id, g] of this.actors)
      if (!seen.has(id)) {
        g.removeFromParent();
        this.actors.delete(id);
      }
  }
  dispose(): void {
    this.group.clear();
    this.actors.clear();
    this.box.dispose();
    for (const mat of this.paints.values()) mat.dispose();
    this.paints.clear();
  }
}