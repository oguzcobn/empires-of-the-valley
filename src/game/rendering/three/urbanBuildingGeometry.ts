import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { URBAN_MATERIALS, urbanParts } from '../../data/urbanBuildingModels';
import type { ArchitectureStyle } from '../../core/types';
import type { UrbanId, UrbanMaterial, UrbanPart } from '../../data/urbanBuildingModels';
import { portSpectrum } from './portSpectrum';
import { addSurfaceDetail } from './materialDetail';

function urbanMaterial(id: UrbanMaterial): THREE.MeshStandardMaterial {
  const values = URBAN_MATERIALS[id];
  if (id === 'clearGlass') return new THREE.MeshPhysicalMaterial({
    ...values, transparent: true, opacity: .25, depthWrite: false, side: THREE.FrontSide, clearcoat: .88,
  });
  if (id === 'blueGlass' || id === 'warmGlass')
    return new THREE.MeshPhysicalMaterial({ ...values, clearcoat: .76, clearcoatRoughness: .13, ior: 1.5 });
  const mat = new THREE.MeshStandardMaterial(values);
  if (id === 'limestone') addSurfaceDetail(mat, 'masonry');
  if (id === 'brick') addSurfaceDetail(mat, 'brick');
  if (id === 'warmWood') addSurfaceDetail(mat, 'wood');
  if (id === 'slate') addSurfaceDetail(mat, 'shingle');
  if (id === 'concrete' || id === 'stucco' || id === 'asphalt') addSurfaceDetail(mat, 'granular');
  if (id === 'water') {
    const { bytes, size } = portSpectrum();
    const waves = new THREE.DataTexture(bytes, size, size);
    waves.wrapS = waves.wrapT = THREE.RepeatWrapping;
    waves.magFilter = THREE.LinearFilter;
    waves.minFilter = THREE.LinearMipmapLinearFilter;
    waves.generateMipmaps = true;
    waves.repeat.set(42.5 / 18, 10.6 / 18);
    waves.needsUpdate = true;
    mat.normalMap = waves;
  }
  return mat;
}

function roofGeometry(w: number, h: number, d: number, fullRidge: boolean): THREE.BufferGeometry {
  const x = w / 2, z = d / 2;
  const ridge = x * (fullRidge ? 1 : 0.45);
  const points = [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-ridge, h, 0], [ridge, h, 0]];
  const triangles = [0,4,1, 1,4,5, 1,5,2, 2,5,3, 3,5,4, 3,4,0];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap(i => points[i]!), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(triangles.flatMap(i => [(points[i]![0]! + x) / w, (points[i]![2]! + z) / d]), 2));
  geo.computeVertexNormals();
  return geo;
}

function geometry(part: UrbanPart): THREE.BufferGeometry {
  if (part.shape === 'beam') {
    const a = new THREE.Vector3(...part.a), b = new THREE.Vector3(...part.b);
    const d = b.clone().sub(a);
    const result = new THREE.BoxGeometry(part.width, d.length(), part.width);
    const mid = a.lerp(b, .5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return result.applyQuaternion(rotation).translate(mid.x, mid.y, mid.z);
  }
  const [w, h, d] = part.size;
  const [x, y, z] = part.p;
  if (part.shape === 'gable' || part.shape === 'roof')
    return roofGeometry(w, h, d, part.shape === 'gable').translate(x, y, z);
  if (part.shape === 'cylinder')
    return new THREE.CylinderGeometry(.5, .5, h, part.sides ?? 16).scale(w, 1, d).translate(x, y + h / 2, z);
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

function makeSign(part: Extract<UrbanPart, { shape: 'sign' }>): THREE.Mesh | null {
  // Generate typography only. The board itself uses the same geometric recipe as the map.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#' + URBAN_MATERIALS[part.mat].color.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#d4b58c';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = '#fff4dc';
  ctx.font = 'bold 59px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(part.text, 256, 49, 460);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const [w, h, d] = part.size;
  const [x, y, z] = part.p;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: .82 }));
  mesh.position.set(x, y + h / 2, z + d / 2 + .007);
  mesh.receiveShadow = true;
  return mesh;
}

/** Batch opaque and transparent faces by material so a tower's individual panes stay affordable. */
export function createUrbanBuilding(id: UrbanId, style: ArchitectureStyle = 'turkish'): THREE.Group {
  const group = new THREE.Group();
  const batch = new Map<UrbanMaterial, THREE.BufferGeometry[]>();
  for (const part of urbanParts(id, style)) {
    const geo = geometry(part);
    const assigned = batch.get(part.mat) ?? [];
    if (geo.index) {
      assigned.push(geo.toNonIndexed());
      geo.dispose();
    } else assigned.push(geo);
    batch.set(part.mat, assigned);
    if (part.shape === 'sign') {
      const sign = makeSign(part);
      if (sign) group.add(sign);
    }
  }
  for (const [id, pieces] of batch) {
    const geo = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!geo) throw new Error(`Could not combine ${id} building geometry`);
    const mesh = new THREE.Mesh(geo, urbanMaterial(id));
    mesh.castShadow = id !== 'clearGlass' && id !== 'water';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
