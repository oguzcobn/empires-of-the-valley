import type { MeshStandardMaterial } from 'three';

type Surface = 'masonry' | 'wood' | 'shingle' | 'granular';

/** World-space microstructure keeps the scale consistent across neighbouring meshes. */
export function addSurfaceDetail(material: MeshStandardMaterial, surface: Surface): void {
  material.customProgramCacheKey = () => `monument-surface:${surface}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfacePoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfacePoint = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSurfacePoint;
      float surfaceHash(vec3 p) {
        p = fract(p * .1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float surfaceNoise(vec3 p) {
        vec3 k = floor(p), w = fract(p);
        w = w * w * (3. - 2. * w);
        vec4 a = vec4(surfaceHash(k), surfaceHash(k + vec3(1,0,0)),
                     surfaceHash(k + vec3(0,1,0)), surfaceHash(k + vec3(1,1,0)));
        vec4 b = vec4(surfaceHash(k + vec3(0,0,1)), surfaceHash(k + vec3(1,0,1)),
                     surfaceHash(k + vec3(0,1,1)), surfaceHash(k + vec3(1,1,1)));
        vec4 c = mix(a, b, w.z);
        return mix(mix(c.x, c.y, w.x), mix(c.z, c.w, w.x), w.y);
      }`);
    const pattern = {
      masonry: `float row = floor(p.y * 5.);
        float across = p.x + p.z;
        float block = surfaceHash(vec3(floor(across * 3.4 + mod(row, 2.) * .5), row, 0.));
        float joint = abs(fract(p.y * 5.) - .5);
        float course = smoothstep(.44, .50, joint);
        detail = block * .15 - course * .15;`,
      wood: 'detail = (surfaceNoise(p * vec3(33., 1.4, 27.)) - .5) * .21;',
      shingle: 'detail = (surfaceNoise(p * vec3(9., 16., 8.)) - .5) * .19;',
      granular: 'detail = (surfaceNoise(p * 7.) - .5) * .21;',
    }[surface];
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = vSurfacePoint;
        float detail;
        ${pattern}
        float grain = surfaceNoise(p * 42.) - .5;
        diffuseColor.rgb *= .95 + detail + grain * .12;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + grain * .12, .04, 1.);');
  };
}
