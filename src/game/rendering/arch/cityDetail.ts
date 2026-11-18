import type { ArchitectureStyle, BuildingId, BuildingLook } from '../../core/types';
import { P, shade } from '../iso';
import type { Pt } from '../iso';
import type { SeasonPalette } from '../palette';
import {
  box,
  drawFlagPole,
  faceL,
  faceR,
  fp,
  glowPane,
  line,
  poly,
  quad,
  signBoard,
  signWidth,
} from './kit';
import type { DrawCtx, Face } from './kit';
import type { MassOpts } from './buildings';

/**
 * Detailed city buildings (hospital, police, fire station, market, restaurant, club, hotel,
 * factory, airport). Layout contract with systems/cityLife.ts: parking bay k of a building is at
 * (0.42 + 0.55k, depth - 0.25) and its door at (width / 2, 1.23), so every building keeps its
 * walls behind v = 1.22 and paints its bays on the front strip.
 */
export interface CityKit {
  mass(ctx: DrawCtx, look: BuildingLook, u0: number, v0: number, u1: number, v1: number, o?: MassOpts): { zTop: number };
  smallTree(ctx: DrawCtx, u: number, v: number, s: number, pal: SeasonPalette, fruit: boolean): void;
  awning(ctx: DrawCtx, u0: number, u1: number, v: number, z: number, a: number, b: number): void;
}

export const DETAILED_CITY: ReadonlySet<BuildingId> = new Set<BuildingId>([
  'hospital', 'police_station', 'fire_station', 'market', 'restaurant', 'club', 'hotel', 'factory', 'airport',
  'apartment', 'park', 'gas_station', 'pharmacy', 'bakery', 'bank', 'mall',
]);

const ASPHALT = 0x555c62;
const WHITE = 0xf5f3ec;
const RED = 0xc9302c;
const NAVY = 0x1f3f7a;
const PEOPLE = [0xc0392b, 0x2e86c1, 0x27ae60, 0x8e44ad, 0xf39c12, 0x34495e, 0xd35400, 0x16a085];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

const pad = (ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, color: number, alpha = 1): void =>
  poly(ctx, [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], color, alpha);

/** Parking strip with painted bays (positions shared with cityLife.bay). */
function carPark(ctx: DrawCtx, w: number, h: number, v0: number, slots: number, marking: number): void {
  pad(ctx, 0.06, v0, w - 0.06, h - 0.04, ctx.snow ? 0x8f979c : ASPHALT);
  line(ctx, P(0.06, v0), P(w - 0.06, v0), 0xb9b6ab, 1.4);
  for (let k = 0; k < slots; k++) {
    const u = 0.42 + 0.55 * k;
    const v = h - 0.25;
    for (const du of [-0.26, 0.26]) line(ctx, P(u + du, v - 0.2), P(u + du, v + 0.18), marking, 1, 0.9);
    line(ctx, P(u - 0.26, v - 0.2), P(u + 0.26, v - 0.2), marking, 1, 0.9);
  }
}

/** Seated or standing figure in tile space; `z` lifts it onto a terrace or a step. */
function person(ctx: DrawCtx, u: number, v: number, i: number, seated = false, z = 0): void {
  const [x, y] = P(u, v, z);
  const body = PEOPLE[i % PEOPLE.length]!;
  const skin = SKIN[(i * 3) % SKIN.length]!;
  if (!seated) {
    ctx.g.rect(x - 1.4, y - 4, 1.2, 4).fill(0x2c3e50);
    ctx.g.rect(x + 0.2, y - 4, 1.2, 4).fill(0x2c3e50);
  }
  const top = seated ? y - 8 : y - 10;
  ctx.g.roundRect(x - 2, top, 4, 6, 1.4).fill(body);
  ctx.g.circle(x, top - 2, 1.9).fill(skin);
  ctx.g.rect(x - 1.9, top - 4, 3.8, 1.3).fill(i % 3 === 0 ? 0x3b2a1e : i % 3 === 1 ? 0x111111 : 0xa8742f);
}

/** Wall lamp or beacon that glows at night. */
function lamp(ctx: DrawCtx, at: Pt, color: number, r = 1.3): void {
  glowPane(ctx, [[at[0] - r, at[1] - r], [at[0] + r, at[1] - r], [at[0] + r, at[1] + r], [at[0] - r, at[1] + r]], color);
}

/** Horizontal neon tube along a face. */
function neon(ctx: DrawCtx, f: Face, t0: number, t1: number, z: number, color: number, h = 1.2): void {
  glowPane(ctx, [fp(f, t0, z), fp(f, t1, z), fp(f, t1, z + h), fp(f, t0, z + h)], color);
}

/** Lit glass panes in a grid on a face (offices, terminals, shop fronts). */
function glazing(ctx: DrawCtx, f: Face, t0: number, t1: number, z0: number, z1: number, cols: number, rows: number, glass: number, frame: number): void {
  quad(ctx, f, t0, t1, z0, z1, frame);
  const cw = (t1 - t0) / cols;
  const rh = (z1 - z0) / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const a = t0 + c * cw + cw * 0.08, b = t0 + (c + 1) * cw - cw * 0.08;
      const lo = z0 + r * rh + rh * 0.12, hi = z0 + (r + 1) * rh - rh * 0.1;
      quad(ctx, f, a, b, lo, hi, shade(glass, f.side === 'L' ? 1 : 0.82));
      ctx.lights.push([fp(f, a, lo), fp(f, b, lo), fp(f, b, hi), fp(f, a, hi)]);
    }
}

/** Sign raised on two legs above a flat roof, so it reads from the street. */
function roofSign(ctx: DrawCtx, f: Face, tc: number, zRoof: number, text: string, board: number, ink: number, px = 1.6): void {
  const half = signWidth(text, px) / 2;
  for (const t of [tc - half * 0.7, tc + half * 0.7]) line(ctx, fp(f, t, zRoof), fp(f, t, zRoof + 4.5), 0x59636a, 1.2);
  signBoard(ctx, f, tc, zRoof + 6.2, text, board, ink, px);
}

function rooftopUnits(ctx: DrawCtx, u0: number, v0: number, z: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = u0 + i * 0.32;
    box(ctx, u, v0, u + 0.2, v0 + 0.18, z, z + 4, 0xa9b1b6);
    const [x, y] = P(u + 0.1, v0 + 0.09, z + 4);
    ctx.g.ellipse(x, y, 2.4, 1.2).fill(0x6d767c);
  }
}

// --------------------------------------------------------------------------- buildings

function hospital(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const clinic: BuildingLook = {
    ...look, floors: 3, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'cream' : 'white', roof: 'flat',
    roofMaterial: 'lead', windows: scottish ? 'sash' : 'arched', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xc9c7bf, 0.9);
  carPark(ctx, 2, 2, 1.34, 2, WHITE);
  const { zTop } = kit.mass(ctx, clinic, 0.12, 0.12, 1.88, 1.2, {
    roof: 'flat', door: 'L', doorT: 1.0, windows: clinic.windows, spacing: scottish ? 0.3 : 0.25, chimneys: false, balcony: false,
  });
  const L = faceL(0.12, 1.88, 1.2);
  const R = faceR(0.12, 1.2, 1.88);
  quad(ctx, L, 0.12, 1.88, zTop - 3.4, zTop - 1.2, RED);
  quad(ctx, R, 0.12, 1.2, zTop - 3.4, zTop - 1.2, shade(RED, 0.8));
  // red cross plaque on the side wall
  quad(ctx, R, 0.48, 0.84, 18, 30, WHITE);
  quad(ctx, R, 0.62, 0.7, 19.6, 28.4, RED);
  quad(ctx, R, 0.53, 0.79, 22.6, 25.4, RED);
  // entrance canopy with the emergency sign
  for (const u of [0.74, 1.26]) line(ctx, P(u, 1.42, 0), P(u, 1.42, 11.5), 0xd9dde0, 1.2);
  poly(ctx, [P(0.7, 1.2, 12.6), P(1.3, 1.2, 12.6), P(1.3, 1.45, 11.3), P(0.7, 1.45, 11.3)], RED);
  signBoard(ctx, L, 1.0, 15.6, 'ACİL', RED, WHITE, 1.15);
  // roof: helipad, plant and the big sign
  const [hx, hy] = P(0.62, 0.55, zTop + 1);
  ctx.g.ellipse(hx, hy, 12, 6).fill(0x6f7a7d).stroke({ color: WHITE, width: 1 });
  ctx.g.moveTo(hx - 3, hy - 2.2).lineTo(hx - 3, hy + 2.2).moveTo(hx + 3, hy - 2.2).lineTo(hx + 3, hy + 2.2)
    .moveTo(hx - 3, hy).lineTo(hx + 3, hy).stroke({ color: WHITE, width: 1.2 });
  rooftopUnits(ctx, 1.2, 0.3, zTop, 2);
  roofSign(ctx, L, 1.0, zTop, 'HASTANE', WHITE, RED, 1.55);
  kit.smallTree(ctx, 1.83, 1.56, 0.8, pal, false);
  lamp(ctx, P(1.88, 1.9, 0), 0xfff2c0, 0.01);
}

