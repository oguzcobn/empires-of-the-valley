import { CITY_BUILDINGS, LETTERS } from '../rendering/arch/cityBuildings';
import type * as THREE from 'three';
import type { ArchitectureStyle, BuildingId, BuildingLook, RoofType } from '../core/types';
import { BUILDINGS } from '../data/buildings';
import { CULTURES } from '../data/architecture';
import { renderLook } from '../systems/architecture';
import { ROOF_HEX, STONE, wallBase } from '../rendering/arch/kit';
import { COLORS } from '../rendering/palette';
import { Builder, hash2, mixHex } from './geo';

export interface ModelRef {
  definitionId: BuildingId;
  style: ArchitectureStyle;
  look: BuildingLook | null;
  level: number;
}

export interface BuildingModel {
  /** Walls, roofs and props (lit by the sun). */
  body: THREE.BufferGeometry;
  /** Window panes, lamps and signs that glow at night. */
  lit: THREE.BufferGeometry;
  height: number;
}

/** Height of one storey in world units (a tile is 1 unit wide). */
const FH = 0.3;
const GLASS = 0x5b7a8c;
const DOOR = 0x5a3b22;

interface Ctx {
  b: Builder;
  lit: Builder;
  seed: number;
  look: BuildingLook;
  wall: number;
  roof: number;
  trim: number;
  flag: number;
}

/** Window panes on all four faces of a box, plus a door on the +z face (which faces the camera). */
function openings(c: Ctx, x0: number, z0: number, x1: number, z1: number, y0: number, floors: number, door = true, fh = FH): void {
  const pane = (x: number, y: number, z: number, alongX: boolean, w = 0.1, h = fh * 0.42): void => {
    c.lit.box(x, y, z, alongX ? w : 0.018, h, alongX ? 0.018 : w, GLASS);
    c.b.box(x, y - 0.012, z, alongX ? w + 0.03 : 0.022, 0.012, alongX ? 0.022 : w + 0.03, c.trim);
  };
  const lx = x1 - x0;
  const lz = z1 - z0;
  const nx = Math.max(1, Math.floor(lx / 0.3));
  const nz = Math.max(1, Math.floor(lz / 0.3));
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh + fh * 0.36;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (lx * (i + 0.5)) / nx;
      const isDoor = door && f === 0 && i === Math.floor(nx / 2);
      if (isDoor) c.b.box(x, y0, z1 + 0.004, 0.12, fh * 0.7, 0.02, DOOR);
      else pane(x, y, z1 + 0.002, true);
      pane(x, y, z0 - 0.002, true);
    }
    for (let i = 0; i < nz; i++) {
      const z = z0 + (lz * (i + 0.5)) / nz;
      pane(x1 + 0.002, y, z, false);
      pane(x0 - 0.002, y, z, false);
    }
  }
}

function roofOn(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, type: RoofType, hex = c.roof, pitch = 1): number {
  const o = 0.045;
  const lx = x1 - x0;
  const lz = z1 - z0;
  const alongX = lx >= lz;
  const span = Math.min(lx, lz);
  const h = span * 0.42 * pitch;
  switch (type) {
    case 'flat':
      c.b.block(x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, y, y + 0.05, mixHex(hex, 0x777777, 0.4));
      c.b.block(x0 + 0.04, z0 + 0.04, x1 - 0.04, z1 - 0.04, y + 0.05, y + 0.052, mixHex(hex, 0x555555, 0.5));
      return 0.05;
    case 'dome':
      c.b.block(x0 - 0.02, z0 - 0.02, x1 + 0.02, z1 + 0.02, y, y + 0.04, c.trim);
      c.b.dome((x0 + x1) / 2, y + 0.04, (z0 + z1) / 2, span * 0.46, hex, 0.85);
      return 0.04 + span * 0.4;
    case 'pyramid':
    case 'hip':
      c.b.pyramid(x0 - o, z0 - o, x1 + o, z1 + o, y, h * (type === 'hip' ? 0.85 : 1.25), hex);
      return h * (type === 'hip' ? 0.85 : 1.25);
    case 'crow_step': {
      c.b.gable(x0, z0 - (alongX ? o : 0), x1, z1 + (alongX ? o : 0), y, h, hex, alongX, c.wall);
      // stepped gable ends rising above the roof line
      for (const end of [0, 1]) {
        for (let i = 0; i < 3; i++) {
          const w = span * (0.82 - i * 0.27);
          const sy = y + (h * i) / 3;
          if (alongX) c.b.box(end ? x1 - 0.02 : x0 + 0.02, sy, (z0 + z1) / 2, 0.05, h / 3 + 0.03, w, c.wall);
          else c.b.box((x0 + x1) / 2, sy, end ? z1 - 0.02 : z0 + 0.02, w, h / 3 + 0.03, 0.05, c.wall);
        }
      }
      return h + 0.03;
    }
    default:
      c.b.gable(x0 - (alongX ? o : o), z0 - o, x1 + o, z1 + o, y, h, hex, alongX, c.wall);
      return h;
  }
}

/** A complete house volume: plinth, walls, openings, roof and chimney. Returns its top height. */
function house(c: Ctx, x0: number, z0: number, x1: number, z1: number, floors: number, roof: RoofType = c.look.roof, wall = c.wall, y0 = 0): number {
  const top = y0 + 0.04 + floors * FH;
  c.b.block(x0 - 0.015, z0 - 0.015, x1 + 0.015, z1 + 0.015, y0, y0 + 0.04, STONE.plinth);
  c.b.block(x0, z0, x1, z1, y0 + 0.04, top, wall);
  if (c.look.wall === 'timber_frame' || c.look.wall === 'stone_timber') {
    for (let f = 0; f <= floors; f++) c.b.block(x0 - 0.006, z0 - 0.006, x1 + 0.006, z1 + 0.006, y0 + 0.04 + f * FH - 0.012, y0 + 0.04 + f * FH + 0.012, STONE.timber);
  }
  openings(c, x0, z0, x1, z1, y0 + 0.04, floors);
  const rh = roofOn(c, x0, z0, x1, z1, top, roof);
  if (c.look.chimney !== 'none' && roof !== 'flat' && roof !== 'dome') {
    c.b.box(x0 + (x1 - x0) * 0.25, top, z0 + (z1 - z0) * 0.3, 0.07, rh * 0.75 + 0.1, 0.07, mixHex(wall, 0x6a5a4a, 0.4));
    if (c.look.chimney === 'twin') c.b.box(x0 + (x1 - x0) * 0.75, top, z0 + (z1 - z0) * 0.3, 0.07, rh * 0.75 + 0.1, 0.07, mixHex(wall, 0x6a5a4a, 0.4));
  }
  return top + rh;
}

