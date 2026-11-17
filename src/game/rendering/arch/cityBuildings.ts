import type { ArchitectureStyle, BuildingId } from '../../core/types';
import { P } from '../iso';
import { box, line, poly, quad, faceL, drawFlagPole } from './kit';
import type { DrawCtx } from './kit';

// Tiny original vector lettering stays legible in cached sprites, without per-frame DOM text.
export const LETTERS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['10101', '11111', '10101', '10101', '10101'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  Y: ['101', '101', '010', '010', '010'],
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
  market: 'MARKET',
  factory: 'FABRIKA',
  hotel: 'OTEL',
  club: 'CLUB',
  restaurant: 'RESTORAN',
  airport: 'HAVALIMANI',
};
export function drawCityBuilding(
  ctx: DrawCtx,
  id: BuildingId,
  style: ArchitectureStyle = 'turkish',
): boolean {
  const title = CITY_BUILDINGS[id];
  if (!title) return false;
  const scottish = style === 'scottish';
  const garden = (width: number, depth: number): void => {
    const count = scottish ? 2 : style === 'turkish' ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const v = depth - 0.25 - i * 0.18;
      box(ctx, width - 0.14, v, width - 0.03, v + 0.1, 1, 4, scottish ? 0x7d8082 : 0x9d8565);
      box(ctx, width - 0.13, v + 0.01, width - 0.04, v + 0.09, 4, 6, scottish ? 0x3f6a4e : 0x56764d);
    }
  };
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
    const termColor = scottish ? 0xcfd6dc : 0xd9e8ed;
    const roofColor = scottish ? 0x334155 : 0x7b1e3a;
    box(ctx, 2, 2, 6.3, 3.6, 1, 24, termColor);
    box(ctx, 1.94, 1.94, 6.36, 3.66, 24, 27, roofColor);
    for (let u = 2.15; u < 6; u += 0.4) quad(ctx, faceL(2, 6.3, 3.61), u, u + 0.28, 7, 19, 0x4b94ae);
    const towerTop = scottish ? 56 : 52;
    box(ctx, 6.8, 2.7, 7.2, 3.1, 1, towerTop, 0xbbc9d1);
    box(ctx, 6.55, 2.45, 7.45, 3.35, towerTop, towerTop + 12, 0x326c85);
    box(ctx, 6.5, 2.4, 7.5, 3.4, towerTop + 12, towerTop + 14, 0xe2ebed);
    sign(ctx, title, 2.15, 3.62, 25, 3.9, scottish ? 0x1e3a8a : 0x7b1e3a);
    drawFlagPole(ctx, P(1.6, 3.5, 1), scottish ? 0x1d4ed8 : 0x7b1e3a, 14);
    garden(8, 4);
    return true;
  }

  const factory = id === 'factory',
    w = factory ? 3 : 2;
  // Distinct city-specific masonry & roof palette for Trabzon (turkish) vs Edinburgh (scottish)
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
  const top = id === 'hotel' ? (scottish ? 68 : 64) : factory ? 36 : id === 'fire_station' ? 28 : 24;
  box(ctx, 0.12, 0.12, w - 0.12, 1.12, 1, top, color);

  // Culture-authentic roof crown: Trabzon terracotta hip eaves & cumba trim vs Edinburgh slate crow-steps & chimney pots
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
    // Edinburgh stepped crow-step gable parapet + twin sandstone chimney pots
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
    // Trabzon traditional red-tiled pitched roof ridge + timber cornice band
    box(ctx, 0.22, 0.22, w - 0.22, 1.02, top + 3.5, top + 6.5, 0xbf4f36);
    box(ctx, 0.1, 1.11, w - 0.1, 1.15, top - 2, top, 0x6b442a);
  }

  const f = faceL(0.12, w - 0.12, 1.125);
  for (let z = 8; z < top - 4; z += 14)
    for (let u = 0.22; u < w - 0.25; u += 0.36) {
      if (id === 'fire_station' && z < 16) continue;
      quad(ctx, f, u, u + 0.22, z, z + 8, scottish ? 0x335c75 : 0x44768c);
      ctx.lights.push([P(u, 1.13, z), P(u + 0.22, 1.13, z), P(u + 0.22, 1.13, z + 8), P(u, 1.13, z + 8)]);
      if (id === 'hotel') {
        box(ctx, u - 0.03, 1.13, u + 0.26, 1.3, z - 1, z + 1, scottish ? 0x94a3b8 : 0xe5ded1);
        line(ctx, P(u - 0.03, 1.3, z + 5), P(u + 0.26, 1.3, z + 5), 0x354550, 1);
      }
    }

  if (id === 'fire_station') {
    // Twin red apparatus bay doors (garaj kapıları) + glass panels + corner hose/siren tower
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
    // Hose drying & watch tower on the corner + red emergency beacon
    const towerH = scottish ? 48 : 44;
    box(ctx, 1.48, 0.16, 1.86, 0.54, top, towerH, scottish ? 0x94a3b8 : 0xd62828);
    box(ctx, 1.44, 0.12, 1.9, 0.58, towerH, towerH + 3, 0xf8fafc);
    ctx.g.circle(...P(1.67, 0.35, towerH + 5), 2.2).fill(0xff2a1f);
    // Asphalt apparatus apron with yellow safety stripes
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
  if (id === 'hotel' || id === 'hospital') {
    box(ctx, 0.65, 1.15, 1.35, 1.5, 11, 13, scottish ? 0x1e3a8a : 0x3b7481);
    for (const u of [0.68, 1.32]) box(ctx, u, 1.45, u + 0.04, 1.49, 1, 11, 0xe7e5dc);
  }
  if (id === 'market' || id === 'hospital' || id === 'police_station') {
    box(ctx, 0.12, 1.5, 1.88, 1.95, 1, 1.2, 0x545e68);
    for (let u = 0.14; u < 1.9; u += 0.55) line(ctx, P(u, 1.5, 1.3), P(u, 1.94, 1.3), 0xe8e5d5, 0.8);
  }
  if (factory) {
    for (const u of [0.5, 1, 1.5]) {
      box(ctx, u, 0.3, u + 0.18, 0.5, 36, 64, scottish ? 0x64748b : 0x9b5d4e);
      ctx.smoke.push(P(u + 0.09, 0.4, 64));
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
      const pts = [P(u, 1.16, 2), P(u + 0.04, 1.16, 2), P(u + 0.04, 1.16, 25), P(u, 1.16, 25)];
      poly(ctx, pts, u < 1 ? 0xe85aff : 0x48e4eb);
      ctx.lights.push(pts);
    }
  }
  garden(w, w);
  return true;
}