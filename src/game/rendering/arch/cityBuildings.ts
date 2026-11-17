import type { ArchitectureStyle, BuildingId } from '../../core/types';
import { P, shade } from '../iso';
import type { Pt } from '../iso';
import { box, line, poly, quad, faceL, drawFlagPole, drawDome } from './kit';
import type { DrawCtx } from './kit';

// Tiny original vector lettering stays legible in cached sprites, without per-frame DOM text.
export const LETTERS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['10101', '11111', '10101', '10101', '10101'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '001'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
};
function sign(
  ctx: DrawCtx,
  text: string,
  u: number,
  v: number,
  z: number,
  width: number,
  color: number,
): void {
  const glyphs = [...text].map((c) => LETTERS[c] ?? LETTERS.I!);
  const cols = glyphs.reduce((n, g) => n + g[0]!.length + 1, 0);
  const step = width / cols;
  const f = faceL(u, u + width, v);
  quad(ctx, f, u - 0.04, u + width + 0.04, z - 1, z + 8, color);
  let x = u;
  for (const glyph of glyphs) {
    glyph.forEach((row, j) =>
      [...row].forEach((bit, i) => {
        if (bit === '1')
          quad(ctx, f, x + i * step, x + (i + 0.8) * step, z + 6 - j * 1.25, z + 7 - j * 1.25, 0xffffff);
      }),
    );
    x += (glyph[0]!.length + 1) * step;
  }
}

export const CITY_BUILDINGS: Partial<Record<BuildingId, string>> = {
  hospital: 'HASTANE',
  police_station: 'POLIS',
  fire_station: 'ITFAIYE',
  corporate_plaza: 'PLAZA',
  aquapark: 'AQUAPARK',
  market: 'MARKET',
  factory: 'FABRIKA',
  hotel: 'OTEL',
  club: 'CLUB',
  restaurant: 'RESTORAN',
  airport: 'HAVALIMANI',
};

/** Draws a tubular water slide curving from tower `(u0,v0,z0)` down into splash pool `(u1,v1,z1)`. */
function drawWaterSlideTube(
  ctx: DrawCtx,
  u0: number,
  v0: number,
  z0: number,
  uMid: number,
  vMid: number,
  zMid: number,
  u1: number,
  v1: number,
  z1: number,
  mainColor: number,
  bandColor: number,
): void {
  const steps = 10;
  let prev: Pt = P(u0, v0, z0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const u = inv * inv * u0 + 2 * inv * t * uMid + t * t * u1;
    const v = inv * inv * v0 + 2 * inv * t * vMid + t * t * v1;
    const z = inv * inv * z0 + 2 * inv * t * zMid + t * t * z1;
    const cur = P(u, v, z);
    line(ctx, prev, cur, shade(mainColor, 0.75), 4.4);
    line(ctx, prev, cur, i % 2 === 0 ? mainColor : bandColor, 3.1);
    prev = cur;
  }
  // White splash foam at slide exit
  const splash = P(u1, v1, z1);
  ctx.g.ellipse(splash[0], splash[1], 4.5, 2.3).fill({ color: 0xe0f2fe, alpha: 0.9 });
  ctx.lights.push([
    [splash[0] - 2, splash[1] - 1],
    [splash[0] + 2, splash[1] - 1],
    [splash[0] + 2, splash[1] + 1],
    [splash[0] - 2, splash[1] + 1],
  ]);
}