function flagpole(c: Ctx, x: number, y: number, z: number, h = 0.36, color = c.flag): void {
  c.b.cyl(x, y, z, 0.008, 0.01, h, 0x6a5a48, 5);
  c.b.box(x + 0.06, y + h - 0.075, z, 0.11, 0.07, 0.008, color);
}

function tree(c: Ctx, x: number, z: number, s = 1, leaf = 0x4f9a48): void {
  c.b.cyl(x, 0, z, 0.02 * s, 0.03 * s, 0.16 * s, COLORS.trunk, 5);
  c.b.sphere(x, 0.26 * s, z, 0.13 * s, leaf, 0.95, 7);
  c.b.sphere(x + 0.05 * s, 0.34 * s, z - 0.03 * s, 0.09 * s, mixHex(leaf, 0xffffff, 0.12), 0.9, 6);
}

function hedge(c: Ctx, x0: number, z0: number, x1: number, z1: number): void {
  c.b.block(x0, z0, x1, z1, 0, 0.06, 0x4c8a45);
}

function fence(c: Ctx, x0: number, z0: number, x1: number, z1: number, color = COLORS.woodDark): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.2));
  for (let i = 0; i <= n; i++) c.b.box(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, 0.02, 0.1, 0.02, color);
  c.b.box((x0 + x1) / 2, 0.06, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.02, 0.015, Math.abs(z1 - z0) + 0.02, color);
}

function crenels(c: Ctx, x0: number, z0: number, x1: number, z1: number, y: number, hex: number): void {
  const step = 0.12;
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    c.b.box(x, y, z0, 0.06, 0.06, 0.05, hex);
    c.b.box(x, y, z1, 0.06, 0.06, 0.05, hex);
  }
  for (let z = z0 + step; z < z1 - 1e-6; z += step) {
    c.b.box(x0, y, z, 0.05, 0.06, 0.06, hex);
    c.b.box(x1, y, z, 0.05, 0.06, 0.06, hex);
  }
}

function roundTower(c: Ctx, x: number, z: number, r: number, h: number, wall: number, roof: number | null): void {
  c.b.cyl(x, 0, z, r, r * 1.06, h, wall, 12);
  c.b.cyl(x, h, z, r * 1.12, r * 1.12, 0.05, mixHex(wall, 0x000000, 0.12), 12);
  if (roof !== null) c.b.cone(x, h + 0.05, z, r * 1.15, r * 1.9, roof, 12);
}

function minaret(c: Ctx, x: number, z: number, h: number): void {
  c.b.cyl(x, 0, z, 0.045, 0.055, h, 0xe9e2d0, 8);
  c.b.cyl(x, h * 0.68, z, 0.075, 0.075, 0.03, 0xd8cfb8, 8);
  c.b.cone(x, h, z, 0.055, 0.2, ROOF_HEX.lead, 8);
}

type Maker = (c: Ctx, w: number, d: number, level: number) => void;