function policeStation(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const station: BuildingLook = {
    ...look, floors: 2, wall: scottish ? 'granite' : 'plaster', facade: scottish ? 'grey' : 'white', roof: scottish ? 'hip' : 'flat',
    roofMaterial: 'slate', windows: 'sash', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xb9b8b0, 0.9);
  carPark(ctx, 2, 2, 1.34, 2, 0xf2d24a);
  const { zTop } = kit.mass(ctx, station, 0.12, 0.12, 1.88, 1.2, {
    roof: station.roof, door: 'L', doorT: 1.0, windows: 'sash', spacing: 0.27, chimneys: false, balcony: false,
  });
  const L = faceL(0.12, 1.88, 1.2);
  const R = faceR(0.12, 1.2, 1.88);
  // navy plinth and cornice bands, broken by the entrance
  for (const [z0, z1] of [[0, 3], [zTop - 3.2, zTop - 1.2]] as const) {
    if (scottish && z0 > 0) break;
    quad(ctx, L, 0.12, 0.86, z0, z1, NAVY);
    quad(ctx, L, 1.14, 1.88, z0, z1, NAVY);
    quad(ctx, R, 0.12, 1.2, z0, z1, shade(NAVY, 0.8));
  }
  lamp(ctx, fp(L, 1.0, 12.4), 0x2f6fe0, 1.5);
  // steps and two street lamps at the door
  box(ctx, 0.84, 1.2, 1.16, 1.3, 0, 1.4, 0xcfcfc8);
  const mast = P(0.4, 0.4, zTop + (scottish ? 6 : 1));
  line(ctx, mast, [mast[0], mast[1] - 17], 0x59636a, 1.1);
  for (const dy of [-8, -13]) line(ctx, [mast[0] - 3, mast[1] + dy], [mast[0] + 3, mast[1] + dy], 0x59636a, 0.9);
  lamp(ctx, [mast[0], mast[1] - 17.5], 0xff3b3b, 0.9);
  if (mast[1] - 19 < ctx.topY) ctx.topY = mast[1] - 19;
  if (scottish) signBoard(ctx, L, 1.0, zTop - 11.2, 'POLİS', NAVY, WHITE, 1.35);
  else roofSign(ctx, L, 1.0, zTop, 'POLİS', NAVY, WHITE, 1.65);
  drawFlagPole(ctx, P(1.72, 0.28, zTop + 1), scottish ? 0x1d4ed8 : 0xc8102e, 12);
  box(ctx, 1.62, 1.36, 1.9, 1.6, 0, 3, 0x7a7f84); // barrier block by the bays
}

function fireStation(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const hall: BuildingLook = {
    ...look, floors: 2, wall: scottish ? 'sandstone' : 'brick', facade: scottish ? 'ochre' : 'terracotta', roof: 'flat',
    roofMaterial: 'lead', windows: 'sash', door: 'plank', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xb3b0a6, 0.9);
  // apparatus apron with hatched safety stripes
  pad(ctx, 0.06, 1.22, 1.94, 1.96, ctx.snow ? 0x8f979c : ASPHALT);
  for (let u = 0.12; u < 1.9; u += 0.16) line(ctx, P(u, 1.24), P(u + 0.08, 1.36), 0xf2c230, 1.2);
  const { zTop } = kit.mass(ctx, hall, 0.12, 0.12, 1.5, 1.2, { roof: 'flat', door: null, windows: 'sash', spacing: 0.3, chimneys: false, balcony: false });
  const L = faceL(0.12, 1.5, 1.2);
  for (const [a, b] of [[0.2, 0.74], [0.86, 1.4]] as const) {
    quad(ctx, L, a - 0.03, b + 0.03, 0, 14.5, shade(0xe8e2d4, 0.95));
    quad(ctx, L, a, b, 0, 13.5, 0xc8261f);
    for (let z = 2; z < 13; z += 2.2) line(ctx, fp(L, a, z), fp(L, b, z), shade(0xc8261f, 0.72), 0.8);
    quad(ctx, L, a + 0.06, b - 0.06, 9.5, 12.5, 0xbfe3f2);
    ctx.lights.push([fp(L, a + 0.06, 9.5), fp(L, b - 0.06, 9.5), fp(L, b - 0.06, 12.5), fp(L, a + 0.06, 12.5)]);
  }
  signBoard(ctx, L, 0.81, 17.2, 'İTFAİYE', 0xc8261f, WHITE, 1.2);
  // hose-drying tower with a beacon
  const towerTop = scottish ? 50 : 46;
  const tower: BuildingLook = { ...hall, floors: 4 };
  kit.mass(ctx, tower, 1.5, 0.12, 1.88, 0.62, { floors: 4, roof: 'flat', door: 'L', doorT: 1.69, windows: 'small', spacing: 0.4, chimneys: false, balcony: false });
  box(ctx, 1.46, 0.08, 1.92, 0.66, towerTop, towerTop + 2.5, 0xe8e2d4);
  lamp(ctx, P(1.69, 0.37, towerTop + 4.5), 0xff2a1f, 1.8);
  if (P(1.69, 0.37, towerTop + 7)[1] < ctx.topY) ctx.topY = P(1.69, 0.37, towerTop + 7)[1];
  rooftopUnits(ctx, 0.3, 0.3, zTop, 2);
  // hydrant and hose reel
  box(ctx, 1.62, 1.0, 1.72, 1.1, 0, 5, 0xd62828);
  const [rx, ry] = P(1.74, 1.18, 4);
  ctx.g.circle(rx, ry, 3).fill(0xd62828).stroke({ color: 0x7a1010, width: 1 });
  drawFlagPole(ctx, P(0.2, 0.2, zTop + 1), 0xd62828, 10);
}

function market(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const brand = scottish ? 0x1e5aa8 : 0xd7263d;
  const shop: BuildingLook = {
    ...look, floors: 2, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'cream' : 'white', roof: 'flat',
    roofMaterial: 'lead', windows: 'small', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xc6c2b6, 0.9);
  carPark(ctx, 2, 2, 1.36, 3, WHITE);
  const { zTop } = kit.mass(ctx, shop, 0.12, 0.12, 1.88, 1.2, { roof: 'flat', door: null, windows: 'small', spacing: 0.4, chimneys: false, balcony: false });
  const L = faceL(0.12, 1.88, 1.2);
  const R = faceR(0.12, 1.2, 1.88);
  // full-width glass shop front with the automatic doors in the middle
  glazing(ctx, L, 0.2, 1.8, 0.5, 11.5, 6, 1, 0x9fd3e6, 0x5d666c);
  quad(ctx, L, 0.88, 1.12, 0.3, 10.5, 0x2c3e50);
  quad(ctx, L, 0.9, 0.99, 0.5, 10, 0xbfe6f2);
  quad(ctx, L, 1.01, 1.1, 0.5, 10, 0xbfe6f2);
  // brand fascia on both faces
  quad(ctx, L, 0.12, 1.88, 12, zTop - 1, brand);
  quad(ctx, R, 0.12, 1.2, 12, zTop - 1, shade(brand, 0.8));
  signBoard(ctx, L, 1.0, 15.2, 'MARKET', brand, WHITE, 1.55);
  for (const t of [0.35, 0.75]) {
    const [x, y] = fp(R, t, 17.5);
    ctx.g.circle(x, y, 2.6).fill(0xf2c230);
  }
  // canopy over the doors, carts and a produce stand
  poly(ctx, [P(0.78, 1.2, 12), P(1.22, 1.2, 12), P(1.22, 1.38, 10.8), P(0.78, 1.38, 10.8)], shade(brand, 0.85));
  for (let i = 0; i < 4; i++) {
    const u = 1.42 + i * 0.07;
    box(ctx, u, 1.24, u + 0.05, 1.32, 1, 4, 0xb9c2c8);
  }
  box(ctx, 0.22, 1.22, 0.62, 1.32, 0, 3.5, 0x8a5a36);
  [0xd23a32, 0xe8b23a, 0x6fae4a, 0xf08a24].forEach((c, i) => box(ctx, 0.25 + i * 0.09, 1.23, 0.32 + i * 0.09, 1.31, 3.5, 5.2, c));
  rooftopUnits(ctx, 0.3, 0.35, zTop, 3);
  lamp(ctx, P(1.9, 1.38, 14), 0xfff2c0, 1.1);
}

