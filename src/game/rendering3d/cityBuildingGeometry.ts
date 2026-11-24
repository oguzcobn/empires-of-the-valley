import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArchitectureStyle, BuildingId } from '../core/types';
import { BUILDINGS } from '../data/buildings';
import { isLandmarkId } from '../data/landmarks';
import { MONUMENT_MODELS } from '../data/monumentModels';
import { isUrbanBuilding } from '../data/urbanBuildingModels';
import { createUrbanBuilding } from '../rendering/three/urbanBuildingGeometry';
import { createMonument } from '../rendering/three/monumentGeometry';
import type { BuildingModel } from './buildings3d';

export function enableBuildingPbr(material: THREE.MeshStandardMaterial): void {
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.customProgramCacheKey = () => key + '/city-pbr-v1';
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 citySurface; varying vec2 vCitySurface;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCitySurface = citySurface;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCitySurface;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vCitySurface.x > 0.) roughnessFactor = vCitySurface.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (vCitySurface.x > 0.) metalnessFactor = vCitySurface.y;');
  };
}

interface Template {
  body: THREE.BufferGeometry;
  lit: THREE.BufferGeometry;
  height: number;
}

// Geometry attributes share immutable CPU arrays. Each visible instance can dispose
// its own GPU buffers independently when removed, rebuilt, or used as a ghost.
const templates = new Map<string, WeakRef<Template>>();

function instanceGeometry(source: THREE.BufferGeometry, owner: Template): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (attribute instanceof THREE.BufferAttribute)
      geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
  }
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.userData.cityTemplate = owner;
  return geometry;
}

function instance(template: Template): BuildingModel {
  return { body: instanceGeometry(template.body, template), lit: instanceGeometry(template.lit, template), height: template.height };
}

function combine(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!parts.length) return new THREE.BufferGeometry();
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

function bake(group: THREE.Group, width: number, depth: number): Template {
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = .96 * Math.min(width / size.x, depth / size.z);
  const fit = new THREE.Matrix4().makeScale(scale, scale, scale)
    .setPosition(width / 2 - center.x * scale, -bounds.min.y * scale, depth / 2 - center.z * scale);
  const body: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [];
  const materials = new Set<THREE.MeshStandardMaterial>();
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    materials.add(material);
    const original = child.geometry as THREE.BufferGeometry;
    // The street view resolves shop interiors through glazing. Clear panes and
    // text overlays are sub-pixel at city scale; their opaque frames stay visible.
    if (material.transparent || material.map) { original.dispose(); return; }
    const geo = original.index ? original.toNonIndexed() : original;
    if (geo !== original) original.dispose();
    geo.clearGroups();
    geo.deleteAttribute('uv');
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(fit, child.matrixWorld));
    const count = geo.getAttribute('position').count;
    const colors = new Uint8Array(count * 3), surfaces = new Uint8Array(count * 2);
    const color = material.color;
    const rgb = [color.r, color.g, color.b].map(c => Math.round(255 * c));
    const rm = [Math.round(255 * material.roughness), Math.round(255 * material.metalness)];
    for (let i = 0; i < count; i++) {
      colors.set(rgb, i * 3);
      surfaces.set(rm, i * 2);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    geo.setAttribute('citySurface', new THREE.BufferAttribute(surfaces, 2, true));
    (material.emissive.getHex() ? lit : body).push(geo);
  });
  for (const material of materials) {
    material.map?.dispose();
    material.normalMap?.dispose();
    material.dispose();
  }
  return { body: combine(body), lit: combine(lit), height: size.y * scale };
}

export function cityBuildingModel(id: BuildingId, style: ArchitectureStyle): BuildingModel | null {
  const urban = isUrbanBuilding(id);
  const landmark = isLandmarkId(id) && !!MONUMENT_MODELS[id];
  if (!urban && !landmark) return null;
  const key = urban ? id + '/' + style : id;
  const cached = templates.get(key)?.deref();
  if (cached) return instance(cached);
  const model = urban ? createUrbanBuilding(id, style) : createMonument(id);
  const [width, depth] = BUILDINGS[id].footprint;
  const template = bake(model, width, depth);
  templates.set(key, new WeakRef(template));
  return instance(template);
}