const MAKERS: Partial<Record<BuildingId, Maker>> = {
  town_center(c, w, d, level) {
    const floors = level >= 2 ? 3 : 2;
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.02, 0xc9c2b2);
    const top = house(c, 0.3, 0.42, w - 0.3, d - 0.5, floors);
    // clock tower on the corner facing the camera
    const tx = w - 0.52, tz = 0.5;
    const th = top + 0.25;
    c.b.block(tx - 0.16, tz - 0.16, tx + 0.16, tz + 0.16, 0, th, mixHex(c.wall, 0xffffff, 0.1));
    c.lit.box(tx, th - 0.19, tz + 0.165, 0.14, 0.14, 0.012, 0xf3ead2);
    c.lit.box(tx + 0.165, th - 0.19, tz, 0.012, 0.14, 0.14, 0xf3ead2);
    c.b.pyramid(tx - 0.2, tz - 0.2, tx + 0.2, tz + 0.2, th, 0.34, c.roof);
    flagpole(c, tx, th + 0.34, tz, 0.3);
    c.b.cyl(0.42, 0.02, d - 0.3, 0.1, 0.11, 0.05, 0xb9b2a4, 10);
    c.b.cyl(0.42, 0.07, d - 0.3, 0.02, 0.02, 0.12, 0x8b8578, 6);
    tree(c, w - 0.28, d - 0.26, 1.1);
  },
  hut(c, w, d) {
    const floors = c.look.floors;
    house(c, 0.2, 0.18, w - 0.2, d - 0.34, floors);
    if (c.look.garden !== 'none') {
      hedge(c, 0.08, d - 0.14, w - 0.5, d - 0.08);
      c.b.sphere(w - 0.2, 0.05, d - 0.16, 0.05, c.look.garden === 'flowers' ? 0xe4829c : 0x4c8a45, 0.8, 6);
    }
  },
  warehouse(c, w, d, level) {
    c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.02, 0xbcae94);
    const z1 = d - 0.6;
    const top = 0.04 + (level >= 2 ? 1.5 : 1.2) * FH;
    c.b.block(0.2, 0.25, w - 0.2, z1, 0, top, c.wall);
    c.b.box(w / 2 - 0.3, 0, z1 + 0.004, 0.3, 0.3, 0.02, 0x6b4a2c);
    c.b.box(w / 2 + 0.3, 0, z1 + 0.004, 0.3, 0.3, 0.02, 0x6b4a2c);
    roofOn(c, 0.2, 0.25, w - 0.2, z1, top, 'gable', c.roof, 0.7);
    for (let i = 0; i < 4; i++) c.b.box(0.35 + i * 0.2, 0.02, d - 0.3 - (i % 2) * 0.12, 0.13, 0.12 + (i % 2) * 0.1, 0.13, i % 2 ? COLORS.plank : COLORS.wood, i * 0.4);
    c.b.cyl(w - 0.4, 0.02, d - 0.28, 0.07, 0.07, 0.16, 0x8a5f38, 8);
    c.b.cyl(w - 0.58, 0.02, d - 0.36, 0.07, 0.07, 0.16, 0x7a5230, 8);
  },
  granary(c, w, d, level) {
    c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.02, 0xc9b88f);
    const n = level >= 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = 0.55 + i * 0.75, z = 0.6;
      c.b.cyl(x, 0.02, z, 0.3, 0.3, 0.7, mixHex(c.wall, 0xe6d9b8, 0.5), 14);
      c.b.cyl(x, 0.3, z, 0.305, 0.305, 0.03, 0x9a8a68, 14);
      c.b.cone(x, 0.72, z, 0.34, 0.3, c.roof, 14);
    }
    house(c, w - 0.85, d - 0.8, w - 0.25, d - 0.3, 1, 'gable');
    c.b.box(0.4, 0.02, d - 0.35, 0.18, 0.1, 0.12, 0xd8c27a);
    c.b.box(0.62, 0.02, d - 0.3, 0.18, 0.1, 0.12, 0xcdb56c, 0.5);
  },
  lumber_camp(c, w, d) {
    c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.015, 0xa98f63);
    // open saw shed
    for (const [x, z] of [[0.3, 0.3], [1.1, 0.3], [0.3, 0.9], [1.1, 0.9]] as const) c.b.box(x, 0, z, 0.05, 0.42, 0.05, COLORS.woodDark);
    roofOn(c, 0.24, 0.24, 1.16, 0.96, 0.42, 'gable', c.roof, 0.6);
    c.b.box(0.7, 0.015, 0.6, 0.5, 0.12, 0.16, COLORS.plank);
    c.lit.box(0.7, 0.14, 0.6, 0.02, 0.14, 0.14, 0xb9c2c8);
    // log piles
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) c.b.box(w - 0.5, 0.02 + i * 0.075, d - 0.75 + j * 0.085 + i * 0.04, 0.6, 0.07, 0.07, i % 2 ? 0x9a6a3e : 0x8a5c34);
    for (let i = 0; i < 2; i++) c.b.box(0.5, 0.02 + i * 0.075, d - 0.35 + i * 0.03, 0.55, 0.07, 0.07, 0x916238, 0.3);
    c.b.cyl(1.5, 0, 0.45, 0.05, 0.06, 0.07, 0x8a5c34, 7);
  },
  farm(c, w, d) {
    house(c, 0.2, 0.2, 0.95, 0.75, 1);
    // barn
    c.b.block(w - 0.85, 0.22, w - 0.2, 0.95, 0, 0.42, 0xa8462f);
    c.b.box(w - 0.52, 0, 0.955, 0.24, 0.3, 0.02, 0xf0e6d2);
    roofOn(c, w - 0.85, 0.22, w - 0.2, 0.95, 0.42, 'gable', 0x6a4a3a, 1.1);
    fence(c, 0.12, d - 0.12, w - 0.12, d - 0.12);
    fence(c, 0.12, 1.15, 0.12, d - 0.12);
    fence(c, w - 0.12, 1.15, w - 0.12, d - 0.12);
    for (let i = 0; i < 4; i++) c.b.block(0.22, 1.22 + i * 0.16, w - 0.22, 1.3 + i * 0.16, 0, 0.05, i % 2 ? 0x8fbf4a : 0xa7cc58);
    c.b.cyl(1.0, 0, 1.02, 0.1, 0.13, 0.14, 0xd8bf62, 9);
    c.b.cone(1.0, 0.14, 1.02, 0.11, 0.1, 0xcdb256, 9);
  },
  quarry(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.015, 0xa9a59a);
    // stepped rock face
    c.b.block(0.15, 0.15, 1.2, 0.8, 0, 0.5, 0x8f8c84);
    c.b.block(0.15, 0.15, 0.8, 0.55, 0.5, 0.78, 0x9a978e);
    c.b.block(0.35, 0.8, 1.2, 1.1, 0, 0.24, 0xa19e95);
    for (let i = 0; i < 5; i++) c.b.box(1.35 + (i % 2) * 0.22, 0.015 + Math.floor(i / 2) * 0.11, d - 0.5 + (i % 2) * 0.05, 0.2, 0.11, 0.16, i % 2 ? 0xc8c4b8 : 0xb7b3a7);
    // derrick crane
    c.b.cyl(w - 0.45, 0, 0.5, 0.025, 0.035, 0.75, COLORS.woodDark, 6);
    c.b.box(w - 0.68, 0.7, 0.5, 0.55, 0.03, 0.03, COLORS.woodDark);
    c.b.box(w - 0.92, 0.52, 0.5, 0.008, 0.18, 0.008, 0x3a3a3a);
    c.b.box(w - 0.92, 0.42, 0.5, 0.1, 0.1, 0.1, 0xc8c4b8);
    house(c, 0.25, d - 0.6, 0.8, d - 0.22, 1, 'gable');
  },
  school(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.015, 0xcdbf9f);
    const top = house(c, 0.25, 0.25, w - 0.25, 1.0, Math.min(2, c.look.floors));
    c.b.block(w / 2 - 0.12, 0.5, w / 2 + 0.12, 0.74, top - 0.2, top + 0.16, c.wall);
    c.b.pyramid(w / 2 - 0.16, 0.46, w / 2 + 0.16, 0.78, top + 0.16, 0.2, c.roof);
    c.lit.box(w / 2, top, 0.745, 0.08, 0.1, 0.012, 0xcaa24a);
    fence(c, 0.12, d - 0.12, w - 0.12, d - 0.12, 0xe8e2d2);
    tree(c, 0.38, d - 0.4, 1.1);
    flagpole(c, w - 0.35, 0, d - 0.4, 0.5);
  },
  market(c, w, d) {
    c.b.block(0.06, 0.06, w - 0.06, d - 0.06, 0, 0.02, 0xcfc4ac);
    house(c, 0.25, 0.2, w - 0.25, 0.75, 1, 'hip');
    const awnings = [0xc9463c, 0x3f7fb5, 0xe3b23c, 0x4f9a5a];
    for (let i = 0; i < 4; i++) {
      const x = 0.4 + (i % 2) * (w - 0.8);
      const z = 1.1 + Math.floor(i / 2) * 0.45;
      c.b.box(x, 0.02, z, 0.36, 0.11, 0.2, COLORS.plank);
      for (const dx of [-0.17, 0.17]) c.b.box(x + dx, 0.02, z + 0.1, 0.02, 0.3, 0.02, COLORS.woodDark);
      c.b.gable(x - 0.22, z - 0.14, x + 0.22, z + 0.14, 0.3, 0.07, awnings[i]!, true, 0xf3efe6);
      c.b.box(x - 0.08, 0.13, z, 0.07, 0.05, 0.07, i % 2 ? 0xd9843a : 0xb5c94a);
      c.b.box(x + 0.08, 0.13, z, 0.07, 0.05, 0.07, i % 2 ? 0xc94a3a : 0xe3c23c);
    }
    c.b.cyl(w / 2, 0.02, 1.32, 0.09, 0.1, 0.06, 0xb9b2a4, 10);
  },
  inn(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.015, 0xc6b796);
    const top = house(c, 0.22, 0.22, 1.25, 1.2, Math.max(2, c.look.floors));
    house(c, 1.25, 0.4, w - 0.22, 1.1, 1, 'gable');
    // hanging sign and lantern
    c.b.box(0.74, 0.34, 1.28, 0.02, 0.02, 0.14, 0x3a2a1c);
    c.b.box(0.74, 0.22, 1.33, 0.14, 0.1, 0.012, 0xd9b24a);
    c.lit.box(1.1, 0.26, 1.215, 0.04, 0.06, 0.03, 0xffd98a);
    for (const [x, z] of [[0.5, d - 0.4], [1.0, d - 0.35]] as const) {
      c.b.cyl(x, 0.015, z, 0.09, 0.09, 0.11, COLORS.plank, 8);
      c.b.box(x + 0.15, 0.015, z, 0.05, 0.07, 0.05, COLORS.woodDark);
      c.b.box(x - 0.15, 0.015, z, 0.05, 0.07, 0.05, COLORS.woodDark);
    }
    tree(c, w - 0.4, d - 0.35, 1.05);
    void top;
  },
  watchtower(c, w, d) {
    const cx = w / 2, cz = d / 2;
    c.b.block(cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2, 0, 0.9, STONE.granite);
    c.b.block(cx - 0.25, cz - 0.25, cx + 0.25, cz + 0.25, 0.9, 0.96, mixHex(STONE.granite, 0x000000, 0.15));
    crenels(c, cx - 0.22, cz - 0.22, cx + 0.22, cz + 0.22, 0.96, STONE.granite);
    c.lit.box(cx, 0.6, cz + 0.203, 0.06, 0.12, 0.012, GLASS);
    c.lit.box(cx + 0.203, 0.6, cz, 0.012, 0.12, 0.06, GLASS);
    c.b.box(cx, 0, cz + 0.203, 0.1, 0.18, 0.012, DOOR);
    flagpole(c, cx, 0.96, cz, 0.34);
  },
  barracks(c, w, d) {
    c.b.block(0.06, 0.06, w - 0.06, d - 0.06, 0, 0.015, 0xb8a988);
    const wallHex = STONE.granite;
    c.b.block(0.1, 0.1, w - 0.1, 0.17, 0, 0.3, wallHex);
    c.b.block(0.1, 0.1, 0.17, d - 0.1, 0, 0.3, wallHex);
    c.b.block(w - 0.17, 0.1, w - 0.1, d - 0.1, 0, 0.3, wallHex);
    c.b.block(0.1, d - 0.17, w / 2 - 0.2, d - 0.1, 0, 0.3, wallHex);
    c.b.block(w / 2 + 0.2, d - 0.17, w - 0.1, d - 0.1, 0, 0.3, wallHex);
    house(c, 0.3, 0.28, w - 0.3, 0.85, 1, 'gable');
    for (const [x, z] of [[0.14, 0.14], [w - 0.14, 0.14], [0.14, d - 0.14], [w - 0.14, d - 0.14]] as const) {
      c.b.block(x - 0.09, z - 0.09, x + 0.09, z + 0.09, 0, 0.42, mixHex(wallHex, 0xffffff, 0.08));
      c.b.pyramid(x - 0.11, z - 0.11, x + 0.11, z + 0.11, 0.42, 0.14, c.roof);
    }
    // training dummies and weapon rack
    for (const x of [0.6, 1.0]) {
      c.b.cyl(x, 0.015, d - 0.55, 0.012, 0.012, 0.2, COLORS.woodDark, 5);
      c.b.box(x, 0.13, d - 0.55, 0.14, 0.03, 0.03, 0xc9a25a);
    }
    flagpole(c, w - 0.45, 0.015, d - 0.5, 0.5);
  },
  mosque(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.03, 0xdcd4c0);
    const wall = 0xece5d3;
    c.b.block(0.4, 0.4, w - 0.4, d - 0.4, 0.03, 0.62, wall);
    openings({ ...c, trim: 0xcfc5a8 }, 0.4, 0.4, w - 0.4, d - 0.4, 0.06, 2, true, 0.27);
    c.b.block(0.36, 0.36, w - 0.36, d - 0.36, 0.62, 0.67, 0xd0c7b0);
    c.b.cyl(w / 2, 0.67, d / 2, 0.42, 0.44, 0.12, wall, 16);
    c.b.dome(w / 2, 0.79, d / 2, 0.42, ROOF_HEX.lead, 0.9);
    c.b.cone(w / 2, 1.16, d / 2, 0.02, 0.14, 0xd9b24a, 6);
    for (const [x, z] of [[0.48, 0.48], [w - 0.48, 0.48], [0.48, d - 0.48], [w - 0.48, d - 0.48]] as const) c.b.dome(x, 0.67, z, 0.11, ROOF_HEX.lead, 0.9);
    minaret(c, w - 0.28, d - 0.28, 1.45);
    c.b.cyl(0.32, 0.03, d - 0.3, 0.09, 0.1, 0.07, 0xc9c2b2, 10);
  },
  church(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.02, 0xbfc7a8);
    const wall = c.wall;
    c.b.block(0.35, 0.5, w - 0.3, d - 0.55, 0.02, 0.6, wall);
    openings(c, 0.35, 0.5, w - 0.3, d - 0.55, 0.06, 1, false, 0.5);
    roofOn(c, 0.35, 0.5, w - 0.3, d - 0.55, 0.6, 'gable', c.roof, 1.5);
    // steeple at the west end
    c.b.block(0.2, 0.62, 0.56, 0.98, 0.02, 1.05, mixHex(wall, 0xffffff, 0.06));
    c.lit.box(0.38, 0.8, 0.985, 0.08, 0.16, 0.012, GLASS);
    c.b.box(0.38, 0.02, 0.985, 0.12, 0.22, 0.014, DOOR);
    c.b.pyramid(0.17, 0.59, 0.59, 1.01, 1.05, 0.55, c.roof);
    c.b.box(0.38, 1.6, 0.8, 0.012, 0.12, 0.012, 0xd9b24a);
    c.b.box(0.38, 1.67, 0.8, 0.07, 0.012, 0.012, 0xd9b24a);
    for (const x of [0.5, 0.9, 1.3]) c.b.box(x, 0.02, d - 0.32, 0.05, 0.1, 0.02, 0xb9b9b2);
    tree(c, w - 0.3, d - 0.3, 1.1, 0x3f7f45);
  },
  theatre(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.03, 0xd6cfbd);
    const wall = mixHex(c.wall, 0xf0e8d4, 0.5);
    c.b.block(0.25, 0.22, w - 0.25, d - 0.5, 0.03, 0.72, wall);
    roofOn(c, 0.25, 0.22, w - 0.25, d - 0.5, 0.72, 'hip', c.roof);
    // portico with columns and pediment
    c.b.block(0.3, d - 0.5, w - 0.3, d - 0.2, 0.03, 0.07, 0xe6dfcc);
    for (let i = 0; i < 5; i++) c.b.cyl(0.4 + (i * (w - 0.8)) / 4, 0.07, d - 0.28, 0.035, 0.04, 0.5, 0xf3efe6, 8);
    c.b.block(0.3, d - 0.5, w - 0.3, d - 0.2, 0.57, 0.63, 0xe6dfcc);
    c.b.gable(0.3, d - 0.5, w - 0.3, d - 0.2, 0.63, 0.16, c.roof, false, 0xf0e8d4);
    c.lit.box(w / 2, 0.1, d - 0.495, 0.3, 0.3, 0.012, 0xa33a32);
  },
  cinema(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.02, 0xbdbfc0);
    const wall = 0xe7dcc6;
    c.b.block(0.25, 0.25, w - 0.25, d - 0.4, 0.02, 0.8, wall);
    roofOn(c, 0.25, 0.25, w - 0.25, d - 0.4, 0.8, 'flat', 0x666666);
    c.b.block(0.3, d - 0.4, w - 0.3, d - 0.18, 0.36, 0.42, 0x8f2f2a);
    c.lit.box(w / 2, 0.42, d - 0.19, w - 0.7, 0.14, 0.02, 0xfff0b0);
    c.lit.box(w / 2, 0.06, d - 0.395, 0.5, 0.26, 0.012, 0x9fc3d6);
    c.b.box(w - 0.3, 0.45, d - 0.36, 0.1, 0.6, 0.06, 0x8f2f2a);
    c.lit.box(w - 0.3, 0.5, d - 0.325, 0.06, 0.5, 0.012, 0xffd070);
  },
  police_station(c, w, d) {
    c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.02, 0xb9bcbd);
    const wall = 0xe4e1d8;
    c.b.block(0.25, 0.25, w - 0.25, d - 0.5, 0.02, 0.02 + 2 * FH, wall);
    openings({ ...c, trim: 0x2f4f7f }, 0.25, 0.25, w - 0.25, d - 0.5, 0.02, 2);
    c.b.block(0.24, 0.24, w - 0.24, d - 0.49, 0.02 + FH - 0.03, 0.02 + FH + 0.02, 0x2f4f7f);
    roofOn(c, 0.25, 0.25, w - 0.25, d - 0.5, 0.02 + 2 * FH, 'flat', 0x5a6068);
    c.b.block(w / 2 - 0.22, d - 0.5, w / 2 + 0.22, d - 0.32, 0.3, 0.34, 0x2f4f7f);
    c.lit.box(w / 2, 0.34, d - 0.4, 0.08, 0.05, 0.08, 0x4f8fe0);
    c.lit.box(w / 2, 0.02 + FH + 0.03, d - 0.493, 0.5, 0.07, 0.012, 0xdfe8f5);
    flagpole(c, w - 0.4, 0.02, d - 0.35, 0.55);
    // patrol car parked outside
    c.b.box(0.5, 0.03, d - 0.28, 0.3, 0.07, 0.14, 0xf2f2f2);
    c.b.box(0.5, 0.1, d - 0.28, 0.16, 0.05, 0.13, 0x2f4f7f);
  },
  shipyard(c, w, d) {
    c.b.block(0.06, 0.06, w - 0.06, d - 0.06, 0, 0.03, 0xa98f63);
    house(c, 0.2, 0.2, 0.95, 0.9, 1, 'gable');
    // slipway with a hull on the stocks
    c.b.block(1.05, 0.25, w - 0.2, d - 0.2, 0.03, 0.05, 0x8a6a45);
    const hx = (1.05 + w - 0.2) / 2;
    c.b.box(hx, 0.1, d / 2, 0.3, 0.14, d - 0.75, 0x8f5f3b);
    c.b.box(hx, 0.1, 0.42, 0.2, 0.14, 0.14, 0x8f5f3b, Math.PI / 4);
    c.b.box(hx, 0.24, d / 2, 0.32, 0.02, d - 0.75, 0xd2a868);
    for (let i = 0; i < 4; i++) {
      const z = 0.55 + i * ((d - 1.1) / 3);
      c.b.box(hx - 0.2, 0.05, z, 0.03, 0.2, 0.03, COLORS.woodDark);
      c.b.box(hx + 0.2, 0.05, z, 0.03, 0.2, 0.03, COLORS.woodDark);
    }
    c.b.cyl(0.4, 0.03, d - 0.4, 0.025, 0.035, 0.7, COLORS.woodDark, 6);
    c.b.box(0.62, 0.68, d - 0.4, 0.5, 0.03, 0.03, COLORS.woodDark);
    c.b.box(0.84, 0.5, d - 0.4, 0.008, 0.18, 0.008, 0x3a3a3a);
    for (let i = 0; i < 3; i++) c.b.box(0.35 + i * 0.16, 0.03, 1.15, 0.5, 0.05, 0.06, 0xb98a5a, 0.2);
  },
  terrace_farm(c, w, d) {
    for (let i = 0; i < Math.round(d / 0.2); i++) {
      const z = 0.12 + i * 0.2;
      if (z > d - 0.1) break;
      c.b.block(0.1, z, w - 0.1, z + 0.07, 0, 0.09, i % 2 ? 0x5f9a45 : 0x79b24f);
      for (let x = 0.16; x < w - 0.1; x += 0.22) c.b.box(x, 0, z + 0.035, 0.012, 0.16, 0.012, COLORS.woodDark);
    }
  },
  edinburgh_castle: castle,
  stirling_castle: castle,
  scott_monument(c, w, d) {
    const cx = w / 2, cz = d / 2;
    const stone = 0x6f685c;
    c.b.block(0.2, 0.2, w - 0.2, d - 0.2, 0, 0.08, 0x9a9488);
    for (const [x, z] of [[cx - 0.4, cz - 0.4], [cx + 0.4, cz - 0.4], [cx - 0.4, cz + 0.4], [cx + 0.4, cz + 0.4]] as const) {
      c.b.block(x - 0.09, z - 0.09, x + 0.09, z + 0.09, 0.08, 0.8, stone);
      c.b.pyramid(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 0.8, 0.45, stone);
    }
    c.b.block(cx - 0.42, cz - 0.42, cx + 0.42, cz + 0.42, 0.62, 0.74, stone);
    c.b.block(cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2, 0.74, 1.5, mixHex(stone, 0xffffff, 0.06));
    c.b.pyramid(cx - 0.24, cz - 0.24, cx + 0.24, cz + 0.24, 1.5, 1.2, stone);
    c.b.box(cx, 0.08, cz, 0.18, 0.3, 0.18, 0xe8e4d8);
  },
  sumela_monastery(c, w, d) {
    const wall = 0xe9dfc8;
    c.b.block(0.1, 0.1, w - 0.1, 0.7, 0, 1.3, 0x7d786d);
    c.b.block(0.2, 0.6, w - 0.2, d - 0.3, 0, 0.12, 0x8b867b);
    for (let i = 0; i < 3; i++) {
      const x0 = 0.3 + i * ((w - 0.6) / 3);
      const x1 = x0 + (w - 0.6) / 3 - 0.06;
      const top = 0.12 + (3 + (i % 2)) * 0.26;
      c.b.block(x0, 0.7, x1, d - 0.45, 0.12, top, wall);
      openings({ ...c, trim: 0xb9a888 }, x0, 0.7, x1, d - 0.45, 0.12, 3 + (i % 2), i === 1, 0.26);
      roofOn(c, x0, 0.7, x1, d - 0.45, top, 'gable', ROOF_HEX.clay, 0.7);
    }
    c.b.dome(w / 2, 1.0, 0.9, 0.16, ROOF_HEX.clay);
  },
  galata_tower(c, w, d) {
    const cx = w / 2, cz = d / 2;
    c.b.cyl(cx, 0, cz, 0.62, 0.66, 0.08, 0xb9b2a4, 16);
    c.b.cyl(cx, 0.08, cz, 0.4, 0.44, 1.6, 0xcfc4ac, 16);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      c.lit.box(cx + Math.cos(a) * 0.41, 1.25, cz + Math.sin(a) * 0.41, 0.05, 0.14, 0.05, GLASS, -a);
    }
    c.b.cyl(cx, 1.68, cz, 0.47, 0.47, 0.06, 0xa89f8a, 16);
    c.b.cyl(cx, 1.74, cz, 0.36, 0.38, 0.22, 0xcfc4ac, 16);
    c.b.cone(cx, 1.96, cz, 0.42, 0.75, ROOF_HEX.lead, 16);
    c.b.cone(cx, 2.7, cz, 0.015, 0.16, 0xd9b24a, 5);
  },
  selimiye_mosque(c, w, d) {
    const cx = w / 2, cz = d / 2;
    const wall = 0xe6dcc4;
    c.b.block(0.15, 0.15, w - 0.15, d - 0.15, 0, 0.05, 0xd8cfb8);
    c.b.block(0.8, 0.8, w - 0.8, d - 0.8, 0.05, 0.95, wall);
    openings({ ...c, trim: 0xcbbf9f }, 0.8, 0.8, w - 0.8, d - 0.8, 0.1, 3, true, 0.28);
    c.b.block(0.74, 0.74, w - 0.74, d - 0.74, 0.95, 1.02, 0xcfc5a8);
    c.b.cyl(cx, 1.02, cz, 0.95, 1.0, 0.3, wall, 20);
    c.b.dome(cx, 1.32, cz, 0.95, ROOF_HEX.lead, 0.8);
    c.b.cone(cx, 2.05, cz, 0.03, 0.22, 0xd9b24a, 6);
    for (const [x, z] of [[1.0, 1.0], [w - 1.0, 1.0], [1.0, d - 1.0], [w - 1.0, d - 1.0]] as const) c.b.dome(x, 1.02, z, 0.3, ROOF_HEX.lead, 0.85);
    for (const [x, z] of [[0.6, 0.6], [w - 0.6, 0.6], [0.6, d - 0.6], [w - 0.6, d - 0.6]] as const) minaret(c, x, z, 2.7);
    // arcaded courtyard in front
    c.b.block(1.0, d - 0.8, w - 1.0, d - 0.3, 0.05, 0.3, wall);
    for (let i = 0; i < 4; i++) c.b.dome(1.25 + i * ((w - 2.5) / 3), 0.3, d - 0.55, 0.16, ROOF_HEX.lead, 0.8);
  },
  trabzon_stadium(c, w, d) {
    const cx = w / 2, cz = d / 2;
    c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.03, 0xb9bcbd);
    c.b.block(0.95, 1.15, w - 0.95, d - 1.15, 0.03, 0.05, 0x4f9a48);
    c.b.block(cx - 0.008, 1.15, cx + 0.008, d - 1.15, 0.05, 0.052, 0xf2f2f2);
    // four stands, raked towards the pitch
    const stand = (x0: number, z0: number, x1: number, z1: number, alongX: boolean, sign: number): void => {
      for (let i = 0; i < 4; i++) {
        const o = i * 0.13;
        if (alongX) c.b.block(x0, sign > 0 ? z0 + o : z0, x1, sign > 0 ? z1 : z1 - o, 0.03 + i * 0.12, 0.15 + i * 0.12, i % 2 ? 0x8f1f2e : 0x4aa3d8);
        else c.b.block(sign > 0 ? x0 + o : x0, z0, sign > 0 ? x1 : x1 - o, z1, 0.03 + i * 0.12, 0.15 + i * 0.12, i % 2 ? 0x8f1f2e : 0x4aa3d8);
      }
    };
    stand(0.9, 0.35, w - 0.9, 1.0, true, -1);
    stand(0.9, d - 1.0, w - 0.9, d - 0.35, true, 1);
    stand(0.3, 1.1, 0.85, d - 1.1, false, -1);
    stand(w - 0.85, 1.1, w - 0.3, d - 1.1, false, 1);
    c.b.block(0.85, 0.28, w - 0.85, 0.5, 0.62, 0.66, 0xe8ecef);
    c.b.block(0.85, d - 0.5, w - 0.85, d - 0.28, 0.62, 0.66, 0xe8ecef);
    for (const [x, z] of [[0.4, 0.4], [w - 0.4, 0.4], [0.4, d - 0.4], [w - 0.4, d - 0.4]] as const) {
      c.b.cyl(x, 0.03, z, 0.025, 0.035, 1.1, 0x8d98a2, 6);
      c.lit.box(x, 1.12, z, 0.16, 0.1, 0.05, 0xfff6d8, Math.atan2(cx - x, cz - z));
    }
    void cz;
  },
};