function restaurant(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const house: BuildingLook = {
    ...look, floors: 2, wall: scottish ? 'sandstone' : 'timber_frame', facade: scottish ? 'honey' : 'cream',
    roof: scottish ? 'gable' : 'hip', roofMaterial: scottish ? 'slate' : 'clay', windows: scottish ? 'sash' : 'latticed',
    door: 'double', tower: 'none', balcony: 'none', chimney: 'gable', decor: 'flowerboxes',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xc9bfa9, 0.9);
  carPark(ctx, 2, 2, 1.36, 3, WHITE);
  // timber terrace on the right
  pad(ctx, 1.4, 0.18, 1.92, 1.3, 0xa77b4f);
  for (let v = 0.24; v < 1.3; v += 0.11) line(ctx, P(1.4, v), P(1.92, v), 0x8a6239, 0.6, 0.7);
  kit.mass(ctx, house, 0.12, 0.12, 1.36, 1.2, { door: 'L', doorT: 1.0, spacing: 0.28, balcony: false, axis: 'u' });
  const L = faceL(0.12, 1.36, 1.2);
  kit.awning(ctx, 0.14, 1.34, 1.2, 11.5, scottish ? 0x1e3a8a : 0xb71c1c, WHITE);
  signBoard(ctx, L, 0.62, 15.6, 'RESTORAN', scottish ? 0x1e3a8a : 0x7b1e3a, 0xf6e7b0, 1.05);
  // string lights over the terrace
  const posts: [number, number][] = [[1.44, 0.22], [1.9, 0.22], [1.9, 1.26], [1.44, 1.26]];
  for (const [u, v] of posts) line(ctx, P(u, v, 0), P(u, v, 13), 0x5b4632, 1);
  for (let i = 0; i < 4; i++) {
    const [a, b] = [posts[i]!, posts[(i + 1) % 4]!];
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const sag = Math.sin(t * Math.PI) * 2;
      lamp(ctx, P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 13 - sag), 0xffd36b, 0.75);
    }
  }
  // tables with parasols and diners
  const tables: [number, number, number][] = [[1.56, 0.45, 0], [1.76, 0.85, 1], [1.56, 1.1, 2]];
  for (const [u, v, i] of tables) {
    person(ctx, u - 0.1, v, i * 2, true);
    const [x, y] = P(u, v, 4);
    ctx.g.ellipse(x, y, 4, 2).fill(WHITE);
    line(ctx, P(u, v, 0), P(u, v, 4), 0x6b5a48, 0.8);
    person(ctx, u + 0.1, v + 0.02, i * 2 + 1, true);
    line(ctx, P(u, v, 4), P(u, v, 12), 0x6b5a48, 0.8);
    const [px, py] = P(u, v, 12);
    const color = i % 2 ? (scottish ? 0x1e3a8a : 0xb71c1c) : 0xf1e6c8;
    ctx.g.poly([px - 7, py + 2, px, py - 2.5, px + 7, py + 2]).fill(color);
  }
  // menu easel and planters
  line(ctx, P(0.62, 1.3, 0), P(0.62, 1.3, 6), 0x5b4632, 1);
  quad(ctx, faceL(0.52, 0.72, 1.3), 0.54, 0.7, 2.5, 7, 0x223322);
  kit.smallTree(ctx, 0.2, 1.3, 0.6, pal, false);
}

function club(ctx: DrawCtx, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const PINK = 0xff3fd0;
  const CYAN = 0x34e6ff;
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0x4a4a55, 0.9);
  carPark(ctx, 2, 2, 1.36, 3, 0xd8d8e0);
  const wall = scottish ? 0x2f2c3a : 0x26233a;
  const h = 27;
  box(ctx, 0.12, 0.12, 1.88, 1.2, 0, h, wall);
  box(ctx, 0.08, 0.08, 1.92, 1.24, h, h + 2.5, 0x15131f);
  const L = faceL(0.12, 1.88, 1.2);
  const R = faceR(0.12, 1.2, 1.88);
  // dark glass band with coloured light behind it
  for (let t = 0.2; t < 1.8; t += 0.26) {
    const c = Math.round(t * 10) % 2 ? PINK : 0x7b5cff;
    quad(ctx, L, t, t + 0.18, 15, 21, 0x15131f);
    glowPane(ctx, [fp(L, t + 0.02, 15.8), fp(L, t + 0.16, 15.8), fp(L, t + 0.16, 20.2), fp(L, t + 0.02, 20.2)], c, 0.55);
  }
  // neon outlines: roofline, plinth and corner tubes
  neon(ctx, L, 0.12, 1.88, h - 1.6, PINK);
  neon(ctx, R, 0.12, 1.2, h - 1.6, CYAN);
  neon(ctx, L, 0.12, 1.88, 0.6, CYAN, 0.9);
  for (const t of [0.14, 1.84]) glowPane(ctx, [fp(L, t, 1), fp(L, t + 0.03, 1), fp(L, t + 0.03, h - 1.6), fp(L, t, h - 1.6)], t < 1 ? CYAN : PINK);
  // neon sign: dark board, pink letters that glow
  const half = signWidth('CLUB', 2.1) / 2 + 0.08;
  quad(ctx, L, 0.62 - half + 0.38, 1.38 + half - 0.38, 6.5, 13.5, 0x15131f);
  ctx.glowColor = PINK;
  signBoard(ctx, L, 1.0, 8, 'CLUB', 0x15131f, PINK, 2.1);
  ctx.glowColor = undefined;
  // entrance: door, red carpet, rope line, bouncer and queue
  quad(ctx, L, 0.9, 1.1, 0, 6, 0x0c0b12);
  glowPane(ctx, [fp(L, 0.9, 6.2), fp(L, 1.1, 6.2), fp(L, 1.1, 6.9), fp(L, 0.9, 6.9)], CYAN);
  pad(ctx, 0.9, 1.2, 1.1, 1.36, 0xa3162b);
  for (const u of [0.62, 0.74, 0.86]) {
    line(ctx, P(u, 1.32, 0), P(u, 1.32, 4), 0xd4af37, 1);
  }
  line(ctx, P(0.62, 1.32, 3.6), P(0.86, 1.32, 3.6), 0xa3162b, 1);
  person(ctx, 1.16, 1.26, 5);
  for (let i = 0; i < 4; i++) person(ctx, 0.66 + i * 0.07 - 0.25, 1.25 + (i % 2) * 0.03, i + 1);
  if (scottish) {
    // converted bonded warehouse: stone quoins and old chimney stacks
    for (let z = 2; z < h; z += 5) {
      quad(ctx, L, 0.12, 0.22, z, z + 2.5, 0x8d8371);
      quad(ctx, R, 0.12, 0.2, z, z + 2.5, 0x6f675a);
    }
    for (const u of [0.35, 0.65]) box(ctx, u, 0.2, u + 0.16, 0.36, h + 2.5, h + 12, 0x6f675a);
  } else {
    // rooftop lounge under a canopy
    for (const [u, v] of [[0.9, 0.3], [1.7, 0.3], [0.9, 1.0], [1.7, 1.0]] as const) line(ctx, P(u, v, h + 2.5), P(u, v, h + 11), 0x9b8a6a, 1);
    poly(ctx, [P(0.86, 0.26, h + 11), P(1.74, 0.26, h + 11), P(1.74, 1.04, h + 11), P(0.86, 1.04, h + 11)], 0xe9dcc0, 0.95);
    for (const u of [1.05, 1.5]) box(ctx, u, 0.55, u + 0.16, 0.7, h + 2.5, h + 4.5, 0x5a4a6a);
  }
  // roof spotlights
  for (const u of [0.4, 1.6]) {
    box(ctx, u - 0.05, 0.5, u + 0.05, 0.6, h + 2.5, h + 5, 0x3a3a46);
    lamp(ctx, P(u, 0.55, h + 5.8), u < 1 ? PINK : CYAN, 1.3);
  }
}

