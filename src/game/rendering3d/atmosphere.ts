import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { Season } from '../core/time';
import type { Weather } from '../rendering/weather';

const RAD = Math.PI / 180;
const DECLINATION: Record<Season, number> = { spring: 7, summer: 20, autumn: -7, winter: -20 };
// Extinction coefficients are per world tile. cloud cover controls the condensation threshold.
const WEATHER = {
  clear: { cover: .24, turbidity: 2.2, extinction: .0025 },
  overcast: { cover: .85, turbidity: 6, extinction: .009 },
  rain: { cover: .95, turbidity: 8, extinction: .021 },
  snow: { cover: .9, turbidity: 5, extinction: .026 },
};

function noiseVolume(): THREE.Data3DTexture {
  const n = 32;
  const voxels = new Uint8Array(n ** 3);
  let state = 0xc10d5eed;
  for (let i = 0; i < voxels.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    voxels[i] = state >>> 24;
  }
  const volume = new THREE.Data3DTexture(voxels, n, n, n);
  volume.format = THREE.RedFormat;
  volume.minFilter = volume.magFilter = THREE.LinearFilter;
  volume.wrapS = volume.wrapT = volume.wrapR = THREE.RepeatWrapping;
  volume.unpackAlignment = 1;
  volume.needsUpdate = true;
  return volume;
}

const CLOUD_FIELD = /* glsl */`
  uniform highp sampler3D cloudNoise3D;
  uniform float cloudCover;
  uniform vec2 cloudWind;
  float cloudMass(vec3 pos) {
    vec3 uv = vec3(pos.x + cloudWind.x, pos.y * 1.4, pos.z + cloudWind.y);
    float shape = .70 * texture(cloudNoise3D, uv * .055).r
      + .22 * texture(cloudNoise3D, uv * .116).r
      + .08 * texture(cloudNoise3D, uv * .253).r;
    return smoothstep(.83 - .59 * cloudCover, 1.02 - .59 * cloudCover, shape);
  }
`;

function cloudIntegration(mobile: boolean) {
  return /* glsl */`
    // Front-to-back Beer–Lambert integration through a finite elevated layer.
    if (direction.y > .012) {
      vec3 origin = cameraPosition / 80.0;
      float enter = max(0.0, (3.0 - origin.y) / direction.y);
      float leave = min(60., (3.75 - origin.y) / direction.y);
      const int steps = ${mobile ? 5 : 12};
      float stride = max(0., leave - enter) / float(steps);
      float throughput = 1.;
      vec3 inscatter = vec3(0.);
      float solar = smoothstep(-.1, .20, vSunDirection.y);
      vec3 direct = vec3(1., .93, .82) * solar;
      vec3 ambient = mix(vec3(.009, .015, .032), vec3(.44, .52, .65), solar);
      float phase = min(3., .64 / pow(max(.16, 1.36 - 1.2 * dot(direction, vSunDirection)), 1.5));
      for (int i = 0; i < steps; i++) {
        vec3 p = origin + direction * (enter + (float(i) + .5) * stride);
        float h = clamp((p.y - 3.) / .75, 0., 1.);
        float profile = smoothstep(0., .16, h) * (1. - smoothstep(.63, 1., h));
        float density = cloudMass(p) * profile;
        float attenuation = exp(-4. * density * stride);
        float sunPath = min(1.2, (3.75 - p.y) / max(.12, vSunDirection.y));
        float toSun = exp(-3. * cloudMass(p + vSunDirection * sunPath * .45) * sunPath);
        inscatter += throughput * (1. - attenuation) * (ambient + direct * phase * toSun);
        throughput *= attenuation;
        if (throughput < .015) break;
      }
      texColor = mix(texColor, texColor * throughput + inscatter,
        smoothstep(.012, .11, direction.y));
    }
  `;
}

/** Preetham daylight (Three.js Sky), bounded single-scattering cloud integration, and
 * an analytic vertical-density integral. The ground hemisphere approximates one diffuse
 * bounce from a horizontal Lambertian plain. It carries no inter-building visibility.
 * Cloud treatment: Schneider & Vos, Advances in Real-Time Rendering, SIGGRAPH 2015. */
export class ValleyAtmosphere {
  private readonly sky = new Sky();
  private readonly volume = noiseVolume();
  private readonly direction = new THREE.Vector3();
  private readonly cameraY = { value: 0 };
  private readonly beta = { value: .0025 };
  private readonly air = { value: new THREE.Color() };
  private readonly wind = { value: new THREE.Vector2() };
  private readonly cover = { value: .24 };
  private readonly texture = { value: this.volume };
  private readonly solar = { value: this.direction };
  private readonly childAdded = (event: { child: THREE.Object3D }) => this.bindFog(event.child);
  private readonly installed = new WeakSet<THREE.Material>();
  private readonly horizonDay = new THREE.Color(0xc1d1dc);
  private readonly horizonNight = new THREE.Color(0x28344f);

