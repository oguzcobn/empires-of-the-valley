import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MATERIALS, MONUMENT_MODELS } from '../../data/monumentModels';
import type { MonumentMaterial, MonumentPart } from '../../data/monumentModels';
import { addSurfaceDetail } from './materialDetail';
import type { LandmarkId } from '../../core/types';

export function createMonument(id: LandmarkId): THREE.Group {
  const group = new THREE.Group();
  const materials = new Map<MonumentMaterial, THREE.MeshStandardMaterial>();
  function material(id: MonumentMaterial): THREE.MeshStandardMaterial {
    const cached = materials.get(id);
    if (cached) return cached;
    const result = new THREE.MeshStandardMaterial(MATERIALS[id]);
    if (id === 'sandstone' || id === 'limestone' || id === 'rubble') addSurfaceDetail(result, 'masonry');
    if (id === 'timber') addSurfaceDetail(result, 'wood');
    if (id === 'tile' || id === 'slate') addSurfaceDetail(result, 'shingle');
    if (id === 'plaster' || id === 'gravel') addSurfaceDetail(result, 'granular');
    materials.set(id, result);
    return result;
  }

  function mesh(geometry: THREE.BufferGeometry, mat: MonumentMaterial, x: number, y: number, z: number): THREE.Mesh {
    const item = new THREE.Mesh(geometry, material(mat));
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  }

  function box(w: number, h: number, d: number, mat: MonumentMaterial, x: number, y: number, z: number): THREE.Mesh {
    return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  }

  function beam(a: THREE.Vector3, b: THREE.Vector3, gauge: number, mat: MonumentMaterial): void {
    const mid = a.clone().lerp(b, .5);
    const item = box(gauge, a.distanceTo(b), gauge, mat, mid.x, mid.y, mid.z);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }

  function windows(part: MonumentPart, curved: boolean): void {
    const [, x, z, w, d, base, h, mat, bays] = part;
    if (!bays || h < .7) return;
    const floors = Math.max(1, Math.round(h / 1.1));
    const ww = Math.min(.34, w / bays * .46);
    const wh = Math.min(.61, h / floors * .62);
    const trim = mat === 'gold' ? 'gold' : mat === 'timber' ? 'timber' : 'limestone';
    for (let row = 0; row < floors; row++) for (let i = 0; i < (curved ? Math.max(bays, 8) : bays); i++) {
      const y = base + (row + .5) * h / floors;
      if (curved) {
        const angle = i * Math.PI * 2 / Math.max(bays, 8);
        const item = box(ww, wh, .034, 'glass', x + Math.sin(angle) * (w * .5 + .016), y, z + Math.cos(angle) * (d * .5 + .016));
        item.rotation.y = angle;
      } else {
        const offset = w * ((i + .5) / bays - .5);
        for (const side of [-1, 1]) {
          box(ww + .07, wh + .08, .041, trim, x + offset, y, z + side * (d / 2 + .014));
          box(ww, wh, .027, 'glass', x + offset, y, z + side * (d / 2 + .04));
        }
      }
    }
  }

  function roof(x: number, z: number, w: number, d: number, base: number, h: number, mat: MonumentMaterial, form: 'hip' | 'gable' | 'eave'): void {
    const ridge = form === 'gable' ? 1 : form === 'eave' ? .58 : .48;
    const rings = form === 'eave' ? [[1, 1, 0], [.83, .77, .18], [ridge, .06, 1]] : [[1, 1, 0], [ridge, 0, 1]];
    const points = rings.flatMap(([a, b, y]) => [[-w*a!/2, h*y!, -d*b!/2], [w*a!/2, h*y!, -d*b!/2], [w*a!/2, h*y!, d*b!/2], [-w*a!/2, h*y!, d*b!/2]]);
    const faces = [];
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 4; i++) {
      const a = r * 4 + i, b = r * 4 + ((i + 1) % 4);
      faces.push(a, a + 4, b, b, a + 4, b + 4);
    }
    const g = new THREE.BufferGeometry();
    // Flat normals separate the masonry gables and the roof planes.
    g.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap(i => points[i]!), 3));
    g.computeVertexNormals();
    const roofMesh = mesh(g, mat, x, base, z);
    if (w < d) {
      g.scale(d / w, 1, w / d);
      roofMesh.rotation.y = Math.PI / 2;
    }
    box(w, .045, d, mat, x, base - .018, z);
  }

  function arcade(part: MonumentPart): void {
    const [, x, z, w, d, base, h, mat, bays = 3] = part;
    const span = w / bays, half = span * .34, spring = h * .46;
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(-half, 0);
    shape.lineTo(-half, spring);
    shape.quadraticCurveTo(-half, h * .7, 0, h * .85);
    shape.quadraticCurveTo(half, h * .7, half, spring);
    shape.lineTo(half, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(span / 2, h);
    shape.lineTo(-span / 2, h);
    shape.closePath();
    for (let i = 0; i < bays; i++) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 });
      mesh(geo, mat, x + (i + .5) * span - w / 2, base, z - d / 2);
    }
  }

  for (const part of MONUMENT_MODELS[id] ?? []) {
    const [shape, x, z, w, d, base, h, mat, bays = 0] = part;
    const y = base + h / 2;
    switch (shape) {
      case 'wall':
        mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(.037, h / 5, d / 5, w / 5)), mat, x, y, z);
        windows(part, false);
        break;
      case 'hip':
      case 'gable':
      case 'eave':
        roof(x, z, w, d, base, h, mat, shape);
        break;
      case 'column':
      case 'cylinder':
      case 'spire': {
        const top = shape === 'spire' ? .025 : shape === 'column' ? .42 : .5;
        const item = mesh(new THREE.CylinderGeometry(top, .5, h, shape === 'spire' ? 8 : 24), mat, x, y, z);
        item.scale.set(w, 1, d);
        if (shape === 'column') {
          box(w * 1.24, .07, d * 1.24, mat, x, base + .035, z);
          box(w * 1.22, .07, d * 1.22, mat, x, base + h - .035, z);
        }
        windows(part, true);
        break;
      }
      case 'dome': {
        const item = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, x, base, z);
        item.scale.set(w / 2, h, d / 2);
        break;
      }
      case 'clock': {
        const face = mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 32), mat, x, y, z);
        face.rotation.x = Math.PI / 2;
        const center = new THREE.Vector3(x, y, z + d / 2 + .01);
        if (mat !== 'glass') for (let tick = 0; tick < 12; tick++) {
          const angle = tick * Math.PI / 6;
          const spoke = new THREE.Vector3(Math.sin(angle), Math.cos(angle), 0);
          beam(center.clone().addScaledVector(spoke, w * .35), center.clone().addScaledVector(spoke, w * .42), w * .012, 'slate');
        }
        beam(center, center.clone().add(new THREE.Vector3(w * -.21, w * .18, 0)), w * .034, 'slate');
        beam(center, center.clone().add(new THREE.Vector3(w * .29, w * .15, 0)), w * .024, 'slate');
        break;
      }
      case 'arcade':
        arcade(part);
        break;
      case 'glassTower': {
        const profile = [[.48, 0], [.37, .28], [.38, .55], [.51, .83], [.49, 1]]
          .map(([r, t]) => new THREE.Vector2(r!, t! * h));
        const item = mesh(new THREE.LatheGeometry(profile, 20), mat, x, base, z);
        item.scale.set(w, 1, d);
        for (let i = 0; i < 5; i++) {
          const t = (i + .5) / 5;
          const ring = mesh(new THREE.TorusGeometry(w * (.38 + .13 * Math.abs(2 * t - 1)), .014, 5, 24), 'slate', x, base + t * h, z);
          ring.rotation.x = Math.PI / 2;
          ring.scale.y = d / w;
        }
        break;
      }
      case 'truss': {
        const segments = bays || 4, gauge = .066;
        for (const side of [-1, 1]) {
          const zEdge = z + side * d / 2;
          box(w, gauge, gauge, mat, x, base + h, zEdge);
          for (let i = 0; i <= segments; i++) {
            const px = x + (i / segments - .5) * w;
            beam(new THREE.Vector3(px, base, zEdge), new THREE.Vector3(px, base + h, zEdge), gauge, mat);
            if (i === segments) continue;
            const next = px + w / segments;
            beam(new THREE.Vector3(px, base, zEdge), new THREE.Vector3(next, base + h, zEdge), gauge, mat);
            beam(new THREE.Vector3(px, base + h, zEdge), new THREE.Vector3(next, base, zEdge), gauge, mat);
          }
        }
        break;
      }
    }
  }
  return group;
}
