import * as THREE from 'three';
import { TICK_MS } from '../core/clock';
import type { GameState, Province, SurprisePoint } from '../core/types';
import { DEFENSE_THRESHOLD, surpriseTimeline } from '../systems/citySurprises';
import { tileAt } from '../systems/grid';
import { Builder, LEVEL_H } from './geo';

const clamp = (x: number) => THREE.MathUtils.clamp(x, 0, 1);

function routeAt(out: THREE.Vector3, p: Province, route: SurprisePoint[], f: number): void {
  const index = clamp(f) * (route.length - 1);
  const first = Math.floor(index),
    alpha = index - first;
  const a = route[first]!,
    b = route[Math.min(first + 1, route.length - 1)]!;
  const yA = (tileAt(p, ...a)?.height ?? 0) * LEVEL_H;
  const yB = (tileAt(p, ...b)?.height ?? 0) * LEVEL_H;
  out.set(
    0.5 + THREE.MathUtils.lerp(a[0], b[0], alpha),
    THREE.MathUtils.lerp(yA, yB, alpha),
    0.5 + THREE.MathUtils.lerp(a[1], b[1], alpha),
  );
}

function saucer(): THREE.BufferGeometry {
  const ship = new Builder()
    .sphere(0, 0, 0, 0.81, 0x59696c, 0.17, 24)
    .cyl(0, -0.035, 0, 0.79, 0.76, 0.055, 0xb9c6c4, 32)
    .dome(0, 0.1, 0, 0.39, 0x69b3b1, 0.7);
  for (let i = 0; i < 15; i++) {
    const a = (2 * Math.PI * i) / 15;
    ship.sphere(0.75 * Math.cos(a), 0.018, 0.75 * Math.sin(a), 0.046, 0xacffe3, 0.5, 6);
  }
  return ship.build();
}

function corsair(): THREE.BufferGeometry {
  const ship = new Builder();
  // Narrow sections at the stem and stern give the hull a flared bilge and raised ends.
  for (let i = 0; i < 19; i++) {
    const t = (i + 0.5) / 19;
    const beam = Math.pow(Math.sin(t * Math.PI), 0.55) * 0.82;
    const sheer = (2 * t - 1) ** 4 * 0.13;
    ship.box((t - 0.5) * 2.9, -0.15, 0, 0.155, 0.23 + sheer, beam * 0.78, 0x583927);
    ship.box((t - 0.5) * 2.9, 0.06 + sheer, 0, 0.155, 0.15, beam, 0x865d39);
    ship.box((t - 0.5) * 2.9, 0.2 + sheer, 0, 0.155, 0.03, beam * 0.96, 0xb48e61);
  }
  for (const [x, h] of [
    [-0.86, 0.94],
    [-0.02, 1.52],
    [0.79, 1.13],
  ] as const) {
    ship.cyl(x, 0.2, 0, 0.017, 0.035, h, 0x714d2e, 8);
    for (const ratio of [0.53, 0.84]) {
      const y = 0.2 + h * ratio;
      const half = ratio > 0.7 ? 0.31 : 0.45;
      ship.box(x, y, 0, 0.035, 0.035, half * 2.2, 0x564330);
      // Curved canvas assembled along its span; each panel bows forward under wind.
      for (let j = -3; j <= 3; j++) {
        const span = j / 3;
        ship.box(
          x + 0.09 * (1 - span * span),
          y - h * 0.26,
          span * half * 0.85,
          0.035,
          h * 0.26,
          half * 0.3,
          0xd9c9a8,
        );
      }
    }
  }
  ship.box(-0.18, 1.62, 0, 0.34, 0.16, 0.018, 0x28292b);
  return ship.build();
}

