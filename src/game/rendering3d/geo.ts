import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** World scale: one tile is one unit on X/Z; one terrain level is LEVEL_H units on Y. */
export const LEVEL_H = 0.34;

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();

/** sRGB hex -> linear RGB triple, with an optional brightness factor. */
export function rgb(hex: number, factor = 1): [number, number, number] {
  tmpColor.setHex(hex);
  return [tmpColor.r * factor, tmpColor.g * factor, tmpColor.b * factor];
}

export function mixHex(a: number, b: number, t: number): number {
  const ch = (shift: number): number =>
    Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Small deterministic hash in [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 1274126177, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  const [r, gr, b] = rgb(hex);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = gr;
    colors[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Accumulates coloured primitives and merges them into one geometry, so a whole building (or the
 * whole road network) costs a single draw call. Y is up; `y` arguments are the base of a shape.
 */
export class Builder {
  private parts: THREE.BufferGeometry[] = [];
  private offset = new THREE.Vector3();

  /** Translates everything added afterwards (used to place sub-assemblies). */
  at(x: number, y: number, z: number): this {
    this.offset.set(x, y, z);
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  private push(geo: THREE.BufferGeometry, hex: number, m?: THREE.Matrix4): void {
    const g = paint(geo, hex);
    if (m) g.applyMatrix4(m);
    if (this.offset.lengthSq() > 0) g.translate(this.offset.x, this.offset.y, this.offset.z);
    this.parts.push(g);
  }

  /** Axis-aligned box given by its footprint centre, base height and size; optional yaw. */
  box(cx: number, y: number, cz: number, sx: number, sy: number, sz: number, hex: number, yaw = 0): this {
    tmpMatrix.makeRotationY(yaw).setPosition(cx, y + sy / 2, cz);
    this.push(new THREE.BoxGeometry(sx, sy, sz), hex, tmpMatrix.clone());
    return this;
  }

  /** Box from two footprint corners. */
  block(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, hex: number): this {
    return this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), hex);
  }

  cyl(cx: number, y: number, cz: number, rTop: number, rBottom: number, h: number, hex: number, seg = 10): this {
    tmpMatrix.makeTranslation(cx, y + h / 2, cz);
    this.push(new THREE.CylinderGeometry(rTop, rBottom, h, seg), hex, tmpMatrix.clone());
    return this;
  }

  cone(cx: number, y: number, cz: number, r: number, h: number, hex: number, seg = 10): this {
    tmpMatrix.makeTranslation(cx, y + h / 2, cz);
    this.push(new THREE.ConeGeometry(r, h, seg), hex, tmpMatrix.clone());
    return this;
  }

  /** Four-sided pyramid (hip/pyramid roofs, spires); footprint is axis-aligned. */
  pyramid(x0: number, z0: number, x1: number, z1: number, y: number, h: number, hex: number): this {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    g.rotateY(Math.PI / 4);
    tmpMatrix.makeScale(Math.abs(x1 - x0), h, Math.abs(z1 - z0)).setPosition((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
    this.push(g, hex, tmpMatrix.clone());
    return this;
  }

  sphere(cx: number, cy: number, cz: number, r: number, hex: number, sy = 1, seg = 10): this {
    tmpMatrix.makeScale(1, sy, 1).setPosition(cx, cy, cz);
    this.push(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), hex, tmpMatrix.clone());
    return this;
  }

  /** Upper half of a sphere resting on `y`. */
  dome(cx: number, y: number, cz: number, r: number, hex: number, sy = 1): this {
    tmpMatrix.makeScale(1, sy, 1).setPosition(cx, y, cz);
    this.push(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), hex, tmpMatrix.clone());
    return this;
  }

  /** Gable roof: a triangular prism whose ridge runs along X (or Z), plus the two gable ends. */
  gable(x0: number, z0: number, x1: number, z1: number, y: number, h: number, hex: number, alongX = true, endHex = hex): this {
    const tris = (pts: number[], color: number): void => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      g.computeVertexNormals();
      this.push(g, color);
    };
    if (alongX) {
      const zm = (z0 + z1) / 2;
      tris(
        [
          x0, y, z1, x1, y, z1, x1, y + h, zm, x0, y, z1, x1, y + h, zm, x0, y + h, zm,
          x1, y, z0, x0, y, z0, x0, y + h, zm, x1, y, z0, x0, y + h, zm, x1, y + h, zm,
        ],
        hex,
      );
      tris([x1, y, z1, x1, y, z0, x1, y + h, zm, x0, y, z0, x0, y, z1, x0, y + h, zm], endHex);
    } else {
      const xm = (x0 + x1) / 2;
      tris(
        [
          x1, y, z1, x1, y, z0, xm, y + h, z0, x1, y, z1, xm, y + h, z0, xm, y + h, z1,
          x0, y, z0, x0, y, z1, xm, y + h, z1, x0, y, z0, xm, y + h, z1, xm, y + h, z0,
        ],
        hex,
      );
      tris([x0, y, z1, x1, y, z1, xm, y + h, z1, x1, y, z0, x0, y, z0, xm, y + h, z0], endHex);
    }
    return this;
  }

  /** Flat horizontal quad facing up (ground decals: plots, markings). */
  quad(x0: number, z0: number, x1: number, z1: number, y: number, hex: number): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0]), 3),
    );
    g.computeVertexNormals();
    this.push(g, hex);
    return this;
  }

  /**
   * Flat ribbon along a polyline of [x, y, z] points (roads, rails, lane markings). With
   * `skirtTo` it also gets vertical sides down to that height, so ramps are solid.
   */
  ribbon(pts: readonly (readonly [number, number, number])[], width: number, hex: number, lift = 0, skirtTo?: number): this {
    if (pts.length < 2) return this;
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(pts.length - 1, i + 1)]!;
      let dx = b[0] - a[0];
      let dz = b[2] - a[2];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const p = pts[i]!;
      left.push(new THREE.Vector3(p[0] + dz * (width / 2), p[1] + lift, p[2] - dx * (width / 2)));
      right.push(new THREE.Vector3(p[0] - dz * (width / 2), p[1] + lift, p[2] + dx * (width / 2)));
    }
    const out: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const l0 = left[i]!, l1 = left[i + 1]!, r0 = right[i]!, r1 = right[i + 1]!;
      tri(l0, r0, r1);
      tri(l0, r1, l1);
      if (skirtTo !== undefined) {
        const down = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(v.x, Math.min(v.y, skirtTo), v.z);
        tri(l0, l1, down(l1));
        tri(l0, down(l1), down(l0));
        tri(r1, r0, down(r0));
        tri(r1, down(r0), down(r1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    g.computeVertexNormals();
    this.push(g, hex);
    return this;
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return merged;
  }
}
