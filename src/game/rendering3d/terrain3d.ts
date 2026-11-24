import * as THREE from 'three';
import type { Province, TerrainId, Tile } from '../core/types';
import { FOREST_TILE_MAX } from '../data/balance';
import { tileAt } from '../systems/grid';
import { COLORS } from '../rendering/palette';
import type { SeasonPalette } from '../rendering/palette';
import { OceanSpectrum, SPECTRUM_SIZE, WATER_INTERVALS, WATER_METRES_PER_TILE } from './ocean';
import { Builder, LEVEL_H, hash2, mixHex, rgb } from './geo';
import { DIRS, lanePoint, opposite, roadNode, tileCentrelines } from './roads3d';
import type { RoadNode } from './roads3d';

const WATER_DEPTH = 0.2;
const WATER_SURFACE = 0.07;
const SKIRT_Y = -0.7;

const isWater = (t?: Tile): boolean => !!t && (t.terrain === 'water' || t.terrain === 'lake');
/** Height of the solid ground of a tile (river and lake beds lie below their banks). */
export const groundY = (t: Tile): number => t.height * LEVEL_H - (isWater(t) ? WATER_DEPTH : 0);
/** Height things stand on: the ground, or the bridge/road deck level over water. */
export const standY = (t?: Tile): number => (t ? t.height * LEVEL_H : 0);

function topColor(t: Tile, x: number, y: number, pal: SeasonPalette): number {
  // the 2D view alternates two greens per tile; in 3D that reads as a chessboard, so soften it
  const grass = mixHex(pal.grass[(t.variant + ((x + y) & 1) * 2) % pal.grass.length]!, pal.grass[0]!, 0.65);
  const h = t.height;
  switch (t.terrain) {
    case 'fertile':
      return pal.fertile;
    case 'sand':
      return pal.sand;
    case 'water':
      return mixHex(pal.sand, 0x4a5a4c, 0.55);
    case 'lake':
      return mixHex(pal.sand, 0x3f4f4a, 0.7);
    case 'stone':
      return mixHex(grass, 0x9a9a8c, 0.25);
    case 'forest':
      return mixHex(grass, 0x2d5a2c, pal.snow ? 0.05 : 0.22);
    case 'hill':
      return mixHex(grass, 0x7a8a4a, pal.snow ? 0 : 0.12 + h * 0.03);
    case 'rocky':
      return pal.snow ? 0xd9dde0 : 0x9d988c;
    case 'mountain':
      return pal.snow || h >= 4 ? 0xe7ebee : 0x8b867b;
    case 'terrace':
      return pal.snow ? 0xe4e8ea : mixHex(pal.fertile, 0xffffff, 0.08);
    default:
      return grass;
  }
}

function cliffColor(terrain: TerrainId): number {
  if (terrain === 'rocky' || terrain === 'mountain' || terrain === 'stone') return COLORS.rockDark;
  if (terrain === 'terrace') return 0xb9b2a4;
  if (terrain === 'sand') return 0xbfa873;
  return COLORS.earth;
}