function figure(alien: boolean, enemy: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const coat = alien ? 0x80a579 : enemy ? 0x703b33 : 0x384d57;
  b.cyl(0, 0.12, 0, 0.066, 0.058, 0.135, coat, 8)
    .sphere(0, 0.29, 0, alien ? 0.088 : 0.061, alien ? 0x90ad78 : 0xc18e67, alien ? 1.18 : 1.1, 10)
    .box(-0.033, 0, 0, 0.041, 0.13, 0.047, 0x343b36)
    .box(0.033, 0, 0, 0.041, 0.13, 0.047, 0x343b36);
  for (const side of [-1, 1]) b.box(side * 0.069, 0.13, 0.013, 0.028, 0.099, 0.032, coat);
  if (alien) {
    for (const side of [-1, 1]) b.sphere(side * 0.036, 0.3, 0.069, 0.022, 0x172628, 1.5, 8);
  } else {
    b.cyl(0, 0.319, 0, 0.069, 0.076, 0.037, enemy ? 0x392f2b : 0x555a4e, enemy ? 3 : 8).box(
      0.057,
      0.173,
      0.079,
      0.023,
      0.025,
      0.16,
      0x464341,
    );
  }
  return b.build();
}

/** Pure presentation. The simulation owns routes, casualties and building damage. */
export class SurpriseActors {
  readonly group = new THREE.Group();
  private vessel: THREE.Mesh | null = null;
  private beam: THREE.Mesh | null = null;
  private alien: THREE.Mesh | null = null;
  private crew: THREE.Mesh[] = [];
  private flashes: THREE.Mesh[] = [];
  private kind = '';
  private lastTick = -1;
  private fraction = 0;
  private clock = 0;
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly destination = new THREE.Vector3();

  private make(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material instanceof THREE.MeshStandardMaterial;
    mesh.receiveShadow = mesh.castShadow;
    this.group.add(mesh);
    return mesh;
  }

  private create(kind: 'pirates' | 'ufo'): void {
    this.dispose();
    this.kind = kind;
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    if (kind === 'ufo') {
      this.vessel = this.make(
        saucer(),
        new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.65, roughness: 0.27 }),
      );
      this.alien = this.make(figure(true, false), solid);
      this.beam = this.make(
        new THREE.CylinderGeometry(0.16, 0.36, 1, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x68ffd3,
          opacity: 0.22,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
    } else {
      this.vessel = this.make(corsair(), solid);
      const enemies = figure(false, true),
        defenders = figure(false, false);
      const flare = new THREE.IcosahedronGeometry(0.041, 0);
      const glow = new THREE.MeshBasicMaterial({ color: 0xffbd62, toneMapped: false });
      for (let i = 0; i < 16; i++) {
        this.crew.push(this.make(i < 8 ? enemies : defenders, solid));
        this.flashes.push(this.make(flare, glow));
      }
    }
  }