function hotel(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const tower: BuildingLook = {
    ...look, floors: 4, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'honey' : 'sky', roof: 'flat',
    roofMaterial: 'lead', windows: 'sash', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  const floors = 6;
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xc8c3b6, 0.9);
  carPark(ctx, 2, 2, 1.38, 3, WHITE);
  const { zTop } = kit.mass(ctx, tower, 0.14, 0.14, 1.86, 1.2, { floors, roof: 'flat', door: 'L', doorT: 1.0, windows: 'sash', spacing: 0.25, chimneys: false, balcony: false });
  const L = faceL(0.14, 1.86, 1.2);
  const R = faceR(0.14, 1.2, 1.86);
  // balconies with glass rails on every upper floor
  const rail = scottish ? 0x3b3f45 : 0xe6e6e0;
  for (let f = 1; f < floors; f++) {
    const z = f * 11;
    for (let t = 0.24; t < 1.78; t += 0.5) {
      box(ctx, t, 1.2, t + 0.34, 1.32, z, z + 1.2, shade(0xe2ddd2, 0.95));
      poly(ctx, [P(t, 1.32, z + 1.2), P(t + 0.34, 1.32, z + 1.2), P(t + 0.34, 1.32, z + 5), P(t, 1.32, z + 5)], 0xa8d8ea, 0.45);
      line(ctx, P(t, 1.32, z + 5), P(t + 0.34, 1.32, z + 5), rail, 1);
    }
    for (let t = 0.3; t < 1.1; t += 0.42) {
      box(ctx, 1.86, t, 1.96, t + 0.28, z, z + 1.2, shade(0xe2ddd2, 0.8));
      line(ctx, P(1.96, t, z + 5), P(1.96, t + 0.28, z + 5), rail, 1);
    }
  }
  // vertical name panel on the corner
  quad(ctx, R, 0.14, 0.26, 18, zTop - 4, 0x1f2d3d);
  // grand entrance canopy
  const gold = 0xd4af37;
  for (const u of [0.62, 1.38]) line(ctx, P(u, 1.5, 0), P(u, 1.5, 10.5), gold, 1.3);
  poly(ctx, [P(0.56, 1.2, 11.8), P(1.44, 1.2, 11.8), P(1.44, 1.54, 10.4), P(0.56, 1.54, 10.4)], 0x1f2d3d);
  line(ctx, P(0.56, 1.54, 10.4), P(1.44, 1.54, 10.4), gold, 1.2);
  signBoard(ctx, faceL(0.56, 1.44, 1.54), 1.0, 7.8, 'OTEL', 0x1f2d3d, gold, 1.1);
  person(ctx, 0.66, 1.42, 5); // doorman
  for (const u of [0.5, 1.5]) {
    box(ctx, u - 0.05, 1.24, u + 0.05, 1.34, 0, 3, 0x7a6a58);
    kit.smallTree(ctx, u, 1.29, 0.45, pal, false);
  }
  // rooftop: pool, loungers, sign
  pad(ctx, 0.3, 0.3, 1.0, 0.75, 0x7fd3ea);
  poly(ctx, [P(0.3, 0.3, zTop + 0.5), P(1.0, 0.3, zTop + 0.5), P(1.0, 0.75, zTop + 0.5), P(0.3, 0.75, zTop + 0.5)], 0x4fc3e6);
  for (const u of [1.15, 1.35]) box(ctx, u, 0.35, u + 0.12, 0.65, zTop, zTop + 1.5, WHITE);
  roofSign(ctx, L, 1.0, zTop, 'OTEL', 0x1f2d3d, gold, 2.1);
  for (const u of [0.25, 1.75]) drawFlagPole(ctx, P(u, 1.58, 1), u < 1 ? (scottish ? 0x1d4ed8 : 0xc8102e) : 0x2e7d32, 14);
}

