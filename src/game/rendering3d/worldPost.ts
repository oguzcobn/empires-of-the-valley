import {
  HalfFloatType, LinearMipmapLinearFilter, ShaderMaterial, Vector3, WebGLRenderTarget,
  type Camera, type Scene, type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { REFERENCE_GRADE } from './calibratedGrade';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0., 1.);
  }`;

function makeTarget(size: number, mipmaps = false): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type: HalfFloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: mipmaps,
    ...(mipmaps ? { minFilter: LinearMipmapLinearFilter } : {}),
  });
}

/**
 * Meter in log2(scene luminance) in linear Rec.709. Integrate the weighted log sum and weight
 * on the GPU using mipmaps; the 1x1 mip contains their respective arithmetic means.
 * The two persistent 1x1 targets implement a temporal filter in exposure stops.
 */
class ExposurePass extends Pass {
  private readonly meter = makeTarget(32, true);
  private previous = makeTarget(1);
  private next = makeTarget(1);
  private firstFrame = true;
  private readonly sample = new ShaderMaterial({
    uniforms: { image: { value: null } }, vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D image;
      void main() {
        vec2 p = 2. * vUv - 1.;
        float weight = exp(-2. * dot(p, p));
        float logY = 0.;
        // Four stratified taps per cell prevent the tiny meter from locking to one roof pixel.
        for (int j = 0; j < 2; ++j) for (int i = 0; i < 2; ++i) {
          vec2 uv = vUv + (vec2(float(i), float(j)) - .5) / 64.;
          vec3 rgb = texture2D(image, uv).rgb;
          logY += log2(max(dot(rgb, vec3(.2126, .7152, .0722)), .0001)) * .25;
        }
        gl_FragColor = vec4(logY * weight, weight, 0., 1.);
      }`,
  });
  private readonly adapt = new ShaderMaterial({
    uniforms: {
      meter: { value: this.meter.texture }, history: { value: null },
      elapsed: { value: 0 }, first: { value: true },
    }, vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `
      uniform sampler2D meter, history;
      uniform float elapsed;
      uniform bool first;
      void main() {
        vec2 sums = textureLod(meter, vec2(.5), 5.).rg;
        float logY = sums.x / max(sums.y, .001);
        float target = clamp(log2(.18) - logY, -1.5, 1.5);
        float old = first ? target : texture2D(history, vec2(.5)).r;
        float tau = target < old ? .45 : 1.6;
        float ev = mix(old, target, 1. - exp(-elapsed / tau));
        gl_FragColor = vec4(ev, logY, 0., 1.);
      }`,
  });
  private readonly apply = new ShaderMaterial({
    uniforms: { image: { value: null }, adaptation: { value: null }, meter: { value: this.meter.texture } },
    vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D image, meter, adaptation;
      void main() {
        vec4 rgba = texture2D(image, vUv);
        vec2 state = texture2D(adaptation, vec2(.5)).rg;
        vec2 sums = textureLod(meter, vUv, 1.5).rg;
        float local = sums.x / max(sums.y, .001);
        float pixel = log2(max(dot(rgba.rgb, vec3(.2126,.7152,.0722)), .0001));
        float confidence = exp2(-abs(pixel - local));
        float localEV = clamp((state.y - local) * .20, -.30, .30) * confidence;
        gl_FragColor = vec4(rgba.rgb * exp2(state.x + localEV), rgba.a);
      }`,
  });
  private readonly quad = new FullScreenQuad(this.sample);

  override render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget, seconds: number): void {
    this.quad.material = this.sample;
    this.sample.uniforms.image.value = read.texture;
    renderer.setRenderTarget(this.meter);
    this.quad.render(renderer);
    this.quad.material = this.adapt;
    this.adapt.uniforms.history.value = this.previous.texture;
    this.adapt.uniforms.first.value = this.firstFrame;
    this.adapt.uniforms.elapsed.value = Math.min(Math.max(seconds, 0), 1);
    renderer.setRenderTarget(this.next);
    this.quad.render(renderer);
    this.firstFrame = false;
    this.quad.material = this.apply;
    this.apply.uniforms.image.value = read.texture;
    this.apply.uniforms.adaptation.value = this.next.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : write);
    this.quad.render(renderer);
    [this.previous, this.next] = [this.next, this.previous];
  }

  override dispose(): void {
    for (const resource of [this.meter, this.previous, this.next, this.sample, this.adapt, this.apply, this.quad]) resource.dispose();
  }
}

export class WorldPost {
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass | null;
  private readonly output = new OutputPass();
  constructor(private readonly renderer: WebGLRenderer, scene: Scene, camera: Camera, enableGtao = true) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = enableGtao ? new GTAOPass(scene, camera) : null;
    if (this.ao) {
      this.ao.updateGtaoMaterial({ radius: .55, thickness: .35, samples: 8 });
      this.ao.updatePdMaterial({ samples: 8, radius: 3 });
      this.ao.blendIntensity = .42;
      this.composer.addPass(this.ao);
    }
    this.composer.addPass(new ExposurePass());
    // Grading is fitted against display-linear reference pixels, after the filmic curve.
    this.output.material.uniforms.gradeGain = { value: new Vector3() };
    this.output.material.uniforms.gradeSaturation = { value: 1 };
    this.output.material.fragmentShader = this.output.material.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse; uniform vec3 gradeGain; uniform float gradeSaturation;')
      .replace('#ifdef SRGB_TRANSFER', `
        float y = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
        gl_FragColor.rgb = clamp(mix(vec3(y), gl_FragColor.rgb, gradeSaturation) * gradeGain, 0., 1.);
        #ifdef SRGB_TRANSFER`);
    this.setGrade(REFERENCE_GRADE.gain, REFERENCE_GRADE.saturation);
    this.composer.addPass(this.output);
  }

  setGrade(gain: readonly number[], saturation: number): void {
    this.output.material.uniforms.gradeGain.value.set(gain[0], gain[1], gain[2]);
    this.output.material.uniforms.gradeSaturation.value = saturation;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.composer.setSize(cssWidth, cssHeight);
    // Evaluate GTAO at half linear resolution; the blend still applies to the full HDR frame.
    const scale = this.renderer.getPixelRatio() / 2;
    this.ao?.setSize(Math.max(1, Math.round(cssWidth * scale)), Math.max(1, Math.round(cssHeight * scale)));
  }

  render(dtSeconds: number): void { this.composer.render(dtSeconds); }

  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    // r187 GTAOPass.dispose() leaves these two private-pass materials allocated.
    this.ao?.gtaoMaterial.dispose();
    this.ao?.blendMaterial.dispose();
    this.composer.dispose();
  }
}