function buildGround(p: Province, pal: SeasonPalette): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const vert = (x: number, y: number, z: number, n: readonly [number, number, number], c: readonly [number, number, number]): void => {
    pos.push(x, y, z);
    nor.push(n[0], n[1], n[2]);
    col.push(c[0], c[1], c[2]);
  };
  const UP = [0, 1, 0] as const;
  for (let ty = 0; ty < p.height; ty++)
    for (let tx = 0; tx < p.width; tx++) {
      const t = p.tiles[ty * p.width + tx]!;
      const y = groundY(t);
      const base = topColor(t, tx, ty, pal);
      // corner tints are shared between neighbouring tiles, which gives soft mottling for free
      const corner = (cx: number, cz: number): [number, number, number] => rgb(base, 0.9 + hash2(cx, cz, 7) * 0.2);
      const c00 = corner(tx, ty), c01 = corner(tx, ty + 1), c11 = corner(tx + 1, ty + 1), c10 = corner(tx + 1, ty);
      vert(tx, y, ty, UP, c00);
      vert(tx, y, ty + 1, UP, c01);
      vert(tx + 1, y, ty + 1, UP, c11);
      vert(tx, y, ty, UP, c00);
      vert(tx + 1, y, ty + 1, UP, c11);
      vert(tx + 1, y, ty, UP, c10);
      if (t.terrain === 'fertile' || t.terrain === 'terrace') {
        const furrow = rgb(t.terrain === 'terrace' ? mixHex(pal.grass[0]!, 0x000000, 0.1) : pal.furrow);
        for (let i = 0; i < 4; i++) {
          const z0 = ty + 0.1 + i * 0.22;
          const z1 = z0 + 0.07;
          const fy = y + 0.004;
          vert(tx + 0.06, fy, z0, UP, furrow);
          vert(tx + 0.06, fy, z1, UP, furrow);
          vert(tx + 0.94, fy, z1, UP, furrow);
          vert(tx + 0.06, fy, z0, UP, furrow);
          vert(tx + 0.94, fy, z1, UP, furrow);
          vert(tx + 0.94, fy, z0, UP, furrow);
        }
      }
      const cliff = cliffColor(t.terrain);
      DIRS.forEach(([dx, dz], side) => {
        const n = tileAt(p, tx + dx, ty + dz);
        const bottom = n ? groundY(n) : SKIRT_Y;
        if (bottom >= y - 1e-6) return;
        const top = rgb(cliff, side === 0 || side === 1 ? 1 : 0.8);
        const low = rgb(cliff, 0.62);
        // the two top corners of this side (normals are explicit, so winding is irrelevant)
        const ax = side === 0 || side === 3 ? tx + 1 : tx;
        const az = side === 0 || side === 1 ? ty + 1 : ty;
        const bx = side === 0 || side === 1 ? tx + 1 : tx;
        const bz = side === 1 || side === 2 ? ty + 1 : ty;
        // For natural highland/mountain slopes where the lower tile has no building/road/water, flare the base outward into a natural talus slope
        const canFlare =
          n &&
          !n.buildingId &&
          !n.road &&
          !isWater(n) &&
          (t.terrain === 'mountain' || t.terrain === 'rocky' || t.terrain === 'hill');
        const flare = canFlare ? 0.36 : 0;
        const fax = ax + dx * flare;
        const faz = az + dz * flare;
        const fbx = bx + dx * flare;
        const fbz = bz + dz * flare;
        const normal = canFlare ? ([dx * 0.7, 0.7, dz * 0.7] as const) : ([dx, 0, dz] as const);
        vert(ax, y, az, normal, top);
        vert(bx, y, bz, normal, top);
        vert(fbx, bottom, fbz, normal, low);
        vert(ax, y, az, normal, top);
        vert(fbx, bottom, fbz, normal, low);
        vert(fax, bottom, faz, normal, low);
      });
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}