function factory(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const brick = scottish ? 0x8a6a55 : 0xa65b45;
  pad(ctx, 0.04, 0.04, 2.96, 2.96, 0xa7a59c, 0.95);
  carPark(ctx, 3, 3, 2.38, 3, 0xf2d24a);
  // perimeter fence with a gate gap at the front
  for (const [a, b] of [[P(0.05, 0.05), P(2.95, 0.05)], [P(2.95, 0.05), P(2.95, 2.95)], [P(0.05, 0.05), P(0.05, 2.95)]] as const) {
    line(ctx, [a[0], a[1] - 5], [b[0], b[1] - 5], 0x8e9599, 0.8);
    line(ctx, [a[0], a[1] - 2.5], [b[0], b[1] - 2.5], 0x8e9599, 0.6);
  }
  // chimneys at the back with red-white bands
  for (const [u, v] of [[0.45, 0.35], [0.95, 0.32]] as const) {
    box(ctx, u - 0.08, v - 0.08, u + 0.08, v + 0.08, 0, 72, scottish ? 0x6e6458 : brick);
    for (const z of [58, 64]) box(ctx, u - 0.085, v - 0.085, u + 0.085, v + 0.085, z, z + 3, z === 58 ? RED : WHITE);
    ctx.smoke.push(P(u, v, 73));
  }
  // storage tank
  const [tx, ty] = P(2.55, 0.5, 0);
  ctx.g.rect(tx - 10, ty - 26, 20, 26).fill(0xb8c0c6);
  ctx.g.rect(tx + 2, ty - 26, 8, 26).fill(0x9aa3aa);
  ctx.g.ellipse(tx, ty - 26, 10, 5).fill(0xd2d8dc);
  ctx.g.ellipse(tx, ty, 10, 5).fill({ color: 0x9aa3aa, alpha: 0.3 });
  // main hall with a sawtooth north-light roof
  const hall: BuildingLook = { ...look, floors: 2, wall: 'brick', facade: scottish ? 'umber' : 'terracotta', roof: 'flat', roofMaterial: 'lead', windows: 'small', door: 'plank', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none' };
  const { zTop } = kit.mass(ctx, hall, 0.15, 0.7, 2.2, 1.95, { roof: 'flat', door: null, windows: 'small', spacing: 0.32, chimneys: false, balcony: false });
  for (let u = 0.15; u < 2.15; u += 0.41) {
    const u1 = Math.min(2.2, u + 0.41);
    poly(ctx, [P(u, 0.7, zTop), P(u, 1.95, zTop), P(u + 0.1, 1.95, zTop + 8), P(u + 0.1, 0.7, zTop + 8)], 0x9fd3e6);
    poly(ctx, [P(u + 0.1, 0.7, zTop + 8), P(u + 0.1, 1.95, zTop + 8), P(u1, 1.95, zTop), P(u1, 0.7, zTop)], 0x7d858b);
    poly(ctx, [P(u, 1.95, zTop), P(u + 0.1, 1.95, zTop + 8), P(u1, 1.95, zTop)], shade(0x7d858b, 1.1));
  }
  // loading dock with three doors and a raised platform
  const L = faceL(0.15, 2.2, 1.95);
  box(ctx, 0.25, 1.95, 2.1, 2.2, 0, 3.2, 0x8c8f8a);
  for (const t of [0.42, 0.97, 1.52]) {
    quad(ctx, L, t - 0.2, t + 0.2, 3.2, 15, 0x2b2f33);
    quad(ctx, L, t - 0.17, t + 0.17, 3.2, 14, 0x9aa0a4);
    for (let z = 5; z < 14; z += 2) line(ctx, fp(L, t - 0.17, z), fp(L, t + 0.17, z), 0x7d8388, 0.6);
    lamp(ctx, fp(L, t, 16.5), 0xffe08a, 0.9);
  }
  // office block with the sign
  const office: BuildingLook = { ...hall, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'cream' : 'white', windows: 'sash' };
  const top = kit.mass(ctx, office, 2.25, 1.2, 2.85, 1.95, { floors: 2, roof: 'flat', door: 'L', doorT: 2.55, windows: 'sash', spacing: 0.22, chimneys: false, balcony: false }).zTop;
  roofSign(ctx, L, 1.17, zTop + 8, 'FABRİKA', 0x2b3a4a, 0xf2d24a, 1.6);
  void top;
  // pallets, crates and a container in the yard
  box(ctx, 2.3, 2.1, 2.88, 2.36, 0, 9, scottish ? 0x2f6f8f : 0xc0392b);
  for (let i = 0; i < 4; i++) line(ctx, P(2.3 + i * 0.15, 2.36, 1), P(2.3 + i * 0.15, 2.36, 8), 0x00000, 0.5, 0.25);
  for (const [u, v, n] of [[2.2, 2.5, 3], [2.55, 2.55, 2]] as const)
    for (let k = 0; k < n; k++) box(ctx, u, v, u + 0.22, v + 0.22, k * 3.2, k * 3.2 + 3, k % 2 ? 0xb5884d : 0xc99a5b);
  // forklift
  box(ctx, 1.95, 2.2, 2.12, 2.32, 0, 4, 0xf2b705);
  line(ctx, P(1.94, 2.24, 0), P(1.94, 2.24, 9), 0x333333, 1);
}

function airport(ctx: DrawCtx, kit: CityKit, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const grass = scottish ? 0x7c9a7f : 0x8aa56f;
  pad(ctx, 0.03, 0.03, 7.97, 3.97, grass);
  // runway (flight path at v = 0.72) with threshold keys, centre dashes and edge lights
  pad(ctx, 0.08, 0.32, 7.92, 1.12, 0x3c434a);
  for (const [a, b] of [[0.14, 0.5], [7.5, 7.86]] as const)
    for (let v = 0.38; v < 1.08; v += 0.12) pad(ctx, a, v, b, v + 0.06, WHITE);
  for (let u = 0.7; u < 7.3; u += 0.42) pad(ctx, u, 0.7, u + 0.22, 0.74, WHITE);
  for (const u of [1.0, 6.8]) for (const v of [0.5, 0.94]) pad(ctx, u, v, u + 0.4, v + 0.03, WHITE);
  for (let u = 0.15; u < 7.9; u += 0.36)
    for (const v of [0.34, 1.1]) lamp(ctx, P(u, v, 0.5), v < 1 ? 0xfff2c0 : 0x5fd1ff, 0.75);
  // taxiway (v = 1.85) with links to the runway and yellow centre line
  pad(ctx, 0.3, 1.62, 7.1, 2.08, 0x50575e);
  for (const u of [0.5, 6.8]) pad(ctx, u - 0.22, 1.12, u + 0.22, 1.62, 0x50575e);
  line(ctx, P(0.4, 1.85), P(7.0, 1.85), 0xf2c230, 1.1);
  for (const u of [0.5, 6.8]) line(ctx, P(u, 1.12), P(u, 1.85), 0xf2c230, 1.1);
  for (let u = 0.4; u < 7.1; u += 0.5) lamp(ctx, P(u, 2.06, 0.3), 0x3fe07a, 0.55);
  // apron at the terminal stand
  pad(ctx, 4.5, 2.08, 6.5, 2.4, 0x6b737a);
  line(ctx, P(5.5, 1.85), P(5.5, 2.36), 0xf2c230, 1);
  // hangar with an arched roof
  const hangar = scottish ? 0x8b98a3 : 0xb7c2c9;
  box(ctx, 0.3, 2.3, 1.95, 3.35, 0, 18, hangar);
  for (let k = 0; k < 6; k++) {
    const z0 = 18 + Math.sin((k / 6) * Math.PI) * 8;
    const z1 = 18 + Math.sin(((k + 1) / 6) * Math.PI) * 8;
    const v0 = 2.3 + (1.05 * k) / 6, v1 = 2.3 + (1.05 * (k + 1)) / 6;
    poly(ctx, [P(0.3, v0, z0), P(1.95, v0, z0), P(1.95, v1, z1), P(0.3, v1, z1)], shade(hangar, k < 3 ? 1.12 : 0.95));
  }
  const HL = faceL(0.3, 1.95, 3.35);
  quad(ctx, HL, 0.45, 1.8, 0, 15, 0x6b7680);
  for (let t = 0.6; t < 1.8; t += 0.3) line(ctx, fp(HL, t, 0), fp(HL, t, 15), 0x58626b, 0.8);
  // terminal: glass hall, wave roof, jet bridge, sign
  const T0 = 2.2, T1 = 6.4, V0 = 2.45, V1 = 3.35;
  box(ctx, T0, V0, T1, V1, 0, 22, scottish ? 0xcfd6dc : 0xe3ecef);
  const TL = faceL(T0, T1, V1);
  const TR = faceR(V0, V1, T1);
  glazing(ctx, TL, T0 + 0.1, T1 - 0.1, 2, 19, 14, 2, 0x8fc9e0, 0x56656f);
  glazing(ctx, TR, V0 + 0.1, V1 - 0.1, 2, 19, 3, 2, 0x8fc9e0, 0x56656f);
  for (let k = 0; k < 8; k++) {
    const u0 = T0 - 0.08 + ((T1 - T0 + 0.16) * k) / 8, u1 = T0 - 0.08 + ((T1 - T0 + 0.16) * (k + 1)) / 8;
    const z0 = 22 + Math.sin((k / 8) * Math.PI) * 6, z1 = 22 + Math.sin(((k + 1) / 8) * Math.PI) * 6;
    poly(ctx, [P(u0, V0 - 0.08, z0), P(u1, V0 - 0.08, z1), P(u1, V1 + 0.1, z1), P(u0, V1 + 0.1, z0)], scottish ? 0x4a5a6a : 0x9aa9b4);
  }
  signBoard(ctx, TL, (T0 + T1) / 2, 22.5, 'HAVALİMANI', scottish ? 0x1e3a8a : 0x7b1e3a, WHITE, 1.7);
  box(ctx, 5.42, 2.2, 5.6, V0, 8, 11.5, 0xd5dbde); // jet bridge
  box(ctx, 5.4, 2.18, 5.62, 2.26, 0, 8, 0x7d858b);
  // control tower
  box(ctx, 6.82, 2.62, 7.12, 2.92, 0, 54, 0xd8dee2);
  box(ctx, 6.66, 2.46, 7.28, 3.08, 54, 56, 0x5d6870);
  const cab = faceL(6.66, 7.28, 3.08);
  glazing(ctx, cab, 6.68, 7.26, 56, 63, 3, 1, 0x6fb8d8, 0x3b4a55);
  glazing(ctx, faceR(2.46, 3.08, 7.28), 2.48, 3.06, 56, 63, 3, 1, 0x6fb8d8, 0x3b4a55);
  box(ctx, 6.62, 2.42, 7.32, 3.12, 63, 65.5, 0xe9edef);
  line(ctx, P(6.97, 2.77, 65.5), P(6.97, 2.77, 75), 0x6a737a, 1.1);
  lamp(ctx, P(6.97, 2.77, 75.5), 0xff3b3b, 1);
  if (P(6.97, 2.77, 78)[1] < ctx.topY) ctx.topY = P(6.97, 2.77, 78)[1];
  // radar and windsock
  line(ctx, P(7.6, 2.4, 0), P(7.6, 2.4, 14), 0x6a737a, 1.2);
  const [rx, ry] = P(7.6, 2.4, 15);
  ctx.g.ellipse(rx, ry, 5, 2).fill(0xdfe4e7).stroke({ color: 0x6a737a, width: 0.8 });
  line(ctx, P(7.7, 1.3, 0), P(7.7, 1.3, 12), 0x6a737a, 1);
  const [wx, wy] = P(7.7, 1.3, 12);
  ctx.g.poly([wx, wy - 1.5, wx + 9, wy + 0.5, wx + 9, wy + 2, wx, wy + 1.8]).fill(0xf28c28);
  // landside: drop-off lane, car park (bays shared with cityLife) and trees
  carPark(ctx, 8, 4, 3.45, 3, WHITE);
  pad(ctx, 2.2, 3.4, 6.4, 3.92, 0x5b6268);
  for (let u = 2.4; u < 6.3; u += 0.4) pad(ctx, u, 3.64, u + 0.2, 3.67, WHITE);
  for (const u of [6.7, 7.1, 7.5]) kit.smallTree(ctx, u, 3.6, 0.8, pal, false);
  // baggage tractor with carts on the apron
  box(ctx, 4.7, 2.18, 4.86, 2.3, 0, 4, 0xf2b705);
  for (const u of [4.9, 5.08]) box(ctx, u, 2.19, u + 0.14, 2.29, 0, 3.5, 0x9aa3aa);
  if (scottish) {
    // dry-stone planters along the drop-off lane
    for (const u of [2.4, 3.6, 4.8]) box(ctx, u, 3.36, u + 0.5, 3.42, 0, 3, 0x8d8371);
  } else {
    // fountain on the terminal forecourt
    const [fx, fy] = P(6.15, 3.65, 0);
    ctx.g.ellipse(fx, fy, 9, 4.5).fill(0xbdb6a6);
    ctx.g.ellipse(fx, fy - 1, 7.5, 3.6).fill(0x4fc3e6);
    line(ctx, [fx, fy - 1], [fx, fy - 9], 0xdff4fb, 1.6, 0.9);
  }
  drawFlagPole(ctx, P(2.05, 3.42, 1), scottish ? 0x1d4ed8 : 0xc8102e, 16);
}

function apartment(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette, seed: number): void {
  const scottish = style === 'scottish';
  const floors = scottish ? 3 + level : 4 + level * 1;
  const facades = ['cream', 'rose', 'sky', 'sage', 'ochre', 'white'] as const;
  const block: BuildingLook = {
    ...look, floors: 4, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'honey' : facades[seed % facades.length]!,
    roof: scottish ? 'gable' : 'flat', roofMaterial: scottish ? 'slate' : 'lead', windows: 'sash', door: 'double',
    tower: 'none', balcony: 'none', chimney: scottish ? 'twin' : 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xbdb8aa, 0.85);
  // front garden with a hedge and a bench
  pad(ctx, 0.1, 1.3, 1.9, 1.92, pal.snow ? 0xe9eef2 : 0x6f9a4f);
  line(ctx, P(0.1, 1.9), P(1.9, 1.9), 0x3e6b34, 2.4);
  pad(ctx, 0.9, 1.22, 1.1, 1.92, 0xcfc8b8);
  const { zTop } = kit.mass(ctx, block, 0.14, 0.14, 1.86, 1.2, {
    floors, roof: block.roof, door: 'L', doorT: 1.0, windows: 'sash', spacing: 0.26, chimneys: scottish, balcony: false, axis: 'u',
  });
  const L = faceL(0.14, 1.86, 1.2);
  const R = faceR(0.14, 1.2, 1.86);
  if (scottish) {
    // tenement: bay-window columns and a stair-tower door
    for (const t of [0.45, 1.55]) {
      for (let f = 1; f < floors; f++) box(ctx, t - 0.16, 1.2, t + 0.16, 1.3, f * 11 + 1, f * 11 + 10, shade(0xd8c39a, 1.02));
    }
  } else {
    // Turkish apartman: corner shop, balconies with laundry, dishes, solar water heaters
    quad(ctx, L, 0.16, 0.8, 0.4, 8.5, 0x5d666c);
    quad(ctx, L, 0.2, 0.76, 0.8, 8, 0x9fd3e6);
    ctx.lights.push([fp(L, 0.2, 0.8), fp(L, 0.76, 0.8), fp(L, 0.76, 8), fp(L, 0.2, 8)]);
    signBoard(ctx, L, 0.48, 9.6, 'BAKKAL', 0x2e7d32, WHITE, 0.95);
    for (let f = 1; f < floors; f++) {
      const z = f * 11;
      for (const t of [0.3, 1.25]) {
        box(ctx, t, 1.2, t + 0.42, 1.36, z, z + 1, 0xd9d4c8);
        line(ctx, P(t, 1.36, z + 4.5), P(t + 0.42, 1.36, z + 4.5), 0x5b6066, 0.9);
        for (let k = 0; k <= 4; k++) line(ctx, P(t + k * 0.105, 1.36, z + 1), P(t + k * 0.105, 1.36, z + 4.5), 0x5b6066, 0.5);
        if ((f + seed) % 3 === 0) {
          line(ctx, P(t + 0.02, 1.34, z + 8), P(t + 0.4, 1.34, z + 8), 0xdddddd, 0.5);
          PEOPLE.slice(0, 3).forEach((c, k) => quad(ctx, faceL(t, t + 0.42, 1.34), t + 0.06 + k * 0.12, t + 0.12 + k * 0.12, z + 4.8, z + 7.8, c));
        }
      }
      if ((f + seed) % 2 === 0) {
        const [dx, dy] = fp(R, 0.4, z + 7);
        ctx.g.ellipse(dx + 2, dy, 2.2, 2.6).fill(0xe8e8e8).stroke({ color: 0x9a9a9a, width: 0.5 });
      }
      box(ctx, 1.86, 0.75, 1.94, 0.88, z + 2, z + 5, 0xe6e6e0); // AC unit
    }
    for (const u of [0.35, 0.95]) {
      poly(ctx, [P(u, 0.3, zTop), P(u + 0.4, 0.3, zTop), P(u + 0.4, 0.55, zTop + 6), P(u, 0.55, zTop + 6)], 0x26354a);
      box(ctx, u + 0.05, 0.62, u + 0.35, 0.74, zTop, zTop + 5, 0xf0f0f0);
    }
  }
  person(ctx, 1.2, 1.5, seed);
  kit.smallTree(ctx, 0.3, 1.6, 0.8, pal, false);
  kit.smallTree(ctx, 1.7, 1.6, 0.75, pal, false);
}

function park(ctx: DrawCtx, kit: CityKit, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const lawn = pal.snow ? 0xe9eef2 : scottish ? 0x6c9a52 : 0x7fae55;
  pad(ctx, 0.04, 0.04, 1.96, 1.96, lawn);
  const path = scottish ? 0xc9bfa6 : 0xe3d3ae;
  pad(ctx, 0.9, 0.04, 1.1, 1.96, path);
  pad(ctx, 0.04, 0.9, 1.96, 1.1, path);
  // flower beds in the four lawns
  for (const [u, v] of [[0.3, 0.3], [1.35, 0.3], [0.3, 1.35], [1.35, 1.35]] as const) {
    pad(ctx, u, v, u + 0.35, v + 0.12, 0x8a5a36);
    for (let k = 0; k < 4; k++) {
      const [x, y] = P(u + 0.05 + k * 0.08, v + 0.06, 1);
      ctx.g.circle(x, y, 1.3).fill([0xe74c3c, 0xf1c40f, 0x9b59b6, 0xff7fbf][k]!);
    }
  }
  // fountain
  const [fx, fy] = P(1, 1, 0);
  ctx.g.ellipse(fx, fy, 14, 7).fill(0xbdb6a6);
  ctx.g.ellipse(fx, fy - 1.5, 11.5, 5.6).fill(0x4fb8dc);
  glowPane(ctx, [[fx - 2, fy - 3], [fx + 2, fy - 3], [fx + 2, fy - 1], [fx - 2, fy - 1]], 0x9ee6ff, 0.6);
  box(ctx, 0.95, 0.95, 1.05, 1.05, 0, 7, 0xd8d0bf);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    line(ctx, [fx, fy - 9], [fx + Math.cos(a) * 6, fy - 4 + Math.sin(a) * 2.5], 0xdff4fb, 1, 0.8);
  }
  if (scottish) {
    // Victorian bandstand: octagonal deck, cast-iron columns, ogee roof
    const [bx, by] = P(1.55, 0.5, 0);
    ctx.g.ellipse(bx, by, 11, 5.5).fill(0xb7ab92);
    ctx.g.ellipse(bx, by - 2, 10, 5).fill(0xd8cdb4);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = bx + Math.cos(a) * 8.5, y = by - 2 + Math.sin(a) * 4.2;
      ctx.g.moveTo(x, y).lineTo(x, y - 12).stroke({ color: 0x2f4f3f, width: 1 });
    }
    ctx.g.ellipse(bx, by - 14, 11, 5).fill(0x2f4f3f);
    ctx.g.poly([bx - 11, by - 14, bx, by - 24, bx + 11, by - 14]).fill(0x3d6b52);
    lamp(ctx, [bx, by - 9], 0xfff2c0, 1.2);
    person(ctx, 1.55, 0.5, 6, false, 2);
  } else {
  // playground: slide, swings
  box(ctx, 1.4, 0.2, 1.5, 0.3, 0, 10, 0xe67e22);
  poly(ctx, [P(1.5, 0.22, 10), P(1.82, 0.22, 2), P(1.82, 0.3, 2), P(1.5, 0.3, 10)], 0xf1c40f);
  for (const v of [0.5, 0.72]) line(ctx, P(1.4, v, 0), P(1.4, v, 11), 0x2c3e50, 1);
  line(ctx, P(1.4, 0.5, 11), P(1.4, 0.72, 11), 0x2c3e50, 1);
  for (const v of [0.56, 0.66]) {
    line(ctx, P(1.4, v, 11), P(1.4, v, 4), 0x7f8c8d, 0.5);
    box(ctx, 1.37, v - 0.02, 1.43, v + 0.02, 3.5, 4.3, 0xc0392b);
  }
  person(ctx, 1.62, 0.6, 3);
  person(ctx, 1.3, 0.6, 6);
  }
  // benches with people, lamps and trees
  for (const [u, v, i] of [[0.75, 0.5, 1], [0.6, 1.5, 4], [1.5, 1.25, 7]] as const) {
    box(ctx, u - 0.12, v, u + 0.12, v + 0.06, 2.2, 2.8, 0x8a5a36);
    box(ctx, u - 0.12, v, u + 0.12, v + 0.015, 2.8, 5, 0x8a5a36);
    person(ctx, u, v + 0.04, i, true);
  }
  for (const [u, v] of [[0.86, 0.86], [1.14, 1.14], [0.86, 1.14], [1.14, 0.86]] as const) {
    line(ctx, P(u, v, 0), P(u, v, 12), 0x2f3a40, 0.9);
    lamp(ctx, P(u, v, 12.5), 0xfff2c0, 1.1);
  }
  for (const [u, v, sz] of [[0.25, 0.65, 1.1], [0.55, 0.22, 0.9], [0.25, 1.75, 1], [1.75, 1.75, 1.15], [1.75, 0.85, 0.9]] as const)
    kit.smallTree(ctx, u, v, sz, pal, false);
  person(ctx, 1.0, 1.55, 2);
  person(ctx, 0.4, 1.0, 5);
}

