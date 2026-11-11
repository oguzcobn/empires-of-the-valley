/** 2:1 isometric projection. Tile (x, y) has its top vertex at iso(x, y). */
export const TW = 64;
export const TH = 32;

export type Pt = [number, number];

export const isoX = (x: number, y: number): number => ((x - y) * TW) / 2;
export const isoY = (x: number, y: number): number => ((x + y) * TH) / 2;

/** Local point inside a sprite: tile-space (u, v) plus height z in pixels. */
export const P = (u: number, v: number, z = 0): Pt => [(u - v) * (TW / 2), (u + v) * (TH / 2) - z];

/** World pixel -> fractional tile coordinates on the ground plane. */
export function worldToTile(px: number, py: number): { x: number; y: number } {
  const a = px / (TW / 2);
  const b = py / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function shade(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}
