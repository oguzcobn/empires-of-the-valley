import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ArchitectureStyle, LandmarkId } from '../../core/types';
import { isUrbanBuilding } from '../../data/urbanBuildingModels';
import type { UrbanId } from '../../data/urbanBuildingModels';
import { createUrbanBuilding } from './urbanBuildingGeometry';
import { createMonument } from './monumentGeometry';
import { makeLocalExposure } from './localExposure';
import { addSurfaceDetail } from './materialDetail';

const LIGHTING = {
  day: { elevation: 49, azimuth: 233, turbidity: 2, rayleigh: 1.9, sun: 2.8, exposure: 1, mist: .012, color: 0xc4d5dc },
  evening: { elevation: 12, azimuth: 249, turbidity: 4.3, rayleigh: 1.7, sun: 2.25, exposure: 1.2, mist: .017, color: 0xbba08b },
  overcast: { elevation: 36, azimuth: 223, turbidity: 8, rayleigh: 1.45, sun: .55, exposure: 1.25, mist: .034, color: 0xbbc6c5 },
} as const;

export type MonumentLighting = keyof typeof LIGHTING;

/** On-demand renderer: redraws only when lighting, viewport or the orbit camera changes. */
export function mountMonumentScene(host: HTMLElement, id: LandmarkId | UrbanId, style: ArchitectureStyle = 'turkish') {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  const touch = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 1200);
  const urban = isUrbanBuilding(id);
  const model = urban ? createUrbanBuilding(id, style) : createMonument(id);
  const bounds = new THREE.Box3().setFromObject(model);
  if (urban) {
    const dim = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(9 / Math.max(dim.x, dim.y, dim.z));
    bounds.setFromObject(model);
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  scene.add(model);
  camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(-.7, .42, 1).normalize(), sphere.radius * (urban && id !== 'skyscraper' ? 2.65 : 3.5));

  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6a6f57, roughness: .97 });
  addSurfaceDetail(groundMaterial, 'granular');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.035;
  ground.receiveShadow = true;
  scene.add(ground);

  const sky = new Sky();
  sky.scale.setScalar(1100);
  scene.add(sky);
  const lights = new THREE.HemisphereLight(0xe0efff, 0x807866, 1.1);
  const sun = new THREE.DirectionalLight(0xffeed6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024);
  const edge = sphere.radius + 1.2;
  Object.assign(sun.shadow.camera, { left: -edge, right: edge, top: edge, bottom: -edge, near: 1, far: 52 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .027;
  sun.shadow.bias = -.00015;
  sun.target.position.copy(sphere.center);
  scene.add(lights, sun, sun.target);
  scene.fog = new THREE.FogExp2(0xc4d5dc, .012);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(sphere.center);
  controls.minDistance = sphere.radius * 1.65;
  controls.maxDistance = sphere.radius * 7;
  controls.maxPolarAngle = Math.PI * .49;
  controls.enablePan = false;
  controls.update();

  const composer = touch ? null : new EffectComposer(renderer);
  const ao = composer ? new GTAOPass(scene, camera) : null;
  const output = composer ? new OutputPass() : null;
  const localExposure = composer && urban ? makeLocalExposure() : null;
  if (composer && ao && output) {
    ao.updateGtaoMaterial({ radius: .45, thickness: .58, samples: 8 });
    ao.blendIntensity = .42;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(ao);
    if (localExposure) composer.addPass(localExposure);
    composer.addPass(output);
  }

  // The exposure meter samples scene-linear luminance before ACES and sRGB.
  const meter = urban && renderer.extensions.has('EXT_color_buffer_float')
    ? new THREE.WebGLRenderTarget(20, 16, { type: THREE.HalfFloatType }) : null;
  const samples = meter ? new Uint16Array(20 * 16 * 4) : null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflectionScene = new THREE.Scene();
  let reflection: THREE.WebGLRenderTarget | null = null;
  let pendingFrame = 0;
  const requestDraw = () => {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      if (composer) composer.render();
      else renderer.render(scene, camera);
    });
  };
  const resize = () => {
    const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1);
    camera.aspect = w / h;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) / Math.min(1, camera.aspect)));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    if (localExposure) localExposure.uniforms.pixel!.value.set(1 / w, 1 / h);
    requestDraw();
  };

  const setLighting = (key: MonumentLighting) => {
    const p = LIGHTING[key];
    const direction = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elevation), THREE.MathUtils.degToRad(p.azimuth));
    const uniforms = sky.material.uniforms;
    uniforms.turbidity!.value = p.turbidity;
    uniforms.rayleigh!.value = p.rayleigh;
    uniforms.sunPosition!.value.copy(direction);
    sun.position.copy(sphere.center).addScaledVector(direction, 22);
    sun.intensity = p.sun;
    lights.intensity = key === 'overcast' ? 1.6 : 1.05;
    renderer.toneMappingExposure = p.exposure;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.setHex(p.color);
    fog.density = p.mist;
    // Prefilter the analytic sky for roughness-dependent split-sum IBL.
    reflectionScene.add(sky);
    try {
      const next = pmrem.fromScene(reflectionScene, .045, .1, 1500, { size: 64 });
      reflection?.dispose();
      reflection = next;
      scene.environment = reflection.texture;
      scene.environmentIntensity = .36;
    } finally {
      scene.add(sky);
    }
    renderer.shadowMap.needsUpdate = true;
    if (meter && samples) {
      const original = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(meter);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(meter, 0, 0, 20, 16, samples);
        const luminance: number[] = [];
        for (let y = 3; y < 13; y++) for (let x = 4; x < 16; x++) {
          const i = (20 * y + x) * 4;
          const L = .2126 * THREE.DataUtils.fromHalfFloat(samples[i]!)
            + .7152 * THREE.DataUtils.fromHalfFloat(samples[i + 1]!)
            + .0722 * THREE.DataUtils.fromHalfFloat(samples[i + 2]!);
          if (Number.isFinite(L) && L > .001) luminance.push(L);
        }
        luminance.sort((a, b) => a - b);
        const median = luminance[Math.floor(luminance.length / 2)];
        if (median !== undefined) {
          const ev = THREE.MathUtils.clamp(Math.log2(.24 / median), -.4, .4);
          renderer.toneMappingExposure = p.exposure * 2 ** ev;
        }
      } finally {
        renderer.setRenderTarget(original);
      }
    }
    requestDraw();
  };

  const observer = new ResizeObserver(resize);
  controls.addEventListener('change', requestDraw);
  observer.observe(host);
  try {
    resize();
    setLighting('day');
  } catch (error) {
    dispose();
    throw error;
  }

  function dispose(): void {
    cancelAnimationFrame(pendingFrame);
    controls.dispose();
    observer.disconnect();
    const materials = new Set<THREE.Material>();
    scene.traverse(item => {
      if (!(item instanceof THREE.Mesh)) return;
      item.geometry.dispose();
      for (const material of [item.material].flat()) materials.add(material);
    });
    materials.forEach(material => {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map?.dispose();
        material.normalMap?.dispose();
      }
      material.dispose();
    });
    sun.shadow.dispose();
    reflection?.dispose();
    pmrem.dispose();
    meter?.dispose();
    ao?.dispose();
    localExposure?.dispose();
    output?.dispose();
    composer?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    renderer.forceContextLoss();
  }

  return { setLighting, dispose };
}
