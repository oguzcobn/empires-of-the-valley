import { BUILDINGS } from '../../data/buildings';
import { URBAN_MATERIALS, URBAN_MODELS, urbanParts } from '../../data/urbanBuildingModels';
import type { ArchitectureStyle } from '../../core/types';
import type { UrbanId } from '../../data/urbanBuildingModels';
import { P, shade } from '../iso';
import type { Pt } from '../iso';
import { box, faceL, faceR, glowPane, line, poly, quad, shadowFor, signText, signWidth } from './kit';
import type { DrawCtx } from './kit';

const heightScale: Record<UrbanId, number> = {
  skyscraper: 2.26, high_school: 4.5, port: 4.1, government_hall: 4.5, grand_mall: 4.5,
  barber_shop: 6.2, coffee_shop: 7, tech_store: 6.1, clothing_store: 5.5,
};

export function drawUrbanBuilding(ctx: DrawCtx, id: UrbanId, style: ArchitectureStyle): void {
  const [w, d] = BUILDINGS[id].footprint;
  const { width, depth } = URBAN_MODELS[id];
  const sx = w * .95 / width, sz = d * .95 / depth, sy = heightScale[id];
  shadowFor(ctx, .1, .1, w - .1, d - .1, id === 'skyscraper' ? 103 : 30);
  const ux = (x: number) => w / 2 + x * sx;
  const vz = (z: number) => d / 2 + z * sz;
  for (const p of urbanParts(id, style)) {
    if (p.shape === 'beam') {
      const a = P(ux(p.a[0]), vz(p.a[2]), p.a[1] * sy), b = P(ux(p.b[0]), vz(p.b[2]), p.b[1] * sy);
      const color = URBAN_MATERIALS[p.mat].color;
      const width = Math.max(.65, p.width * Math.min(sx, sz) * 36);
      line(ctx, a, b, shade(color, .72), width + .45);
      if (ctx.detail) line(ctx, a, b, color, width);
      ctx.topY = Math.min(ctx.topY, a[1], b[1]);
      continue;
    }
    if (p.shape !== 'sign' && p.preview === false) continue;
    const [x, y, z] = p.p, [width, h, depth] = p.size;
    const u = ux(x), v = vz(z), du = width * sx / 2, dv = depth * sz / 2;
    const u0 = u - du, v0 = v - dv, u1 = u + du, v1 = v + dv;
    const bottom = y * sy, top = (y + h) * sy;
    const mat = URBAN_MATERIALS[p.mat];
    const glass = p.mat === 'blueGlass' || p.mat === 'clearGlass' || p.mat === 'warmGlass';
    const base = shade(mat.color, glass || p.mat === 'light' ? 1 : 1 - ctx.wear * .035);
    if (p.shape === 'gable' || p.shape === 'roof') {
      const ext = du * (p.shape === 'gable' ? 1 : .45);
      const corners = [P(u0, v0, bottom), P(u1, v0, bottom), P(u1, v1, bottom), P(u0, v1, bottom)] as const;
      const a = P(u - ext, v, top), b = P(u + ext, v, top);
      poly(ctx, [corners[0], corners[1], b, a], shade(base, .88));
      poly(ctx, [corners[0], corners[3], a], shade(base, .91));
      poly(ctx, [corners[1], corners[2], b], shade(base, .72));
      poly(ctx, [corners[3], corners[2], b, a], shade(base, 1.13));
      if (ctx.snow) poly(ctx, [corners[3], corners[2], b, a], 0xe4edf3, .56);
      if (ctx.detail) line(ctx, a, b, shade(base, 1.3), .75);
      ctx.topY = Math.min(ctx.topY, a[1], b[1]);
      continue;
    }
    if (p.shape === 'cylinder') {
      const a = P(u, v, bottom), b = P(u, v, top);
      const rx = (du + dv) * 27, ry = rx * .47;
      ctx.g.rect(b[0] - rx, b[1], rx * 2, top - bottom).fill(shade(base, .83));
      if (ctx.detail) ctx.g.rect(b[0] - rx * .68, b[1], rx * .66, top - bottom).fill(shade(base, 1.11));
      ctx.g.ellipse(a[0], a[1], rx, ry).fill(shade(base, .83));
      ctx.g.ellipse(b[0], b[1], rx, ry).fill(shade(base, 1.14));
      ctx.topY = Math.min(ctx.topY, b[1] - ry);
      continue;
    }

    if (glass && (du < .008 || dv < .008)) {
      const face: Pt[] = depth < width
        ? [P(u0, v1, bottom), P(u1, v1, bottom), P(u1, v1, top), P(u0, v1, top)]
        : [P(u1, v0, bottom), P(u1, v1, bottom), P(u1, v1, top), P(u1, v0, top)];
      const variation = .90 + Math.abs(Math.sin((x * 3 + y * 2 + z) * 2.1)) * .27;
      const color = shade(base, depth < width ? variation : variation * .82);
      if (p.mat === 'clearGlass') poly(ctx, face, color, .60);
      else poly(ctx, face, color);
      if (p.mat === 'clearGlass' || Math.sin((x + y) * 8 + z) > .45) ctx.lights.push(face);
      ctx.topY = Math.min(ctx.topY, face[2]![1], face[3]![1]);
      continue;
    }
    if (ctx.detail === 0 && p.shape === 'box' && Math.max(du * 64, dv * 64, top - bottom) < 2) continue;
    if (p.shape !== 'sign' && p.omitMapTop) {
      quad(ctx, faceL(u0, u1, v1), u0, u1, bottom, top, base);
      quad(ctx, faceR(v0, v1, u1), v0, v1, bottom, top, shade(base, .78));
    } else box(ctx, u0, v0, u1, v1, bottom, top, base);
    if (p.mat === 'light' && ctx.detail)
      glowPane(ctx, [P(u0,v1,bottom),P(u1,v1,bottom),P(u1,v1,top),P(u0,v1,top)], 0xffcf7b, .82);
    if (p.shape === 'sign' && ctx.detail) {
      const face = faceL(u0, u1, v1);
      const px = Math.min(1.45, (top - bottom) / 5.9, ((u1 - u0) * 31) / (p.text.length * 4));
      if (px >= .45) signText(ctx, face, u - signWidth(p.text, px) / 2, top - .32, p.text, 0xffead0, px);
    }
  }
}