function castle(c: Ctx, w: number, d: number): void {
  const stone = STONE.granite;
  c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.06, 0x8f8c84);
  const t = 0.09;
  const h = 0.48;
  c.b.block(0.25, 0.25, w - 0.25, 0.25 + t, 0, h, stone);
  c.b.block(0.25, d - 0.25 - t, w / 2 - 0.2, d - 0.25, 0, h, stone);
  c.b.block(w / 2 + 0.2, d - 0.25 - t, w - 0.25, d - 0.25, 0, h, stone);
  c.b.block(0.25, 0.25, 0.25 + t, d - 0.25, 0, h, stone);
  c.b.block(w - 0.25 - t, 0.25, w - 0.25, d - 0.25, 0, h, stone);
  crenels(c, 0.28, 0.28, w - 0.28, d - 0.28, h, stone);
  for (const [x, z] of [[0.3, 0.3], [w - 0.3, 0.3], [0.3, d - 0.3], [w - 0.3, d - 0.3]] as const) roundTower(c, x, z, 0.19, 0.75, mixHex(stone, 0xffffff, 0.08), c.roof);
  // gatehouse and keep
  c.b.block(w / 2 - 0.24, d - 0.4, w / 2 + 0.24, d - 0.2, 0, 0.62, mixHex(stone, 0xffffff, 0.05));
  c.b.box(w / 2, 0, d - 0.196, 0.18, 0.28, 0.012, DOOR);
  crenels(c, w / 2 - 0.22, d - 0.38, w / 2 + 0.22, d - 0.22, 0.62, stone);
  const kx0 = w / 2 - 0.5, kz0 = 0.6, kx1 = w / 2 + 0.5, kz1 = d - 1.0;
  c.b.block(kx0, kz0, kx1, kz1, 0.06, 1.05, mixHex(stone, 0xd8cfb8, 0.25));
  openings({ ...c, trim: 0x7f817b }, kx0, kz0, kx1, kz1, 0.1, 3, false);
  crenels(c, kx0 + 0.03, kz0 + 0.03, kx1 - 0.03, kz1 - 0.03, 1.05, stone);
  roofOn(c, kx0 + 0.12, kz0 + 0.12, kx1 - 0.12, kz1 - 0.12, 1.05, 'gable', c.roof);
  flagpole(c, kx1 - 0.1, 1.05, kz0 + 0.1, 0.55);
}