/** Indexed tile patches use the same periodic spectrum on either side of a shared edge. */
function buildWater(p: Province, pal: SeasonPalette) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const levels: number[] = [], phases: number[] = [];
  const n = WATER_INTERVALS;
  for (let ty = 0; ty < p.height; ty++) for (let tx = 0; tx < p.width; tx++) {
    const t = p.tiles[ty * p.width + tx]!;
    if (!isWater(t)) continue;
    const level = t.height * LEVEL_H - WATER_SURFACE;
    const tone = rgb(t.terrain === 'lake' ? mixHex(pal.water, 0x1c4f78, .25) : pal.water);
    const start = levels.length;
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) {
      positions.push(tx + x/n, level, ty + z/n);
      colors.push(...tone);
      levels.push(level);
      phases.push(((ty * n + z) % SPECTRUM_SIZE) * SPECTRUM_SIZE + (tx * n + x) % SPECTRUM_SIZE);
      if (x < n && z < n) {
        const a = start + z * (n + 1) + x, b = a + n + 1;
        indices.push(a, b, b+1, a, b+1, a+1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return { geometry, levels: Float32Array.from(levels), phases: Uint16Array.from(phases) };
}

interface RoadMeshes {
  surface: THREE.BufferGeometry;
  lampHeads: THREE.BufferGeometry;
  lampPools: THREE.BufferGeometry;
}

const ROAD_LIFT = 0.012;

function addBridge(b: Builder, tx: number, ty: number, node: RoadNode, pal: SeasonPalette): void {
  const sides = [0, 1, 2, 3].filter((s) => node.links[s]);
  const axis = sides.length ? sides[0]! % 2 : 0; // 0 = spans along x, 1 = along y
  const y = node.y;
  const cx = tx + 0.5;
  const cz = ty + 0.5;
  const along = (d: number, across: number): [number, number, number] =>
    axis === 0 ? [cx + d, y, cz + across] : [cx + across, y, cz + d];
  // The deck top is exactly the bank level, so the land road runs onto it without a step.
  b.ribbon([along(-0.5, 0), along(0.5, 0)], 0.6, 0xd7c3a0, 0, y - 0.08);
  b.ribbon([along(-0.5, 0), along(0.5, 0)], 0.36, pal.snow ? 0xd8c9a8 : COLORS.road, ROAD_LIFT);
  for (const across of [-0.285, 0.285]) {
    const [px, , pz] = along(0, across);
    b.box(px, y, pz, axis === 0 ? 1 : 0.035, 0.085, axis === 0 ? 0.035 : 1, 0xb7a17e);
    for (const d of [-0.46, -0.15, 0.15, 0.46]) {
      const [qx, , qz] = along(d, across);
      b.box(qx, y, qz, 0.05, 0.11, 0.05, 0xe0ceb1);
    }
  }
  b.box(cx, y - WATER_DEPTH - 0.05, cz, axis === 0 ? 0.16 : 0.5, WATER_DEPTH - 0.03, axis === 0 ? 0.5 : 0.16, 0x7d705c);
  // a short apron where the span meets the bank hides any seam with the land road
  for (const s of sides) {
    const [dx, dz] = DIRS[s]!;
    b.box(cx + dx * 0.49, y - 0.08, cz + dz * 0.49, dx ? 0.04 : 0.66, 0.08 + ROAD_LIFT / 2, dz ? 0.04 : 0.66, 0x90816a);
  }
}

function buildRoads(p: Province, pal: SeasonPalette): RoadMeshes {
  const b = new Builder();
  const heads = new Builder();
  const pools = new Builder();
  const dirt = pal.snow ? 0xd8c9a8 : COLORS.road;
  for (let ty = 0; ty < p.height; ty++)
    for (let tx = 0; tx < p.width; tx++) {
      const node = roadNode(p, tx, ty);
      if (!node) continue;
      const t = p.tiles[ty * p.width + tx]!;
      if (node.kind === 'bridge') {
        addBridge(b, tx, ty, node, pal);
        continue;
      }
      const cx = tx + 0.5;
      const cz = ty + 0.5;
      if (node.kind === 'tunnel') {
        node.links.forEach((on, s) => {
          if (!on) return;
          const [dx, dz] = DIRS[s]!;
          const n = tileAt(p, tx + dx, ty + dz)!;
          const py = Math.min(n.height, t.height) * LEVEL_H;
          b.box(cx + dx * 0.5, py, cz + dz * 0.5, dx ? 0.06 : 0.5, 0.36, dz ? 0.06 : 0.5, 0xb9b2a4);
          b.box(cx + dx * 0.52, py, cz + dz * 0.52, dx ? 0.06 : 0.36, 0.28, dz ? 0.06 : 0.36, 0x1f1c19);
        });
        continue;
      }
      const lines = tileCentrelines(tx, ty, node);
      const ramp = node.edgeY.some((e) => e > node.y + 1e-6);
      const skirt = ramp ? node.y : undefined;
      const sides = [0, 1, 2, 3].filter((s) => node.links[s]);
      const layer = (width: number, color: number, lift: number): void => {
        for (const line of lines) b.ribbon(line, width, color, lift, skirt);
        if (sides.length >= 3) b.quad(cx - width / 2, cz - width / 2, cx + width / 2, cz + width / 2, node.y + lift, color);
      };
      if (node.kind === 'paved') {
        layer(0.92, 0xaeb6b5, ROAD_LIFT);
        layer(0.6, 0x353e49, ROAD_LIFT + 0.008);
        if (sides.length === 2) {
          for (const [a, c] of [[0.08, 0.36], [0.58, 0.86]] as const) {
            const dash: [number, number, number][] = [];
            for (let i = 0; i <= 3; i++) {
              const q = lanePoint(tx, ty, node, sides[0]!, sides[1]!, a + ((c - a) * i) / 3);
              dash.push([q.x, q.y, q.z]);
            }
            b.ribbon(dash, 0.035, 0xf0db86, ROAD_LIFT + 0.014);
          }
          const straight = sides[0] === opposite(sides[1]!);
          if (straight && (tx + ty) % 2 === 0) {
            // street lamp on the right-hand kerb, with its arm over the carriageway
            const [dx, dz] = DIRS[sides[0]!]!;
            const sx = cx - dz * 0.41;
            const sz = cz + dx * 0.41;
            b.cyl(sx, node.y, sz, 0.012, 0.016, 0.46, 0x4a5258, 6);
            b.box(sx + dz * 0.07, node.y + 0.45, sz - dx * 0.07, dz ? 0.16 : 0.02, 0.015, dx ? 0.16 : 0.02, 0x4a5258);
            heads.box(sx + dz * 0.14, node.y + 0.432, sz - dx * 0.14, 0.06, 0.02, 0.06, 0xffffff);
            pools.cyl(cx - dz * 0.12, node.y + ROAD_LIFT + 0.02, cz + dx * 0.12, 0.42, 0.42, 0.001, 0xffffff, 14);
          }
        } else if (sides.length >= 3) {
          for (const s of sides) {
            const [dx, dz] = DIRS[s]!;
            b.ribbon(
              [[cx + dx * 0.33, node.y, cz + dz * 0.33], [cx + dx * 0.37, node.y, cz + dz * 0.37]],
              0.5,
              0xe8edf0,
              ROAD_LIFT + 0.014,
            );
          }
        }
      } else {
        const color = node.kind === 'stairs' ? 0xc2bcae : node.kind === 'mountain' ? 0xb3ad9f : dirt;
        layer(0.36, color, ROAD_LIFT);
        if (node.kind === 'stairs') {
          // treads across the ramp
          node.links.forEach((on, s) => {
            if (!on || node.edgeY[s]! <= node.y + 1e-6) return;
            const [dx, dz] = DIRS[s]!;
            for (let i = 1; i <= 4; i++) {
              const f = i / 5;
              const sy = node.y + (node.edgeY[s]! - node.y) * f;
              b.box(cx + dx * 0.5 * f, sy, cz + dz * 0.5 * f, dx ? 0.03 : 0.38, 0.03, dz ? 0.03 : 0.38, 0x8f897d);
            }
          });
        }
      }
    }
  return { surface: b.build(), lampHeads: heads.build(), lampPools: pools.build() };
}

function treeGeometries(): { trunk: THREE.BufferGeometry; broad: THREE.BufferGeometry; pine: THREE.BufferGeometry; rock: THREE.BufferGeometry; bush: THREE.BufferGeometry; peak: THREE.BufferGeometry } {
  const trunk = new Builder().cyl(0, 0, 0, 0.035, 0.05, 0.3, COLORS.trunk, 6).build();
  const broad = new Builder()
    .sphere(0, 0.44, 0, 0.21, 0xffffff, 0.95, 8)
    .sphere(0.1, 0.36, 0.06, 0.15, 0xe6e6e6, 0.9, 7)
    .sphere(-0.09, 0.38, -0.07, 0.15, 0xf2f2f2, 0.9, 7)
    .sphere(0.02, 0.57, -0.02, 0.14, 0xffffff, 0.9, 7)
    .build();
  const pine = new Builder()
    .cone(0, 0.2, 0, 0.2, 0.3, 0xe2e2e2, 8)
    .cone(0, 0.36, 0, 0.155, 0.28, 0xf0f0f0, 8)
    .cone(0, 0.52, 0, 0.105, 0.26, 0xffffff, 8)
    .build();
  const rock = new Builder()
    .sphere(0, 0.06, 0, 0.13, 0xffffff, 0.75, 6)
    .sphere(0.13, 0.04, 0.06, 0.085, 0xdcdcdc, 0.8, 5)
    .sphere(-0.1, 0.035, 0.1, 0.07, 0xe8e8e8, 0.8, 5)
    .build();
  const bush = new Builder().sphere(0, 0.05, 0, 0.09, 0xffffff, 0.75, 6).sphere(0.07, 0.04, 0.03, 0.06, 0xe4e4e4, 0.8, 5).build();
  // Broad, overlapping multi-faceted mountain massif that hides tile seams and creates organic ridges
  const peak = new Builder()
    .cone(0, -0.12, 0, 0.76, 0.98, 0xffffff, 6)
    .cone(0.28, -0.1, 0.2, 0.52, 0.66, 0xe2e6ea, 5)
    .cone(-0.3, -0.1, -0.16, 0.48, 0.6, 0xecf0f2, 5)
    .cone(0.12, -0.08, -0.28, 0.42, 0.52, 0xd8dde2, 5)
    .cone(0, 0.48, 0, 0.31, 0.42, 0xf8fafc, 6)
    .build();
  return { trunk, broad, pine, rock, bush, peak };
}

const MAX_TREES = 4096;
const MAX_SMALL = 2048;

/** Static world: ground, water, roads, street lamps and the instanced trees, rocks and bushes. */
export class Terrain3D {
  readonly group = new THREE.Group();
  private groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .94 });
  private roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .94 });
  private waterMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    roughness: .15,
    ior: 1.333,
    metalness: 0,
    depthWrite: false,
  });
  private lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3f44 });
  private poolMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .87 });
  private ground = new THREE.Mesh(new THREE.BufferGeometry(), this.groundMat);
  private water = new THREE.Mesh(new THREE.BufferGeometry(), this.waterMat);
  private roads = new THREE.Mesh(new THREE.BufferGeometry(), this.roadMat);
  private lampHeads = new THREE.Mesh(new THREE.BufferGeometry(), this.lampMat);
  private lampPools = new THREE.Mesh(new THREE.BufferGeometry(), this.poolMat);
  private geos = treeGeometries();
  private trunks = new THREE.InstancedMesh(this.geos.trunk, this.propMat, MAX_TREES);
  private broads = new THREE.InstancedMesh(this.geos.broad, this.propMat, MAX_TREES);
  private pines = new THREE.InstancedMesh(this.geos.pine, this.propMat, MAX_TREES);
  private rocks = new THREE.InstancedMesh(this.geos.rock, this.propMat, MAX_SMALL);
  private bushes = new THREE.InstancedMesh(this.geos.bush, this.propMat, MAX_SMALL);
  private peaks = new THREE.InstancedMesh(this.geos.peak, this.propMat, MAX_SMALL);
  private readonly spectrum = new OceanSpectrum();
  private waterLevels = new Float32Array(0);
  private waterPhases = new Uint16Array(0);
  private waterTime = 0;
  private lastWaterUpdate = 0;

  private applyWaveField(): void {
    const positions = this.water.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = this.water.geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < this.waterPhases.length; i++) {
      const phase = this.waterPhases[i]!;
      positions.setY(i, this.waterLevels[i]! + this.spectrum.heights[phase]! / WATER_METRES_PER_TILE);
      normals.setXYZ(i, this.spectrum.normals[phase * 3]!, this.spectrum.normals[phase * 3 + 1]!, this.spectrum.normals[phase * 3 + 2]!);
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
  }

  constructor() {
    this.ground.receiveShadow = true;
    this.roads.receiveShadow = true;
    this.roads.castShadow = true;
    this.water.receiveShadow = true;
    this.lampPools.renderOrder = 2;
    for (const m of [this.trunks, this.broads, this.pines, this.rocks, this.bushes, this.peaks]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
    }
    this.group.add(this.ground, this.water, this.roads, this.lampHeads, this.lampPools, this.trunks, this.broads, this.pines, this.rocks, this.bushes, this.peaks);
  }

  private swap(mesh: THREE.Mesh, geo: THREE.BufferGeometry): void {
    mesh.geometry.dispose();
    mesh.geometry = geo;
  }

  syncGround(p: Province, pal: SeasonPalette): void {
    this.swap(this.ground, buildGround(p, pal));
    const water = buildWater(p, pal);
    this.swap(this.water, water.geometry);
    this.waterPhases = water.phases;
    this.waterLevels = water.levels;
    this.applyWaveField();
    const roads = buildRoads(p, pal);
    this.swap(this.roads, roads.surface);
    this.swap(this.lampHeads, roads.lampHeads);
    this.swap(this.lampPools, roads.lampPools);
  }

  syncProps(p: Province, pal: SeasonPalette): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    let trees = 0, broads = 0, pines = 0, rocks = 0, bushes = 0, peaks = 0;
    const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, scale: number, yaw: number, hex: number, shade: number): void => {
      q.setFromAxisAngle(up, yaw);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
      mesh.setMatrixAt(i, m);
      color.setHex(hex).multiplyScalar(shade);
      mesh.setColorAt(i, color);
    };
    for (let ty = 0; ty < p.height; ty++)
      for (let tx = 0; tx < p.width; tx++) {
        const t = p.tiles[ty * p.width + tx]!;
        if (t.buildingId || t.road) continue;
        const y = groundY(t);
        if (t.terrain === 'forest') {
          const bucket = t.deposit >= FOREST_TILE_MAX * 0.6 ? 3 : t.deposit >= FOREST_TILE_MAX * 0.2 ? 2 : t.deposit > 0 ? 1 : 0;
          const spots: [number, number, number][] = [
            [0.3 + hash2(tx, ty, 1) * 0.12, 0.34 + hash2(tx, ty, 2) * 0.14, 1],
            [0.68 + hash2(tx, ty, 3) * 0.1, 0.66 + hash2(tx, ty, 4) * 0.12, 0.84],
            [0.72 + hash2(tx, ty, 5) * 0.1, 0.22 + hash2(tx, ty, 6) * 0.1, 0.7],
          ];
          spots.forEach(([sx, sz, s], n) => {
            const standing = bucket === 3 || (bucket === 2 && n !== 1) || (bucket === 1 && n === 1);
            if (!standing || trees >= MAX_TREES) return;
            const scale = (bucket === 1 ? 0.7 : s) * (1.25 + hash2(tx + n, ty, 9) * 0.5);
            const yaw = hash2(tx, ty + n, 11) * Math.PI * 2;
            const shadeBy = 0.85 + hash2(tx + n, ty + n, 13) * 0.3;
            place(this.trunks, trees++, tx + sx, y, ty + sz, scale, yaw, 0xffffff, 1);
            if (hash2(tx + n * 3, ty, 17) < 0.3) place(this.pines, pines++, tx + sx, y, ty + sz, scale, yaw, pal.pine, shadeBy);
            else place(this.broads, broads++, tx + sx, y, ty + sz, scale, yaw, pal.leaf[(t.variant + n + tx) % pal.leaf.length]!, shadeBy);
          });
        } else if (t.terrain === 'stone') {
          if (rocks < MAX_SMALL) place(this.rocks, rocks++, tx + 0.5, y, ty + 0.5, t.deposit > 0 ? 1.5 : 0.8, hash2(tx, ty, 19) * 6.28, pal.snow ? 0xd5dadd : COLORS.rock, 0.9 + hash2(tx, ty, 23) * 0.2);
        } else if (t.terrain === 'mountain') {
          const snowy = pal.snow || t.height >= 4;
          if (peaks < MAX_SMALL) place(this.peaks, peaks++, tx + 0.5, y, ty + 0.5, 0.88 + t.height * 0.18 + hash2(tx, ty, 51) * 0.28, hash2(tx, ty, 53) * 6.28, snowy ? 0xeef1f3 : 0x8b867b, 0.88 + hash2(tx, ty, 57) * 0.2);
        } else if (t.terrain === 'rocky') {
          if (rocks < MAX_SMALL && hash2(tx, ty, 59) < 0.6) place(this.rocks, rocks++, tx + 0.3 + hash2(tx, ty, 61) * 0.4, y, ty + 0.3 + hash2(tx, ty, 67) * 0.4, 1.1 + hash2(tx, ty, 71), hash2(tx, ty, 19) * 6.28, pal.snow ? 0xd5dadd : 0x8f8a7e, 1);
        } else if ((t.terrain === 'grass' || t.terrain === 'hill') && hash2(tx, ty, 29) < 0.16) {
          const leaf = pal.snow ? 0xcfd8d2 : mixHex(pal.leaf[0]!, pal.pine, hash2(tx, ty, 31));
          if (bushes < MAX_SMALL) place(this.bushes, bushes++, tx + 0.2 + hash2(tx, ty, 37) * 0.6, y, ty + 0.2 + hash2(tx, ty, 41) * 0.6, 0.9 + hash2(tx, ty, 43) * 0.9, hash2(tx, ty, 47) * 6.28, leaf, 1);
        }
      }
    const finish = (mesh: THREE.InstancedMesh, count: number): void => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    finish(this.trunks, trees);
    finish(this.broads, broads);
    finish(this.pines, pines);
    finish(this.rocks, rocks);
    finish(this.bushes, bushes);
    finish(this.peaks, peaks);
  }

  get propCount(): number {
    return this.trunks.count + this.rocks.count + this.bushes.count;
  }

  setShadows(on: boolean): void {
    for (const m of [this.trunks, this.broads, this.pines, this.rocks, this.bushes, this.peaks, this.roads]) m.castShadow = on;
  }

  /** Night lighting of the street lamps and a slow swell on the water. */
  update(night: number, dt: number, motion: boolean): void {
    this.lampMat.color.setHex(mixHex(0x3a3f44, 0xffe2a8, Math.min(1, night * 1.4)));
    this.poolMat.opacity = night * 0.1;
    this.lampPools.visible = night > 0.02;
    if (!motion || this.waterPhases.length === 0) return;
    this.waterTime += dt / 1000;
    if (this.waterTime - this.lastWaterUpdate >= 1 / 20) {
      this.spectrum.update(this.waterTime);
      this.applyWaveField();
      this.lastWaterUpdate = this.waterTime;
    }
  }

  dispose(): void {
    for (const mesh of [this.ground, this.water, this.roads, this.lampHeads, this.lampPools]) mesh.geometry.dispose();
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of [this.groundMat, this.roadMat, this.waterMat, this.lampMat, this.poolMat, this.propMat]) m.dispose();
    for (const m of [this.trunks, this.broads, this.pines, this.rocks, this.bushes, this.peaks]) m.dispose();
  }
}