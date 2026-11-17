import * as THREE from 'three';
import type { GameState, Province } from '../core/types';
import { bay, door, validCityJob } from '../systems/cityLife';
import { flightPoint } from '../rendering/cityScenes';
import { standY } from './terrain3d';
import { tileAt } from '../systems/grid';

export class CityActors3D {
  readonly group = new THREE.Group();
  private actors = new Map<string, THREE.Group>();
  private tick = -1;
  private fraction = 0;
  private time = 0;
  private box = new THREE.BoxGeometry(1, 1, 1);
  private paints = new Map<number, THREE.MeshBasicMaterial>();
  private part(
    g: THREE.Group,
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
  private get(id: string, color: number, plane = false): THREE.Group {
    let g = this.actors.get(id);
    if (g) return g;
    g = new THREE.Group();
    this.actors.set(id, g);
    this.group.add(g);
    this.part(g, color, 0, 0.08, 0, plane ? 0.8 : 0.32, 0.12, 0.17);
    this.part(g, plane ? 0xf7f3e8 : 0x44768c, 0, 0.16, 0, plane ? 0.18 : 0.16, 0.08, plane ? 1 : 0.15);
    const person = this.part(g, 0xdba357, 0, 0.13, 0, 0.07, 0.26, 0.07);
    person.name = 'person';
    person.visible = false;
    const red = this.part(g, 0xff334e, -0.04, 0.23, 0, 0.06, 0.035, 0.06);
    red.name = 'red';
    red.visible = false;
    const blue = this.part(g, 0x367eff, 0.04, 0.23, 0, 0.06, 0.035, 0.06);
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
      const at = moving
        ? { x: a.x + (b.x - a.x) * this.fraction, y: a.y + (b.y - a.y) * this.fraction }
        : j.path.at(-1)!;
      const id = `job:${j.id}`;
      seen.add(id);
      const g = this.get(
        id,
        j.kind === 'patrol'
          ? 0x295383
          : j.kind === 'ambulance'
            ? 0xf5f7f5
            : j.kind === 'delivery'
              ? 0xb98749
              : 0x619b98,
      );
      g.position.set(at.x, standY(tileAt(p, Math.floor(at.x), Math.floor(at.y))) + 0.02, at.y);
      g.rotation.y = moving ? -Math.atan2(b.y - a.y, b.x - a.x) : 0;
      const person = g.getObjectByName('person')!;
      person.visible = ['walkIn', 'walkOut'].includes(j.stage);
      if (person.visible) {
        g.rotation.y = 0;
        const park = j.path.at(-1)!,
          entry = door(target),
          t = j.stage === 'walkOut' ? 1 - this.fraction : this.fraction;
        person.position.set(
          park.x + (entry.x - park.x) * t - at.x,
          0.13,
          park.y + (entry.y - park.y) * t - at.y,
        );
      }
      const siren = !reduced && (j.kind === 'patrol' || j.kind === 'ambulance');
      g.getObjectByName('red')!.visible = siren && Math.floor(this.time / 280) % 2 === 0;
      g.getObjectByName('blue')!.visible = siren && !g.getObjectByName('red')!.visible;
    }
    for (const b of p.buildings) {
      if (b.state === 'construction' || !['hospital', 'police_station'].includes(b.definitionId)) continue;
      for (let slot = 0; slot < (b.definitionId === 'hospital' ? 2 : 1); slot++) {
        if (s.cityLife?.jobs.some((j) => j.source === b.id && slot === 0)) continue;
        const id = `idle:${b.id}:${slot}`;
        seen.add(id);
        const at = bay(b, slot),
          g = this.get(id, b.definitionId === 'hospital' ? 0xf5f7f5 : 0x295383);
        g.position.set(at.x, standY(tileAt(p, b.x, b.y)) + 0.02, at.y);
      }
    }
    for (const f of s.cityLife?.flights ?? []) {
      const b = p.buildings.find((b) => b.id === f.airport);
      if (!b) continue;
      const id = `flight:${b.id}`;
      seen.add(id);
      const at = flightPoint(f, b, this.fraction),
        g = this.get(id, 0xf5f5ec, true);
      g.position.set(at.x, standY(tileAt(p, b.x, b.y)) + 0.04 + at.alt / 32, at.y);
      g.rotation.y = at.heading < 0 ? Math.PI : 0;
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
