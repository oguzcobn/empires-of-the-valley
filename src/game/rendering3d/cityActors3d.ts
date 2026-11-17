import * as THREE from 'three';
import type { GameState, Province } from '../core/types';
import { bay, door, validCityJob } from '../systems/cityLife';
import type { CityJobKind } from '../systems/cityLife';
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
  private paints = new Map<number, THREE.MeshBasicMaterial>();

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
      mat = new THREE.MeshBasicMaterial({ color });
      this.paints.set(color, mat);
    }
    const mesh = new THREE.Mesh(this.box, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    g.add(mesh);
    return mesh;
  }

  private buildPerson(): THREE.Group {
    const p = new THREE.Group();
    p.name = 'person';
    p.visible = false;
    this.part(p, 0x353d4a, 0, 0.035, -0.014, 0.024, 0.07, 0.022);
    this.part(p, 0x353d4a, 0, 0.035, 0.014, 0.024, 0.07, 0.022);
    this.part(p, 0xdba357, 0, 0.1, 0, 0.042, 0.075, 0.056);
    this.part(p, 0xf0c9a0, 0, 0.16, 0, 0.038, 0.04, 0.038);
    this.part(p, 0x3a2c22, -0.004, 0.182, 0, 0.04, 0.014, 0.04);
    return p;
  }

  private get(id: string, variant: ActorVariant, paint: number): THREE.Group {
    let g = this.actors.get(id);
    if (g && g.userData.variant === variant) return g;
    if (g) {
      g.removeFromParent();
      this.actors.delete(id);
    }
    g = new THREE.Group();
    g.userData.variant = variant;
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

    g.add(this.buildPerson());
    const red = this.part(g, 0xff2e4c, 0.02, 0.185, -0.036, 0.045, 0.028, 0.045);
    red.name = 'red';
    red.visible = false;
    const blue = this.part(g, 0x2e7bff, 0.02, 0.185, 0.036, 0.045, 0.028, 0.045);
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
        j.kind === 'patrol'
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
      const siren = !reduced && (j.kind === 'patrol' || j.kind === 'ambulance');
      g.getObjectByName('red')!.visible = siren && Math.floor(this.time / 240) % 2 === 0;
      g.getObjectByName('blue')!.visible = siren && !g.getObjectByName('red')!.visible;
    }
    for (const b of p.buildings) {
      if (b.state === 'construction' || !['hospital', 'police_station'].includes(b.definitionId)) continue;
      for (let slot = 0; slot < (b.definitionId === 'hospital' ? 2 : 1); slot++) {
        if (s.cityLife?.jobs.some((j) => j.source === b.id && slot === 0)) continue;
        const id = `idle:${b.id}:${slot}`;
        seen.add(id);
        const at = bay(b, slot),
          variant: ActorVariant = b.definitionId === 'hospital' ? 'ambulance' : 'patrol',
          g = this.get(id, variant, b.definitionId === 'hospital' ? 0xf5f7f5 : 0x295383);
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
