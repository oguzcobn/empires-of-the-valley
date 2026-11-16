import * as THREE from 'three';

/**
 * Depth-of-field ("tilt-shift") pass. The scene is rendered into a target with a depth texture;
 * every pixel is then blurred by its distance from the focus plane, which makes the valley read
 * as a miniature. Also applies a gentle saturation lift and vignette.
 */
export class TiltShift {
  readonly target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private quad: THREE.Mesh;

  constructor(samples: number) {
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      samples,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(4, 4),
      type: THREE.HalfFloatType,
    });
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        near: { value: 1 },
        far: { value: 100 },
        focus: { value: 10 },
        range: { value: 5 },
        dead: { value: 1 },
        maxBlur: { value: 6 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float near;
        uniform float far;
        uniform float focus;
        uniform float range;
        uniform float dead;
        uniform float maxBlur;
        float viewDepth(vec2 uv) {
          float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return 2.0 * near * far / (far + near - z * (far - near));
        }
        void main() {
          float d = viewDepth(vUv);
          float coc = smoothstep(dead, dead + range, abs(d - focus));
          float radius = coc * maxBlur;
          vec3 sum = texture2D(tColor, vUv).rgb;
          float total = 1.0;
          if (radius > 0.35) {
            // golden-angle spiral: even coverage of the blur disc with few taps
            for (int i = 1; i <= 18; i++) {
              float fi = float(i);
              float a = fi * 2.39996323;
              vec2 o = vec2(cos(a), sin(a)) * sqrt(fi / 18.0) * radius * texel;
              sum += texture2D(tColor, vUv + o).rgb;
              total += 1.0;
            }
          }
          vec3 c = sum / total;
          float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(luma), c, 1.14);
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * 0.22;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    (this.material.uniforms.texel!.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: number, strength: number): void {
    const u = this.material.uniforms;
    u.near!.value = camera.near;
    u.far!.value = camera.far;
    u.focus!.value = focus;
    u.dead!.value = focus * 0.045;
    u.range!.value = focus * 0.3;
    u.maxBlur!.value = strength * renderer.getPixelRatio();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