export function drawCityBuilding(
  ctx: DrawCtx,
  id: BuildingId,
  style: ArchitectureStyle = 'turkish',
  level = 1,
): boolean {
  const title = CITY_BUILDINGS[id];
  if (!title) return false;
  const scottish = style === 'scottish';
  const lvl = Math.max(1, Math.min(5, level));
  const garden = (width: number, depth: number): void => {
    const count = scottish ? 2 : style === 'turkish' ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const v = depth - 0.25 - i * 0.18;
      box(ctx, width - 0.14, v, width - 0.03, v + 0.1, 1, 4, scottish ? 0x7d8082 : 0x9d8565);
      box(ctx, width - 0.13, v + 0.01, width - 0.04, v + 0.09, 4, 6 + lvl * 0.5, scottish ? 0x3f6a4e : 0x56764d);
    }
  };

  // ------------------------------------------------------------------ 1. AIRPORT (AYT / Turnhouse)
  if (id === 'airport') {
    box(ctx, 0.05, 0.05, 7.95, 3.95, 0, 1, scottish ? 0x7c8b84 : 0x869a86);
    box(ctx, 0.15, 0.2, 7.85, 1.25, 1, 2, 0x394452);
    for (let u = 0.3; u < 7.8; u += 0.55) {
      line(ctx, P(u, 0.72, 2.2), P(u + 0.25, 0.72, 2.2), 0xffffff, 1.3);
      for (const v of [0.23, 1.22]) {
        const at = P(u, v, 3);
        ctx.g.circle(...at, 1.2).fill(0x68d9ff);
        ctx.lights.push([
          P(u - 0.025, v - 0.025, 3),
          P(u + 0.025, v - 0.025, 3),
          P(u + 0.025, v + 0.025, 3),
          P(u - 0.025, v + 0.025, 3),
        ]);
      }
    }
    box(ctx, 0.4, 1.4, 7.5, 1.75, 1, 2, 0x67717c); // taxiway
    const termH = 22 + lvl * 3;
    const termColor = scottish ? 0xcfd6dc : 0xd9e8ed;
    const roofColor = scottish ? 0x334155 : 0x176279;
    box(ctx, 2, 2, 6.3, 3.6, 1, termH, termColor);
    box(ctx, 1.94, 1.94, 6.36, 3.66, termH, termH + 3, roofColor);
    // Solar panel array on terminal roof (levels 3-5)
    if (lvl >= 3) {
      for (let su = 2.3; su < 5.9; su += 0.65) {
        box(ctx, su, 2.25, su + 0.48, 3.2, termH + 3, termH + 3.8, 0x1e3a8a);
      }
    }
    for (let u = 2.15; u < 6; u += 0.4) quad(ctx, faceL(2, 6.3, 3.61), u, u + 0.28, 6, termH - 3, 0x4b94ae);
    const towerTop = (scottish ? 52 : 48) + lvl * 4;
    box(ctx, 6.8, 2.7, 7.2, 3.1, 1, towerTop, 0xbbc9d1);
    box(ctx, 6.55, 2.45, 7.45, 3.35, towerTop, towerTop + 12, 0x326c85);
    box(ctx, 6.5, 2.4, 7.5, 3.4, towerTop + 12, towerTop + 14, 0xe2ebed);
    sign(ctx, title, 2.15, 3.62, termH + 1, 3.9, scottish ? 0x1e3a8a : 0x176279);
    drawFlagPole(ctx, P(1.6, 3.5, 1), scottish ? 0x1d4ed8 : 0xd23a32, 14);
    garden(8, 4);
    return true;
  }

  // ------------------------------------------------------------------ 2. CORPORATE PLAZA (Büyük Şirket Plazası, 5 Levels)
  if (id === 'corporate_plaza') {
    const w = 2;
    box(ctx, 0.04, 0.04, 1.96, 1.96, 0, 1.5, scottish ? 0x94a3b8 : 0xcbd5e1);
    // Forecourt marble plaza & reflective water feature
    poly(ctx, [P(0.14, 1.38, 1.6), P(0.75, 1.38, 1.6), P(0.75, 1.86, 1.6), P(0.14, 1.86, 1.6)], 0x38bdf8, 0.85);
    // Podium lobby base
    const podH = 16 + lvl * 2;
    const podColor = scottish ? 0x475569 : 0xe2e8f0;
    box(ctx, 0.14, 0.14, 1.86, 1.32, 1.5, podH, podColor);
    box(ctx, 0.1, 0.1, 1.9, 1.36, podH, podH + 2.5, 0x1e293b);

    // Main glass curtain-wall skyscraper tower rising from podium (scales taller every level 1..5!)
    const towerH = 38 + lvl * 11; // 49, 60, 71, 82, 93
    const glassMain = scottish ? 0x1e3a8a : 0x0284c7;
    const mullion = scottish ? 0xcbd5e1 : 0xf1f5f9;
    box(ctx, 0.24, 0.18, 1.76, 1.16, podH + 2.5, towerH, glassMain);

    // Upper setback penthouse tier on levels 3..5
    const topZ = lvl >= 3 ? towerH + 8 + (lvl - 2) * 3 : towerH;
    if (lvl >= 3) {
      box(ctx, 0.36, 0.26, 1.64, 1.06, towerH, topZ, shade(glassMain, 1.12));
    }
    // Roof crown & helipad (H) on levels 4..5
    box(ctx, 0.22, 0.16, 1.78, 1.18, towerH - 2, towerH + 1, mullion);
    if (lvl >= 4) {
      poly(ctx, [P(0.65, 0.45, topZ + 0.5), P(1.35, 0.45, topZ + 0.5), P(1.35, 0.9, topZ + 0.5), P(0.65, 0.9, topZ + 0.5)], 0x334155);
      line(ctx, P(0.88, 0.55, topZ + 1), P(0.88, 0.8, topZ + 1), 0xfacc15, 1.4);
      line(ctx, P(1.12, 0.55, topZ + 1), P(1.12, 0.8, topZ + 1), 0xfacc15, 1.4);
      line(ctx, P(0.88, 0.67, topZ + 1), P(1.12, 0.67, topZ + 1), 0xfacc15, 1.4);
    }
    // Communications spire
    line(ctx, P(1.0, 0.65, topZ), P(1.0, 0.65, topZ + 14), 0xe2e8f0, 1.6);
    ctx.g.circle(...P(1.0, 0.65, topZ + 15), 1.6).fill(0xff2e4c);

    // Curtain-wall horizontal & vertical mullions + glowing office windows
    const fTower = faceL(0.24, 1.76, 1.165);
    for (let z = podH + 5; z < towerH - 4; z += 9) {
      line(ctx, P(0.24, 1.165, z), P(1.76, 1.165, z), mullion, 0.9, 0.8);
      for (let u = 0.3; u < 1.68; u += 0.28) {
        quad(ctx, fTower, u, u + 0.2, z + 1, z + 7, 0x38bdf8);
        ctx.lights.push([
          P(u, 1.17, z + 1),
          P(u + 0.2, 1.17, z + 1),
          P(u + 0.2, 1.17, z + 7),
          P(u, 1.17, z + 7),
        ]);
      }
    }
    // Revolving glass entrance canopy
    box(ctx, 0.72, 1.32, 1.28, 1.56, 9, 11.5, 0x0ea5e9);
    sign(ctx, title, 0.32, 1.33, podH - 8, 1.36, scottish ? 0x1e3a8a : 0x0f172a);
    garden(w, w);
    return true;
  }

  // ------------------------------------------------------------------ 3. AQUAPARK (Palomaqua & Grida Splash Park, 5 Levels)
  if (id === 'aquapark') {
    const w = 2;
    // Sandy & landscaped pine resort park pad (Splash Park Grida-1.pdf)
    box(ctx, 0.04, 0.04, 1.96, 1.96, 0, 1.2, scottish ? 0xc2b8a3 : 0xe6d7b9);
    // Multi-lobed turquoise Splash & Lagoon Pools (Aqua Tower Pool & Relax Pool)
    poly(ctx, [P(0.55, 0.72, 1.3), P(1.88, 0.72, 1.3), P(1.88, 1.86, 1.3), P(0.55, 1.86, 1.3)], 0xf8fafc);
    poly(ctx, [P(0.6, 0.77, 1.4), P(1.83, 0.77, 1.4), P(1.83, 1.81, 1.4), P(0.6, 1.81, 1.4)], 0x38bdf8);
    poly(ctx, [P(0.68, 0.85, 1.45), P(1.45, 0.85, 1.45), P(1.45, 1.65, 1.45), P(0.68, 1.65, 1.45)], 0x7dd3fc);

    // Circular wooden sunbed decks (Grida Splash Park wooden islands)
    for (const [du, dv] of [[0.28, 1.55], [0.28, 1.18]] as const) {
      const deckPt = P(du, dv, 1.5);
      ctx.g.ellipse(deckPt[0], deckPt[1], 8.5, 4.2).fill(0xc89d66);
      ctx.g.rect(deckPt[0] - 4, deckPt[1] - 2, 3, 1.6).fill(0xffffff);
      ctx.g.rect(deckPt[0] + 1, deckPt[1] - 1.5, 3, 1.6).fill(0xffffff);
    }

    // Timber-framed Multi-Story Slide Launch Tower (top-left of footprint, scaling with level 1..5)
    const towerZ = 26 + lvl * 5; // 31..46
    box(ctx, 0.14, 0.14, 0.68, 0.68, 1.2, towerZ, 0x8c5a32);
    // Wooden slat facade & observation deck
    box(ctx, 0.1, 0.1, 0.72, 0.72, towerZ - 6, towerZ, 0xa47143);
    // Pitched wooden roof over the launch tower (Splash Park Grida-1.pdf)
    poly(ctx, [P(0.08, 0.08, towerZ), P(0.74, 0.08, towerZ), P(0.41, 0.41, towerZ + 10)], 0x6e4726);
    poly(ctx, [P(0.74, 0.08, towerZ), P(0.74, 0.74, towerZ), P(0.41, 0.41, towerZ + 10)], 0x54341a);

    // Spiralling tubular water slides (Yellow-White Windigo, Orange-White Blackhole, Green Surf Safari, Blue Aquatube)
    drawWaterSlideTube(ctx, 0.58, 0.52, towerZ - 4, 0.22, 1.05, towerZ * 0.55, 0.82, 1.32, 2, 0xfacc15, 0xffffff);
    drawWaterSlideTube(ctx, 0.62, 0.35, towerZ - 7, 1.25, 0.32, towerZ * 0.5, 1.18, 1.12, 2, 0xf97316, 0xffffff);
    if (lvl >= 2) {
      drawWaterSlideTube(ctx, 0.48, 0.62, towerZ - 10, 0.95, 0.95, towerZ * 0.4, 1.42, 1.48, 2, 0x10b981, 0xd1fae5);
    }
    if (lvl >= 3) {
      drawWaterSlideTube(ctx, 0.66, 0.25, towerZ - 3, 1.65, 0.45, towerZ * 0.6, 1.62, 1.25, 2, 0x0284c7, 0xe0f2fe);
    }
    // Kids Aquatower & Tipping Splash Bucket on levels 4..5
    if (lvl >= 4) {
      box(ctx, 1.45, 0.22, 1.78, 0.55, 1.2, 18, 0xf59e0b);
      ctx.g.circle(...P(1.61, 0.38, 21), 3.2).fill(0xef4444);
    }

    sign(ctx, title, 0.14, 0.72, 12, 0.95, 0x0284c7);
    garden(w, w);
    return true;
  }

  // ------------------------------------------------------------------ 4. HOTEL (5 Distinct Real Hotel Concepts for Levels 1..5)
  if (id === 'hotel') {
    const w = 2;
    box(ctx, 0.04, 0.04, 1.96, 1.96, 0, 1.2, scottish ? 0x94a3b8 : 0xd6cbb5);

    if (lvl === 1) {
      // Level 1: Fourhills Boutique Hotel & Traditional Turkish Hammam
      box(ctx, 0.14, 0.16, 1.32, 1.12, 1.2, 28, scottish ? 0xc4b59b : 0xf3e8d2);
      box(ctx, 0.1, 0.12, 1.36, 1.16, 28, 32, scottish ? 0x3b4452 : 0xb84a32);
      // Turkish Hammam domed spa wing
      box(ctx, 1.32, 0.22, 1.84, 0.92, 1.2, 16, 0xe5d8c0);
      drawDome(ctx, 1.58, 0.57, 16, 0.22);
      // Boutique courtyard pool
      poly(ctx, [P(0.25, 1.32, 1.4), P(1.25, 1.32, 1.4), P(1.25, 1.82, 1.4), P(0.25, 1.82, 1.4)], 0x38bdf8);
    } else if (lvl === 2) {
      // Level 2: Mercure & Sealife Konyaaltı Business & Family Hotel
      box(ctx, 0.14, 0.14, 1.84, 1.08, 1.2, 42, scottish ? 0xcbd5e1 : 0xeef2f6);
      box(ctx, 0.1, 0.1, 1.88, 1.12, 42, 45, 0x1e3a8a);
      poly(ctx, [P(0.2, 1.28, 1.4), P(1.78, 1.28, 1.4), P(1.78, 1.84, 1.4), P(0.2, 1.84, 1.4)], 0x0ea5e9);
    } else if (lvl === 3) {
      // Level 3: Paloma Grida Belek — Lagoon & Lake Suites with Direct Pool Access & Wooden Piers
      // Wrap-around Turquoise Lagoon Pool across the front & centre
      poly(ctx, [P(0.14, 0.88, 1.4), P(1.88, 0.88, 1.4), P(1.88, 1.88, 1.4), P(0.14, 1.88, 1.4)], 0x38bdf8);
      // Two White-Stucco & Terracotta Lake Suite Villas with wooden sun-decks jutting over the lagoon
      for (const vu of [0.16, 1.04]) {
        box(ctx, vu, 0.14, vu + 0.76, 0.84, 1.2, 26, 0xfaf8f5);
        box(ctx, vu - 0.03, 0.11, vu + 0.79, 0.87, 26, 30, 0xc85a32);
        // Wooden private swim-up pier with sunbeds (GRIDA SUMMER 25 page 14)
        poly(ctx, [P(vu + 0.12, 0.84, 1.6), P(vu + 0.64, 0.84, 1.6), P(vu + 0.64, 1.14, 1.6), P(vu + 0.12, 1.14, 1.6)], 0xb88652);
      }
      // Circular wooden pergola of Paloma Restaurant / Quentine Bar by the pool
      box(ctx, 1.38, 1.32, 1.82, 1.76, 1.5, 11, 0xa47143);
      box(ctx, 1.34, 1.28, 1.86, 1.8, 11, 13, 0xc89d66);
    } else if (lvl === 4) {
      // Level 4: Paloma Finesse Side — Iconic White Vertical Colonnade, Mirror Pool, Zen Pebble Sculpture & Cabanas
      box(ctx, 0.12, 0.12, 1.88, 1.05, 1.2, 48, 0xf8fafc);
      box(ctx, 0.08, 0.08, 1.92, 1.09, 48, 51, 0xe2e8f0);
      // White vertical colonnade pillars along the front facade (Finesse Factsheet page 1)
      for (let u = 0.18; u <= 1.82; u += 0.2) {
        box(ctx, u, 1.05, u + 0.06, 1.13, 1.2, 48, 0xffffff);
      }
      // Reflective entrance mirror pool + Swim-up pool + Stacked White Zen Pebble Sculpture
      poly(ctx, [P(0.16, 1.2, 1.4), P(1.25, 1.2, 1.4), P(1.25, 1.86, 1.4), P(0.16, 1.86, 1.4)], 0x0284c7);
      for (let pIdx = 0; pIdx < 5; pIdx++) {
        const pt = P(0.42, 1.55, 2 + pIdx * 2.6);
        ctx.g.ellipse(pt[0], pt[1], 5.5 - pIdx * 0.7, 2.2 - pIdx * 0.2).fill(0xf1f5f9);
      }
      // Private wooden beach cabanas on the right terrace (Finesse page 9)
      for (const cv of [1.25, 1.58]) {
        box(ctx, 1.38, cv, 1.82, cv + 0.24, 1.4, 9, 0xa47143);
      }
    } else {
      // Level 5: Crowne Plaza & Porto Bello 5★ Luxury Resort Sky-Tower + Rooftop Solar + Mini Aquapark Slide
      box(ctx, 0.12, 0.12, 1.88, 1.1, 1.2, 68, scottish ? 0xdbe4ec : 0xf8fafc);
      box(ctx, 0.08, 0.08, 1.92, 1.14, 68, 72, 0x0284c7);
      // Solar panels on roof (Paloma Solar Power Plant)
      for (let su = 0.22; su < 1.72; su += 0.38) {
        box(ctx, su, 0.24, su + 0.28, 0.86, 72, 73.2, 0x1e3a8a);
      }
      // Resort Lagoon Pool + spiral slide
      poly(ctx, [P(0.16, 1.22, 1.4), P(1.84, 1.22, 1.4), P(1.84, 1.88, 1.4), P(0.16, 1.88, 1.4)], 0x38bdf8);
      drawWaterSlideTube(ctx, 1.68, 0.95, 36, 1.85, 1.35, 18, 1.45, 1.58, 2, 0xfacc15, 0xffffff);
    }

    // Illuminated hotel windows & balconies
    const maxZ = lvl === 1 ? 26 : lvl === 2 ? 40 : lvl === 3 ? 24 : lvl === 4 ? 45 : 64;
    const f = faceL(0.14, 1.84, 1.11);
    for (let z = 8; z < maxZ; z += 12) {
      for (let u = 0.22; u < 1.74; u += 0.34) {
        quad(ctx, f, u, u + 0.22, z, z + 7, 0x38bdf8);
        ctx.lights.push([P(u, 1.12, z), P(u + 0.22, 1.12, z), P(u + 0.22, 1.12, z + 7), P(u, 1.12, z + 7)]);
      }
    }
    sign(ctx, title, 0.22, 1.13, maxZ - 6, 1.52, 0x0369a1);
    garden(w, w);
    return true;
  }

  // ------------------------------------------------------------------ 5. OTHER CITY BUILDINGS (Levels 1..5)
  const factory = id === 'factory',
    w = factory ? 3 : 2;
  const color =
    id === 'fire_station'
      ? scottish
        ? 0xd6cfc2
        : 0xf1ebe1
      : id === 'hospital'
        ? scottish
          ? 0xdce4e8
          : 0xeff5f7
        : id === 'police_station'
          ? scottish
            ? 0xbfc8d1
            : 0xcbd9e6
          : id === 'market'
            ? scottish
              ? 0xc8b9a0
              : 0xe8d6bc
            : id === 'club'
              ? 0x323047
              : scottish
                ? 0xc4b59b
                : 0xe5d3bc;

  box(ctx, 0.05, 0.05, w - 0.05, w - 0.05, 0, 1, scottish ? 0x8a8f94 : 0x9b9b92);
  const baseTop = factory ? 34 : id === 'fire_station' ? 26 : 22;
  const top = baseTop + (lvl - 1) * 6;
  box(ctx, 0.12, 0.12, w - 0.12, 1.12, 1, top, color);

  const roofTint =
    id === 'fire_station'
      ? 0xb91c1c
      : id === 'club'
        ? 0x79418f
        : scottish
          ? 0x3b4452
          : 0xa8422b;
  box(ctx, 0.08, 0.08, w - 0.08, 1.16, top, top + 3.5, roofTint);
  if (scottish) {
    for (let sStep = 0; sStep < 3; sStep++) {
      box(
        ctx,
        0.14 + sStep * 0.12,
        0.14,
        w - 0.14 - sStep * 0.12,
        1.12,
        top + 3.5 + sStep * 2.2,
        top + 5.7 + sStep * 2.2,
        0x475569,
      );
    }
    box(ctx, 0.24, 0.2, 0.38, 0.34, top + 3.5, top + 12, 0x78716c);
    box(ctx, w - 0.38, 0.2, w - 0.24, 0.34, top + 3.5, top + 12, 0x78716c);
  } else {
    box(ctx, 0.22, 0.22, w - 0.22, 1.02, top + 3.5, top + 6.5, 0xbf4f36);
    box(ctx, 0.1, 1.11, w - 0.1, 1.15, top - 2, top, 0x6b442a);
  }

  const f = faceL(0.12, w - 0.12, 1.125);
  for (let z = 8; z < top - 4; z += 12)
    for (let u = 0.22; u < w - 0.25; u += 0.36) {
      if (id === 'fire_station' && z < 16) continue;
      quad(ctx, f, u, u + 0.22, z, z + 7.5, scottish ? 0x335c75 : 0x44768c);
      ctx.lights.push([P(u, 1.13, z), P(u + 0.22, 1.13, z), P(u + 0.22, 1.13, z + 7.5), P(u, 1.13, z + 7.5)]);
    }

  if (id === 'fire_station') {
    for (const bayU of [0.24, 0.92]) {
      quad(ctx, f, bayU, bayU + 0.56, 1, 14, 0xd62828);
      quad(ctx, f, bayU + 0.06, bayU + 0.5, 8, 12, 0xbae6fd);
      ctx.lights.push([
        P(bayU + 0.06, 1.13, 8),
        P(bayU + 0.5, 1.13, 8),
        P(bayU + 0.5, 1.13, 12),
        P(bayU + 0.06, 1.13, 12),
      ]);
      for (const zLine of [4, 7, 13]) {
        line(ctx, P(bayU, 1.13, zLine), P(bayU + 0.56, 1.13, zLine), 0xf8fafc, 0.9);
      }
    }
    const towerH = (scottish ? 46 : 42) + lvl * 3;
    box(ctx, 1.48, 0.16, 1.86, 0.54, top, towerH, scottish ? 0x94a3b8 : 0xd62828);
    box(ctx, 1.44, 0.12, 1.9, 0.58, towerH, towerH + 3, 0xf8fafc);
    ctx.g.circle(...P(1.67, 0.35, towerH + 5), 2.2).fill(0xff2a1f);
    box(ctx, 0.12, 1.14, 1.88, 1.95, 1, 1.3, 0x475569);
    for (let u = 0.2; u < 1.8; u += 0.5) line(ctx, P(u, 1.2, 1.4), P(u, 1.9, 1.4), 0xfacc15, 1.1);
  } else {
    quad(ctx, f, w * 0.5 - 0.14, w * 0.5 + 0.14, 1, 11, 0x23434f);
  }

  sign(
    ctx,
    title,
    0.18,
    1.14,
    top - 10,
    w - 0.36,
    id === 'fire_station'
      ? 0xd62828
      : id === 'hospital'
        ? 0xc43c4b
        : id === 'market'
          ? scottish
            ? 0x1e3a8a
            : 0x7b1e3a
          : id === 'club'
            ? 0xa332c0
            : 0x244a72,
  );
  if (id === 'hospital') {
    box(ctx, 0.65, 1.15, 1.35, 1.5, 11, 13, scottish ? 0x1e3a8a : 0x3b7481);
    for (const u of [0.68, 1.32]) box(ctx, u, 1.45, u + 0.04, 1.49, 1, 11, 0xe7e5dc);
  }
  if (id === 'market' || id === 'hospital' || id === 'police_station') {
    box(ctx, 0.12, 1.5, 1.88, 1.95, 1, 1.2, 0x545e68);
    for (let u = 0.14; u < 1.9; u += 0.55) line(ctx, P(u, 1.5, 1.3), P(u, 1.94, 1.3), 0xe8e5d5, 0.8);
  }
  if (factory) {
    for (const u of [0.5, 1, 1.5]) {
      box(ctx, u, 0.3, u + 0.18, 0.5, top, top + 26, scottish ? 0x64748b : 0x9b5d4e);
      ctx.smoke.push(P(u + 0.09, 0.4, top + 26));
    }
    box(ctx, 0.3, 1.2, 2.7, 1.8, 1, 7, 0x68747c);
    for (const u of [0.45, 1.1, 1.8]) box(ctx, u, 1.25, u + 0.3, 1.55, 7, 14, 0xaa8150);
  }
  if (id === 'restaurant') {
    for (let u = 0.15; u < 1.8; u += 0.24)
      box(
        ctx,
        u,
        1.12,
        u + 0.23,
        1.48,
        14,
        16,
        Math.round(u * 100) % 2 ? (scottish ? 0xf8fafc : 0x38a3d8) : scottish ? 0x1e3a8a : 0x7b1e3a,
      );
    for (const u of [0.45, 1.35]) {
      box(ctx, u - 0.16, 1.55, u + 0.16, 1.82, 5, 7, 0xa97947);
      for (const v of [1.47, 1.87]) box(ctx, u - 0.1, v, u + 0.1, v + 0.1, 1, 4, 0x4f6459);
    }
  }
  if (id === 'club') {
    for (const u of [0.17, 1.8]) {
      const pts = [P(u, 1.16, 2), P(u + 0.04, 1.16, 2), P(u + 0.04, 1.16, top), P(u, 1.16, top)];
      poly(ctx, pts, u < 1 ? 0xe85aff : 0x48e4eb);
      ctx.lights.push(pts);
    }
  }
  garden(w, w);
  return true;
}