function gasStation(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const brand = scottish ? 0x00843d : 0xe30613;
  const second = scottish ? 0xf6c800 : 0xffffff;
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0x7d8388, 1);
  pad(ctx, 0.06, 1.2, 1.94, 1.96, ASPHALT);
  // shop at the back
  const shop: BuildingLook = { ...look, floors: 1, wall: 'plaster', facade: 'white', roof: 'flat', roofMaterial: 'lead', windows: 'small', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none' };
  const { zTop } = kit.mass(ctx, shop, 0.14, 0.14, 1.86, 0.85, { roof: 'flat', door: null, windows: 'small', chimneys: false, balcony: false });
  const SL = faceL(0.14, 1.86, 0.85);
  glazing(ctx, SL, 0.3, 1.7, 0.5, 9, 5, 1, 0x9fd3e6, 0x5d666c);
  quad(ctx, SL, 0.14, 1.86, zTop - 3, zTop, brand);
  // pump islands between the bays
  for (const u of [0.7, 1.25]) {
    box(ctx, u - 0.06, 1.42, u + 0.06, 1.95, 0, 1.2, 0xcfd3d6);
    for (const v of [1.55, 1.8]) {
      box(ctx, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 1.2, 9, 0xeeeeee);
      box(ctx, u - 0.042, v - 0.042, u + 0.042, v + 0.042, 7, 9, brand);
      glowPane(ctx, [P(u - 0.04, v + 0.04, 4), P(u + 0.04, v + 0.04, 4), P(u + 0.04, v + 0.04, 6), P(u - 0.04, v + 0.04, 6)], 0x9be3ff);
    }
  }
  // canopy on four posts, lit from below
  const CZ = 17;
  for (const [u, v] of [[0.2, 1.3], [1.8, 1.3], [0.2, 1.92], [1.8, 1.92]] as const) box(ctx, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, CZ, 0xdfe3e6);
  box(ctx, 0.08, 1.2, 1.92, 1.98, CZ, CZ + 3.5, second);
  const C = faceL(0.08, 1.92, 1.98);
  quad(ctx, C, 0.08, 1.92, CZ, CZ + 3.5, brand);
  signBoard(ctx, C, 1.0, CZ + 0.8, 'AKARYAKIT', brand, second, 0.75);
  for (const u of [0.5, 1.0, 1.5]) lamp(ctx, P(u, 1.6, CZ - 0.5), 0xffffff, 1.4);
  // price pylon at the corner
  box(ctx, 0.06, 0.95, 0.2, 1.1, 0, 30, brand);
  const pylon = faceL(0.06, 0.2, 1.1);
  for (const [z, txt] of [[24, '45'], [18, '42']] as const) {
    quad(ctx, pylon, 0.07, 0.19, z - 1, z + 4.5, 0x111111);
    ctx.glowColor = 0xffb300;
    signBoard(ctx, pylon, 0.13, z, txt, 0x111111, 0xffb300, 0.6);
    ctx.glowColor = undefined;
  }
  // air and water stand
  box(ctx, 1.84, 0.95, 1.94, 1.1, 0, 6, 0x2c7be5);
  if (scottish) {
    // jet-wash bay on the side of the shop
    box(ctx, 1.5, 0.88, 1.8, 1.16, 0, 1, 0x6b737a);
    for (const u of [1.52, 1.78]) box(ctx, u - 0.02, 0.9, u + 0.02, 1.14, 1, 11, 0x9aa3aa);
    box(ctx, 1.5, 0.88, 1.8, 1.16, 11, 12.5, brand);
  } else {
    // tea stand with stools for the attendants
    box(ctx, 1.5, 0.9, 1.7, 1.02, 0, 5, 0x8a5a36);
    const [x, y] = P(1.6, 0.96, 5.5);
    ctx.g.circle(x, y, 1).fill(0xc0392b);
    for (const u of [1.55, 1.68]) box(ctx, u, 1.06, u + 0.05, 1.11, 0, 2.2, 0x5b4632);
    person(ctx, 1.74, 1.1, 3, true);
  }
}

