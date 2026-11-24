/* global document, cancelAnimationFrame, performance */
// Developer-only framebuffer capture. Kept outside the production bundle.
// Browser globals and private renderer handles are used here to tag the exact surfaces
// that produced the display image. No production material is reused in the ID pass.
import * as THREE from 'three';
import { Valley3D } from '../../src/game/rendering3d/Valley3D';
import { createNewGame } from '../../src/game/scenarios/newGame';
import { calendar } from '../../src/game/core/time';
import { weatherFor } from '../../src/game/rendering/weather';

const labels = { other: 0, grass: 1, canopy: 2, wall: 3, roof: 4, water: 5, road: 6, sky: 7, shadow: 8 };
const width = 480,
  height = 320;

function maskMaterial(kind, heightCut = 0) {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, toneMapped: false, fog: false });
  mat.customProgramCacheKey = () => kind + heightCut;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 localNormal, localColor; varying float localY; attribute vec3 calibrationColor;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nlocalNormal = normal; localColor = calibrationColor; localY = position.y;',
      );
    // Encoded in unsigned-red integer steps in a linear render target.
    const id =
      kind === 'building'
        ? `localY > ${heightCut.toFixed(6)} && localNormal.y > .15 ? 4. : (abs(localNormal.y) < .08 ? 3. : 0.)`
        : kind === 'ground'
          ? 'localNormal.y > .95 && localColor.g > localColor.r && localColor.g > localColor.b ? (getShadowMask() < .5 ? 8. : 1.) : 0.'
          : String(labels[kind]) + '.';
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 localNormal, localColor; varying float localY;',
      )
      .replace(
        '#include <shadowmap_pars_fragment>',
        '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>',
      )
      .replace('#include <opaque_fragment>', `gl_FragColor = vec4((${id}) / 255., 0., 0., 1.);`);
  };
  return mat;
}

function materialMask(v) {
  const t = v.terrain,
    changed = [],
    materials = [];
  const common = new Map();
  const target = new THREE.WebGLRenderTarget(width, height);
  const ids = new Uint8Array(width * height * 4);
  const prev = v.renderer.getRenderTarget();
  const kinds = new Map([
    [t.ground, 'ground'],
    [t.roads, 'road'],
    [t.water, 'water'],
    [t.broads, 'canopy'],
    [t.pines, 'canopy'],
    [v.atmosphere.sky, 'sky'],
  ]);
  const body = new Map([...v.buildingViews.values()].map((b) => [b.body, b.height]));
  const oldShadowRefresh = v.renderer.shadowMap.autoUpdate;
  // Shadow decisions must be read from the exact shadow map used in the beauty pass.
  v.renderer.shadowMap.autoUpdate = false;
  try {
    v.scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isSprite) return;
      changed.push([obj, obj.material, obj.visible]);
      if (obj.isSprite) {
        obj.visible = false;
        return;
      }
      const kind = kinds.get(obj) ?? (body.has(obj) ? 'building' : 'other');
      const cut = (body.get(obj) || 0) * 0.43;
      const key = kind + cut;
      if (!common.has(key)) {
        const m = maskMaterial(kind, cut);
        if (kind === 'sky') m.side = THREE.BackSide;
        common.set(key, m);
        materials.push(m);
      }
      if (kind === 'ground')
        obj.geometry.setAttribute('calibrationColor', obj.geometry.getAttribute('color'));
      obj.material = common.get(key);
    });
    v.renderer.setRenderTarget(target);
    v.renderer.render(v.scene, v.camera);
    v.renderer.readRenderTargetPixels(target, 0, 0, width, height, ids);
  } finally {
    v.renderer.setRenderTarget(prev);
    v.renderer.shadowMap.autoUpdate = oldShadowRefresh;
    for (const [obj, mat, visible] of changed) {
      obj.material = mat;
      obj.visible = visible;
    }
    t.ground.geometry.deleteAttribute('calibrationColor');
    materials.forEach((m) => m.dispose());
    target.dispose();
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d'),
    img = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      img.data[i] = ids[((height - 1 - y) * width + x) * 4];
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function capture(frame, index, grade, includeMask) {
  const seed = 42 + index * 31,
    game = createNewGame({ seed, mode: 'sandbox', culture: index % 2 ? 'scottish' : 'turkish' });
  const autumn = /autumn/i.test(frame.composition + ' ' + frame.regions.map((r) => r.description).join(' '));
  const seasonStart = autumn ? 60 : 0;
  const condition = frame.weather === 'hazy' ? 'overcast' : 'clear';
  let day = seasonStart;
  while (day < seasonStart + 29 && weatherFor(seed, day, calendar(day * 24).season) !== condition) day++;
  const hour = frame.time.includes('late') ? 17 : 11 + (index % 4);
  game.tick = day * 24 + hour - 6;
  const host = document.createElement('div');
  host.style.cssText = `width:${width}px;height:${height}px`;
  document.body.appendChild(host);
  const view = {
    game,
    tool: { kind: 'select' },
    reducedMotion: true,
    detail: 3,
    selectedBuildingId: null,
    dayNight: true,
    weather: true,
    autoQuality: false,
  };
  const noop = () => {};
  const v = await Valley3D.create(
    host,
    { getView: () => view, onTileClick: noop, onRoadPaint: noop, onHover: noop, onCancel: noop },
    { resolution: 2, antialias: true },
  );
  try {
    if (!v.post) throw Error('High-quality floating-point HDR render targets unavailable');
    cancelAnimationFrame(v.raf);
    v.post.setGrade(grade.gain, grade.saturation);
    v.renderer.setPixelRatio(1);
    v.resize();
    const now = performance.now();
    v.frame(now);
    cancelAnimationFrame(v.raf);
    const p = game.provinces[game.homeProvinceId],
      town = p.buildings[0];
    const waters = p.tiles.flatMap((t, i) => (t.terrain === 'water' || t.terrain === 'lake' ? [i] : []));
    const sq = (i) => ((i % p.width) - town.x) ** 2 + (Math.floor(i / p.width) - town.y) ** 2;
    const water = waters.sort((a, b) => sq(a) - sq(b))[0];
    const shots = [];
    const cameras = [
      [town.x + 1, town.y + 1, 10, 36],
      [town.x + 2, town.y + 2, 20, 9],
      [water % p.width, Math.floor(water / p.width), 12, 24],
    ];
    for (const [x, z, d, elev] of cameras) {
      const tilt = (elev * Math.PI) / 180,
        az = ((38 + (index % 6) * 6) * Math.PI) / 180;
      v.target.set(x, 0.55, z);
      v.camera.position.set(
        x + d * Math.cos(tilt) * Math.sin(az),
        0.55 + d * Math.sin(tilt),
        z + d * Math.cos(tilt) * Math.cos(az),
      );
      v.camera.near = 0.1;
      v.camera.far = 500;
      v.camera.lookAt(v.target);
      v.camera.updateProjectionMatrix();
      v.camera.updateMatrixWorld();
      v.dist = d;
      // Frame runs the same geometry, light, GTAO, exposure and grade as the live map.
      v.frame(now + 100);
      cancelAnimationFrame(v.raf);
      // Deterministically converge the meter using identical elapsed time in the two passes.
      for (let i = 0; i < 4; i++) v.post.render(1);
      const beauty = v.renderer.domElement.toDataURL('image/png');
      shots.push({ beauty, mask: includeMask ? materialMask(v) : null });
    }
    return { seed, tick: game.tick, cameras, weather: v.weather, shots };
  } finally {
    v.destroy();
    host.remove();
  }
}
