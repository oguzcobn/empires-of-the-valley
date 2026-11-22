import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Low-strength neighbourhood exposure in linear HDR, before the global output transform. */
export function makeLocalExposure(): ShaderPass {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, pixel: { value: new Vector2(1, 1) } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 pixel;
      varying vec2 vUv;
      float logLuminance(vec3 rgb) {
        return log2(max(dot(rgb, vec3(.2126, .7152, .0722)), .001));
      }
      void main() {
        vec4 source = texture2D(tDiffuse, vUv);
        float center = logLuminance(source.rgb);
        float value = center * 2.;
        float total = 2.;
        for (int i = 0; i < 8; i++) {
          float angle = float(i) * .785398;
          vec2 offset = vec2(cos(angle), sin(angle)) * pixel * 14.;
          float l = logLuminance(texture2D(tDiffuse, vUv + offset).rgb);
          float weight = exp(-.65 * abs(l - center));
          value += l * weight;
          total += weight;
        }
        float correction = clamp((log2(.24) - value / total) * .14, -.22, .24);
        gl_FragColor = vec4(source.rgb * exp2(correction), source.a);
      }`,
  });
}