function pharmacy(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle): void {
  const scottish = style === 'scottish';
  const GREEN = 0x00a651;
  const shop: BuildingLook = {
    ...look, floors: 2, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'cream' : 'white',
    roof: scottish ? 'gable' : 'flat', roofMaterial: scottish ? 'slate' : 'lead', windows: 'sash', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 0.96, 0.96, 0xc8c3b6, 0.9);
  kit.mass(ctx, shop, 0.1, 0.1, 0.9, 0.78, { roof: shop.roof, door: null, windows: 'sash', spacing: 0.3, chimneys: false, balcony: false });
  const L = faceL(0.1, 0.9, 0.78);
  glazing(ctx, L, 0.16, 0.84, 0.5, 8.5, 3, 1, 0xd8f3e4, 0x2f6f4f);
  quad(ctx, L, 0.43, 0.57, 0.4, 8.2, 0x2f6f4f);
  signBoard(ctx, L, 0.5, 10.2, 'ECZANE', WHITE, GREEN, 0.95);
  // green neon cross on a bracket
  const [x, y] = fp(faceR(0.1, 0.78, 0.9), 0.55, 17);
  line(ctx, [x - 1, y + 3], [x + 4, y + 3], 0x59636a, 1);
  const cx = x + 5, cy = y;
  for (const [w, h] of [[2.2, 7], [7, 2.2]] as const) glowPane(ctx, [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], GREEN);
  person(ctx, 0.3, 0.88, 2);
}

function bakery(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, level: number): void {
  const scottish = style === 'scottish';
  const shop: BuildingLook = {
    ...look, floors: level >= 2 ? 2 : 1, wall: scottish ? 'granite' : 'stone_timber', facade: scottish ? 'grey' : 'honey',
    roof: scottish ? 'gable' : 'hip', roofMaterial: scottish ? 'slate' : 'clay', windows: 'small', door: 'plank', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 0.96, 0.96, 0xc9bfa9, 0.9);
  const { zTop } = kit.mass(ctx, shop, 0.1, 0.1, 0.9, 0.74, { roof: shop.roof, door: null, windows: 'small', spacing: 0.3, chimneys: false, balcony: false, axis: 'u' });
  const L = faceL(0.1, 0.9, 0.74);
  quad(ctx, L, 0.16, 0.84, 0.5, 7.5, 0x6b4a2b);
  quad(ctx, L, 0.2, 0.8, 1, 7, 0xffd9a0);
  ctx.lights.push([fp(L, 0.2, 1), fp(L, 0.8, 1), fp(L, 0.8, 7), fp(L, 0.2, 7)]);
  // loaves and simit on the display shelf
  for (let k = 0; k < 5; k++) {
    const [x, y] = fp(L, 0.26 + k * 0.12, 3);
    if (k % 2) ctx.g.circle(x, y, 1.6).stroke({ color: 0xb5651d, width: 1.1 });
    else ctx.g.ellipse(x, y, 2.2, 1.2).fill(0xc68642);
  }
  kit.awning(ctx, 0.12, 0.88, 0.74, 9.5, scottish ? 0x1e3a8a : 0xb71c1c, WHITE);
  signBoard(ctx, L, 0.5, (level >= 2 ? 14 : 10.5) + 1, 'FIRIN', 0x6b3e1f, 0xffe2a8, 0.95);
  // oven chimney with smoke
  box(ctx, 0.66, 0.2, 0.8, 0.34, zTop - 4, zTop + 10, scottish ? 0x6f675a : 0xa65b45);
  ctx.smoke.push(P(0.73, 0.27, zTop + 11));
  // bread cart / simit seller outside
  box(ctx, 0.12, 0.8, 0.34, 0.92, 2, 5, 0xc0392b);
  for (const u of [0.15, 0.31]) {
    const [x, y] = P(u, 0.92, 1.5);
    ctx.g.circle(x, y, 1.4).fill(0x333333);
  }
  person(ctx, 0.42, 0.86, 4);
}