const fallback: Maker = (c, w, d) => {
  c.b.block(0.08, 0.08, w - 0.08, d - 0.08, 0, 0.015, 0xc6b796);
  house(c, 0.25, 0.25, w - 0.25, d - 0.45, Math.max(1, Math.min(3, c.look.floors)));
};

function modern(c: Ctx, id: BuildingId, w: number, d: number): void {
 const title=CITY_BUILDINGS[id]!;
 c.b.block(.05,.05,w-.05,d-.05,0,.015,0x919d96);
 if(id==='airport'){
  c.b.block(.15,.2,7.85,1.25,.015,.025,0x394452);
  for(let x=.3;x<7.8;x+=.55)c.b.block(x,.7,x+.25,.74,.025,.03,0xffffff);
  c.b.block(.4,1.4,7.5,1.75,.015,.025,0x67717c);
  c.b.block(2,2,6.3,3.6,.015,.7,0xd9e8ed);
  for(let x=2.15;x<6;x+=.4)c.b.block(x,3.6,x+.28,3.62,.2,.55,0x4b94ae);
  c.b.block(6.8,2.7,7.2,3.1,0,1.5,0xbbc9d1);
  c.b.block(6.55,2.45,7.45,3.35,1.5,1.85,0x326c85);
  c.b.block(6.5,2.4,7.5,3.4,1.85,1.9,0xe2ebed);
 }else{
  const h=id==='hotel'?1.9:id==='factory'?1:.7;
  c.b.block(.12,.12,w-.12,1.12,.015,h,id==='club'?0x323047:id==='hospital'?0xe8eff2:0xdac9b5);
  c.b.block(.08,.08,w-.08,1.16,h,h+.08,0x4a6976);
  for(let y=.2;y<h-.1;y+=.4)for(let x=.22;x<w-.25;x+=.36){c.b.block(x,1.12,x+.22,1.13,y,y+.23,0x44768c);c.lit.block(x,1.13,x+.22,1.135,y,y+.23,0xffe08a);if(id==='hotel')c.b.block(x-.03,1.13,x+.26,1.3,y-.03,y+.01,0xe5ded1);}
  c.b.block(w/2-.14,1.13,w/2+.14,1.14,0,.32,0x23434f);
  if(id==='market'||id==='hospital'||id==='police_station'){c.b.block(.12,1.5,1.88,1.95,.015,.025,0x545e68);for(let x=.14;x<1.9;x+=.55)c.b.block(x,1.5,x+.015,1.94,.025,.03,0xffffff);}
  if(id==='factory'){for(const x of [.5,1,1.5])c.b.block(x,.3,x+.18,.5,1,1.85,0x9b5d4e);c.b.block(.3,1.2,2.7,1.8,.015,.2,0x68747c);}
  if(id==='hotel'||id==='hospital')c.b.block(.65,1.15,1.35,1.5,.32,.38,0x3b7481);
  if(id==='restaurant'){c.b.block(.15,1.12,1.85,1.48,.4,.46,0xb64f40);for(const x of [.45,1.35]){c.b.block(x-.16,1.55,x+.16,1.82,.15,.2,0xa97947);for(const z of [1.47,1.87])c.b.block(x-.1,z,x+.1,z+.1,.02,.12,0x4f6459);}}
  if(id==='club')for(const x of [.17,1.8]){c.b.block(x,1.16,x+.04,1.17,.02,.72,0xe85aff);c.lit.block(x,1.17,x+.04,1.18,.02,.72,0xe85aff);}
 }
 const width=id==='airport'?3.9:w-.36, start=id==='airport'?2.15:.18, z=id==='airport'?3.63:1.15;
 const y=id==='airport'?.74:id==='hotel'?1.61:id==='factory'?.72:.42;
 const glyphs=[...title].map(ch=>LETTERS[ch]??LETTERS.I!),cols=glyphs.reduce((n,g)=>n+g[0]!.length+1,0),step=width/cols;
 c.b.block(start-.04,z-.01,start+width+.04,z,y-.03,y+.23,id==='hospital'?0xc43c4b:0x244a72);
 let x=start;for(const glyph of glyphs){glyph.forEach((row,j)=>[...row].forEach((bit,i)=>{if(bit==='1')c.b.block(x+i*step,z,x+(i+.8)*step,z+.005,y+.18-j*.035,y+.21-j*.035,0xffffff);}));x+=(glyph[0]!.length+1)*step;}
}