  constructor(private scene: THREE.Scene, private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight, options: { mobile: boolean }) {
    const material = this.sky.material;
    material.uniforms.cloudCoverage!.value = 0;
    Object.assign(material.uniforms, { cloudNoise3D: this.texture, cloudWind: this.wind, cloudCover: this.cover });
    material.fragmentShader = material.fragmentShader.replace('void main()', CLOUD_FIELD + '\nvoid main()')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', cloudIntegration(options.mobile) + '\ngl_FragColor = vec4( texColor, 1.0 );');
    this.sky.scale.setScalar(320);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 50; // opaque terrain writes depth before the expensive sky fragments
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0xc1d1dc, .0025);
  }

  update(hour: number, weather: Weather, season: Season, groundColor: number,
    seconds: number, camera: THREE.Camera, target: THREE.Vector3, latitude = 41): void {
    const p = WEATHER[weather];
    const phi = latitude * RAD, dec = DECLINATION[season] * RAD, a = (hour - 12) * 15 * RAD;
    // East (+X), up (+Y), south (+Z); hour is local solar time.
    this.direction.set(-Math.cos(dec) * Math.sin(a), Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(a),
      Math.sin(phi) * Math.cos(dec) * Math.cos(a) - Math.cos(phi) * Math.sin(dec));
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.sunPosition!.value.copy(this.direction).multiplyScalar(450000);
    this.sky.material.uniforms.turbidity!.value = p.turbidity;
    this.sky.material.uniforms.rayleigh!.value = 1.8;
    this.sky.material.uniforms.mieCoefficient!.value = .005;
    this.cover.value = p.cover;
    this.wind.value.set(seconds * .007, seconds * .003);
    this.cameraY.value = camera.position.y;
    this.beta.value = p.extinction;
    const y = this.direction.y, day = THREE.MathUtils.smoothstep(y, -.12, .20);
    const clearBeam = Math.exp(-.11 / Math.max(.025, y));
    this.sun.intensity = 3.3 * clearBeam;
    this.sun.color.setRGB(1, .68 + .32 * clearBeam, .43 + .57 * clearBeam);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.direction, 90);
    this.air.value.copy(this.horizonNight).lerp(this.horizonDay, day);
    (this.scene.fog as THREE.FogExp2).color.copy(this.air.value);
    (this.scene.fog as THREE.FogExp2).density = p.extinction;
    this.hemi.intensity = 1;
    this.hemi.color.setRGB(.027 + day * (.71 + .25 * p.cover), .04 + day * (.83 + .10 * p.cover), .082 + day);
    // For a diffuse horizontal surface E_ground = E_sky + E_sun * cos(zenith).
    // The outgoing radiance is rho * E_ground / pi. Three's Lambert BRDF supplies 1/pi.
    const irradiance = (.08 + day) + this.sun.intensity * Math.max(0, y) * (1 - p.cover);
    this.hemi.groundColor.setHex(groundColor).multiplyScalar(irradiance);
  }

  bindFog(root: THREE.Object3D): void {
    root.traverse(object => {
      // Three deduplicates listeners. A newly attached subtree is visited exactly once on attach.
      object.addEventListener('childadded', this.childAdded);
      const material = (object as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach(m => this.bindMaterial(m));
      else if (material) this.bindMaterial(material);
    });
  }

  private bindMaterial(material: THREE.Material): void {
    if (this.installed.has(material) || material === this.sky.material || !('fog' in material) || !material.fog) return;
    this.installed.add(material);
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => previousKey + '|valley-air-1';
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, { valleyCameraY: this.cameraY, valleyBeta: this.beta, valleyAirColor: this.air,
        cloudNoise3D: this.texture, cloudWind: this.wind, cloudCover: this.cover, valleySun: this.solar });
      shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>',
        '#include <fog_pars_vertex>\nvarying vec3 vValleyRay;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvValleyRay = mvPosition.xyz * mat3(viewMatrix);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', `
        #include <fog_pars_fragment>
        varying vec3 vValleyRay;
        uniform vec3 valleyAirColor, valleySun;
        uniform float valleyCameraY, valleyBeta;
        ${CLOUD_FIELD}
      `).replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        vec3 wp = (cameraPosition + vValleyRay) / 80.;
        vec3 projected = wp + valleySun * ((3.38 - wp.y) / max(.15, valleySun.y));
        float sunT = exp(-2.5 * cloudMass(projected) / max(.3, valleySun.y));
        reflectedLight.directDiffuse *= sunT;
        reflectedLight.directSpecular *= sunT;
      `).replace('#include <fog_fragment>', '').replace('#include <tonemapping_fragment>', `
        // Integral of beta_0 * exp(-y/H) along the finite eye-to-surface segment.
        float dy = clamp(vValleyRay.y / 13., -25., 25.);
        float meanDensity = abs(dy) < .001 ? 1. - .5 * dy : (1. - exp(-dy)) / dy;
        float tau = valleyBeta * length(vValleyRay) * exp(-valleyCameraY / 13.) * meanDensity;
        gl_FragColor.rgb = mix(valleyAirColor, gl_FragColor.rgb, exp(-max(0., tau)));
        #include <tonemapping_fragment>
      `);
    };
    material.needsUpdate = true;
  }

  dispose(): void {
    this.scene.traverse(object => object.removeEventListener('childadded', this.childAdded));
    this.sky.removeFromParent();
    this.volume.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