function bank(ctx: DrawCtx, kit: CityKit, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const stone = scottish ? 0xcbb894 : 0xe7e1d3;
  const hall: BuildingLook = {
    ...look, floors: 3, wall: scottish ? 'sandstone' : 'plaster', facade: scottish ? 'honey' : 'white', roof: scottish ? 'hip' : 'flat',
    roofMaterial: scottish ? 'slate' : 'lead', windows: 'arched', door: 'double', tower: 'none', balcony: 'none', chimney: 'none', decor: 'none',
  };
  pad(ctx, 0.04, 0.04, 1.96, 1.96, 0xc8c3b6, 0.9);
  pad(ctx, 0.1, 1.3, 1.9, 1.92, 0xd8d2c4);
  const { zTop } = kit.mass(ctx, hall, 0.16, 0.14, 1.84, 1.05, { roof: hall.roof, door: 'L', doorT: 1.0, windows: 'arched', spacing: 0.3, chimneys: false, balcony: false });
  // classical portico: steps, six columns, entablature with the name, pediment
  for (let k = 0; k < 3; k++) box(ctx, 0.36 - k * 0.04, 1.05, 1.64 + k * 0.04, 1.34 + k * 0.05, k * 1.2, (k + 1) * 1.2, shade(stone, 1 - k * 0.04));
  const top = 24;
  for (let k = 0; k < 6; k++) {
    const u = 0.44 + k * 0.224;
    box(ctx, u - 0.035, 1.2, u + 0.035, 1.27, 3.6, top, shade(stone, 1.04));
    line(ctx, P(u, 1.27, 3.6), P(u, 1.27, top), shade(stone, 0.85), 0.5);
  }
  box(ctx, 0.36, 1.05, 1.64, 1.3, top, top + 5, stone);
  const F = faceL(0.36, 1.64, 1.3);
  signBoard(ctx, F, 1.0, top + 1, 'BANKA', stone, scottish ? 0x1e3a8a : 0x7b1e3a, 1.1);
  poly(ctx, [P(0.36, 1.3, top + 5), P(1.64, 1.3, top + 5), P(1.0, 1.3, top + 11)], shade(stone, 1.06));
  poly(ctx, [P(0.36, 1.05, top + 5), P(0.36, 1.3, top + 5), P(1.0, 1.3, top + 11), P(1.0, 1.05, top + 11)], shade(stone, 0.9));
  // ATM on the side wall, gold lamps, flag
  const R = faceR(0.14, 1.05, 1.84);
  quad(ctx, R, 0.6, 0.8, 3, 9, 0x2b3a4a);
  glowPane(ctx, [fp(R, 0.63, 6), fp(R, 0.77, 6), fp(R, 0.77, 8.3), fp(R, 0.63, 8.3)], 0x6fd3ff);
  for (const u of [0.3, 1.7]) {
    line(ctx, P(u, 1.6, 0), P(u, 1.6, 12), 0x3b3b3b, 1);
    lamp(ctx, P(u, 1.6, 12.6), 0xffe08a, 1.2);
  }
  drawFlagPole(ctx, P(1.0, 0.5, zTop + (scottish ? 8 : 1)), scottish ? 0x1d4ed8 : 0xc8102e, 10);
  kit.smallTree(ctx, 0.2, 1.75, 0.7, pal, false);
  kit.smallTree(ctx, 1.8, 1.75, 0.7, pal, false);
  person(ctx, 1.25, 1.55, 6);
}

function mall(ctx: DrawCtx, kit: CityKit, style: ArchitectureStyle, pal: SeasonPalette): void {
  const scottish = style === 'scottish';
  const brand = scottish ? 0x6d28d9 : 0xe4572e;
  pad(ctx, 0.04, 0.04, 2.96, 2.96, 0xbdbab0, 0.95);
  carPark(ctx, 3, 3, 2.2, 5, WHITE);
  // main box
  const H = 30;
  const wall = scottish ? 0xb9a98a : 0xe8e2d6;
  box(ctx, 0.15, 0.15, 2.85, 1.95, 0, H, wall);
  box(ctx, 0.12, 0.12, 2.88, 1.98, H, H + 2, shade(wall, 0.75));
  const L = faceL(0.15, 2.85, 1.95);
  const R = faceR(0.15, 1.95, 2.85);
  // shop fronts on both faces and a two-storey glass atrium in the middle
  glazing(ctx, L, 0.25, 1.1, 1, 11, 3, 1, 0xa6d8ea, 0x4c565c);
  glazing(ctx, L, 1.9, 2.75, 1, 11, 3, 1, 0xa6d8ea, 0x4c565c);
  glazing(ctx, R, 0.3, 1.85, 1, 11, 4, 1, 0xa6d8ea, 0x4c565c);
  box(ctx, 1.15, 1.95, 1.85, 2.12, 0, H + 6, 0x8cc7de);
  const A = faceL(1.15, 1.85, 2.12);
  glazing(ctx, A, 1.15, 1.85, 0.5, H + 5.5, 4, 4, 0xbfe6f2, 0x5d6b73);
  glazing(ctx, faceR(1.95, 2.12, 1.85), 1.95, 2.12, 0.5, H + 5.5, 1, 4, 0xbfe6f2, 0x5d6b73);
  // brand fascia, big sign and store logos
  quad(ctx, L, 0.15, 1.15, H - 9, H - 1, brand);
  quad(ctx, L, 1.85, 2.85, H - 9, H - 1, brand);
  quad(ctx, R, 0.15, 1.95, H - 9, H - 1, shade(brand, 0.8));
  ctx.glowColor = 0xffffff;
  signBoard(ctx, faceL(0.15, 1.15, 1.95), 0.65, H - 7.2, 'AVM', brand, WHITE, 1.6);
  ctx.glowColor = undefined;
  for (const [t, c] of [[2.1, 0xffcc00], [2.45, 0x00a3e0]] as const) {
    const [x, y] = fp(L, t, H - 5);
    ctx.g.circle(x, y, 3).fill(c);
  }
  // cinema poster wall on the side
  for (const [t, c] of [[0.45, 0x1b1b3a], [0.95, 0x7a1f1f], [1.45, 0x1f4d3a]] as const) {
    quad(ctx, R, t, t + 0.3, 13, 24, c);
    glowPane(ctx, [fp(R, t + 0.03, 13.5), fp(R, t + 0.27, 13.5), fp(R, t + 0.27, 14.5), fp(R, t + 0.03, 14.5)], 0xffd36b);
  }
  // rooftop: plant, skylight; Scottish centres keep a glazed Victorian arcade roof
  rooftopUnits(ctx, 0.4, 0.4, H + 2, 4);
  if (scottish) {
    for (let k = 0; k < 4; k++) {
      const u = 0.3 + k * 0.22;
      poly(ctx, [P(u, 1.5, H + 2), P(u + 0.11, 1.5, H + 8), P(u + 0.11, 1.85, H + 8), P(u, 1.85, H + 2)], 0xa6d8ea);
      poly(ctx, [P(u + 0.11, 1.5, H + 8), P(u + 0.22, 1.5, H + 2), P(u + 0.22, 1.85, H + 2), P(u + 0.11, 1.85, H + 8)], 0x7fb3c7);
    }
  } else {
    // rooftop food-court terrace with parasols
    for (const u of [0.5, 0.85]) {
      line(ctx, P(u, 1.65, H + 2), P(u, 1.65, H + 10), 0x6b5a48, 0.8);
      const [px, py] = P(u, 1.65, H + 10);
      ctx.g.poly([px - 6, py + 2, px, py - 2, px + 6, py + 2]).fill(u < 0.7 ? brand : WHITE);
    }
  }
  poly(ctx, [P(1.3, 0.6, H + 2.2), P(2.4, 0.6, H + 2.2), P(2.4, 1.4, H + 2.2), P(1.3, 1.4, H + 2.2)], 0x8cc7de, 0.85);
  // entrance plaza: trees, shoppers with bags
  pad(ctx, 1.1, 2.12, 1.9, 2.2, 0xd8d2c4);
  for (const u of [0.3, 2.7]) kit.smallTree(ctx, u, 2.08, 0.85, pal, false);
  for (let i = 0; i < 4; i++) person(ctx, 1.2 + i * 0.17, 2.16 + (i % 2) * 0.02, i + 2);
  line(ctx, P(0.12, 2.15, 0), P(0.12, 2.15, 34), 0x59636a, 1.4);
  box(ctx, 0.05, 2.05, 0.19, 2.25, 34, 44, brand);
  ctx.glowColor = 0xffffff;
  signBoard(ctx, faceL(0.05, 0.19, 2.25), 0.12, 37, 'AVM', brand, WHITE, 0.6);
  ctx.glowColor = undefined;
}

/** Draws a detailed city building; returns false for ids handled elsewhere. */
export function drawDetailedCity(
  ctx: DrawCtx, kit: CityKit, id: BuildingId, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette, level = 1,
): boolean {
  switch (id) {
    case 'apartment': apartment(ctx, kit, look, style, level, pal, ctx.seed); return true;
    case 'park': park(ctx, kit, style, pal); return true;
    case 'gas_station': gasStation(ctx, kit, look, style); return true;
    case 'pharmacy': pharmacy(ctx, kit, look, style); return true;
    case 'bakery': bakery(ctx, kit, look, style, level); return true;
    case 'bank': bank(ctx, kit, look, style, pal); return true;
    case 'mall': mall(ctx, kit, style, pal); return true;
    case 'hospital': hospital(ctx, kit, look, style, pal); return true;
    case 'police_station': policeStation(ctx, kit, look, style); return true;
    case 'fire_station': fireStation(ctx, kit, look, style); return true;
    case 'market': market(ctx, kit, look, style); return true;
    case 'restaurant': restaurant(ctx, kit, look, style, pal); return true;
    case 'club': club(ctx, style); return true;
    case 'hotel': hotel(ctx, kit, look, style, pal); return true;
    case 'factory': factory(ctx, kit, look, style); return true;
    case 'airport': airport(ctx, kit, style, pal); return true;
    default: return false;
  }
}