  update(game: GameState, p: Province, dt: number, reduced: boolean): void {
    const e = game.surprise;
    this.group.visible = !!e;
    if (!e || !e.walk.length || !e.approach.length) return;
    if (this.kind !== e.kind) this.create(e.kind);
    if (this.lastTick !== game.tick) {
      this.lastTick = game.tick;
      this.fraction = 0;
    }
    if (game.speed && !reduced) {
      this.fraction = Math.min(1, this.fraction + (dt * game.speed) / TICK_MS);
      this.clock += dt / 1000;
    }
    const age = game.tick - e.startedAt + this.fraction;
    const { landing, confrontation, resolution, boarding, departure } = surpriseTimeline(e);
    const approach =
      age < landing ? clamp(age / landing) : 1 - clamp((age - boarding) / (departure - boarding));
    const vessel = this.vessel!;
    routeAt(vessel.position, p, e.approach, approach);

    if (e.kind === 'ufo') {
      const altitude =
        THREE.MathUtils.lerp(4.2, 1.38, approach) + (reduced ? 0 : 0.035 * Math.sin(this.clock * 2));
      vessel.position.y += altitude;
      vessel.rotation.y = this.clock * 0.17;
      const beam = this.beam!,
        alien = this.alien!;
      beam.visible =
        (age >= landing - 0.6 && age < landing + 2.5) || (age >= boarding - 2 && age < boarding + 0.4);
      beam.position.copy(vessel.position);
      beam.position.y -= altitude * 0.5;
      beam.scale.y = altitude;
      alien.visible = age >= landing && age < boarding;
      if (!alien.visible) return;
      const travel =
        age < confrontation
          ? clamp((age - landing - 2) / (confrontation - landing - 2))
          : 1 - clamp((age - resolution) / (boarding - resolution - 2));
      routeAt(alien.position, p, e.walk, travel);
      alien.position.y +=
        altitude * Math.max(1 - clamp((age - landing) / 2), clamp((age - boarding + 2) / 2));
      if (!reduced && travel > 0 && travel < 1)
        alien.position.y += 0.018 * Math.abs(Math.sin(this.clock * 6));
      routeAt(this.p0, p, e.walk, travel + 0.01);
      routeAt(this.p1, p, e.walk, travel - 0.01);
      alien.rotation.y =
        Math.atan2(this.p0.x - this.p1.x, this.p0.z - this.p1.z) + (age >= resolution ? Math.PI : 0);
      return;
    }

    routeAt(this.p0, p, e.approach, approach + 0.02);
    routeAt(this.p1, p, e.approach, approach - 0.02);
    vessel.rotation.y =
      Math.atan2(this.p1.z - this.p0.z, this.p0.x - this.p1.x) + (age >= boarding ? Math.PI : 0);
    vessel.position.y += -0.08 + (reduced ? 0 : 0.015 * Math.sin(this.clock * 1.6));
    vessel.rotation.z = reduced ? 0 : 0.012 * Math.sin(this.clock * 1.6);
    const fighting = age >= confrontation && age < resolution;
    const progress = clamp((age - confrontation) / (resolution - confrontation));
    const defenders = e.defenders ?? game.militia ?? 0;
    const win = e.outcome ? e.outcome === 'repelled' : defenders > DEFENSE_THRESHOLD;
    const forces = Math.min(8, Math.ceil(defenders / 13));
    const travel =
      age < resolution
        ? clamp((age - landing - 1) / (confrontation - landing - 1))
        : 1 - clamp((age - resolution) / (boarding - resolution - 1));
    routeAt(this.destination, p, e.walk, 1);
    routeAt(this.p0, p, e.walk, travel);
    routeAt(
      this.p1,
      p,
      e.defense.length ? e.defense : e.walk,
      clamp((age - landing) / (confrontation - landing)),
    );
    for (let i = 0; i < 16; i++) {
      const mesh = this.crew[i]!,
        flash = this.flashes[i]!,
        enemy = i < 8,
        j = i % 8;
      mesh.visible = age >= landing + (enemy ? j * 0.17 : 0) && age < boarding && (enemy || j < forces);
      flash.visible = false;
      if (!mesh.visible) continue;
      const falling = enemy ? (win ? 5 : Math.min(2, forces)) : Math.min(forces, win ? 1 : 4);
      const down = j < falling && progress >= 0.24 + j * 0.12 + (enemy ? 0 : 0.08);
      mesh.position.copy(down ? this.destination : enemy ? this.p0 : this.p1);
      mesh.position.x += ((j % 4) - 1.5) * 0.13;
      mesh.position.z += (enemy ? -1 : 1) * (0.2 + Math.floor(j / 4) * 0.13);
      mesh.rotation.x = down ? Math.PI * 0.48 : 0;
      mesh.rotation.y = enemy ? 0 : Math.PI;
      if (!down && !fighting && !reduced && travel > 0 && travel < 1)
        mesh.position.y += 0.014 * Math.abs(Math.sin(this.clock * 6 + j));
      flash.visible =
        fighting && !down && !reduced && (this.clock + j * 0.229 + (enemy ? 0.15 : 0.03)) % 1.19 < 0.088;
      if (flash.visible) {
        flash.position.copy(mesh.position);
        flash.position.set(
          mesh.position.x + (enemy ? 0.057 : -0.057),
          mesh.position.y + 0.18,
          mesh.position.z + (enemy ? 0.17 : -0.17),
        );
      }
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    for (const child of this.group.children)
      if (child instanceof THREE.Mesh) {
        geometries.add(child.geometry);
        materials.add(child.material as THREE.Material);
      }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.group.clear();
    this.vessel = this.alien = this.beam = null;
    this.crew = [];
    this.flashes = [];
    this.kind = '';
  }
}