function finish(c: Ctx): BuildingModel {
  const body = c.b.build();
  const lit = c.lit.build();
  body.computeBoundingBox();
  return { body, lit, height: body.boundingBox?.max.y ?? 0.6 };
}

function context(ref: ModelRef, seed: number): Ctx {
  const look = renderLook(ref);
  const wall = wallBase(look.wall, look.facade);
  return {
    b: new Builder(),
    lit: new Builder(),
    seed,
    look,
    wall,
    roof: ROOF_HEX[look.roofMaterial],
    trim: mixHex(wall, 0xffffff, 0.45),
    flag: CULTURES[ref.style].flag,
  };
}

/** Procedural 3D model of a finished building, in local space (0..w, 0..d on the ground). */
export function buildModel(ref: ModelRef, seed = 0): BuildingModel {
  const def = BUILDINGS[ref.definitionId];
  const [w, d] = def.footprint;
  const c = context(ref, seed);
  if (CITY_BUILDINGS[ref.definitionId]) modern(c, ref.definitionId, w, d);
  else (MAKERS[ref.definitionId] ?? fallback)(c, w, d, ref.level);
  return finish(c);
}

/** Building site: foundation, scaffold poles and walls rising with the progress ratio. */
export function buildSite(ref: ModelRef, ratio: number): BuildingModel {
  const [w, d] = BUILDINGS[ref.definitionId].footprint;
  const c = context(ref, 0);
  const rise = 0.06 + Math.max(0, Math.min(1, ratio)) * 0.5;
  c.b.block(0.1, 0.1, w - 0.1, d - 0.1, 0, 0.03, 0xb7a784);
  c.b.block(0.22, 0.22, w - 0.22, d - 0.22, 0.03, rise, mixHex(c.wall, 0x9a8a70, 0.35));
  c.b.block(0.28, 0.28, w - 0.28, d - 0.28, rise - 0.02, rise + 0.001, 0x6a5a48);
  for (const [x, z] of [[0.16, 0.16], [w - 0.16, 0.16], [0.16, d - 0.16], [w - 0.16, d - 0.16]] as const) c.b.box(x, 0, z, 0.03, 0.75, 0.03, COLORS.woodDark);
  for (const y of [0.35, 0.7]) {
    c.b.block(0.16, d - 0.175, w - 0.16, d - 0.145, y, y + 0.02, COLORS.wood);
    c.b.block(w - 0.175, 0.16, w - 0.145, d - 0.16, y, y + 0.02, COLORS.wood);
  }
  c.b.box(0.3 + hash2(w, d, 5) * 0.2, 0.03, d - 0.08, 0.2, 0.08, 0.1, COLORS.plank);
  return finish(c);
}
