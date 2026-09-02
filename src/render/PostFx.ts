import { Vector2, type Scene, type Camera, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityTier } from './Renderer';

/**
 * Colour grade + vignette. This is the cheapest large improvement available:
 * one full-screen pass that warms the highlights, cools the shadows, lifts
 * saturation slightly and darkens the corners, which is most of what gives a
 * stylised mobile game its "painted" look.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.16 },
    contrast: { value: 1.06 },
    vignette: { value: 0.26 },
    warmth: { value: 0.045 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float vignette;
    uniform float warmth;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;

      // Saturation around luma.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, saturation);

      // Contrast around mid grey.
      c = (c - 0.5) * contrast + 0.5;

      // Split tone: warm the highlights, cool the shadows.
      c.r += warmth * luma;
      c.b += warmth * (1.0 - luma) * 0.8;

      // Vignette.
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.4;
      c *= clamp(v, 0.0, 1.0);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }
  `,
};

/**
 * Owns the post chain. Bloom is gated to the high tier only — it is a
 * multi-pass blur and by far the most expensive thing here, while the grade
 * pass is a single cheap fragment shader worth running on every tier.
 */
export class PostFx {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;

  constructor(
    private readonly renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    tier: QualityTier,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    if (tier === 'high') {
      this.bloom = new UnrealBloomPass(
        new Vector2(window.innerWidth, window.innerHeight),
        0.32, // strength — a glow on signs and lamps, not a haze
        0.7, // radius
        0.82, // threshold: only genuinely bright pixels bloom
      );
      this.composer.addPass(this.bloom);
    }

    // OutputPass applies tone mapping and the linear -> sRGB conversion that
    // the renderer skips when drawing into a render target. Without it the
    // whole scene comes out dark and muddy, which is the single most common
    // bug when adding a post chain to three.js.
    this.composer.addPass(new OutputPass());

    // The grade runs last, on sRGB-encoded pixels, so its contrast and
    // vignette behave the way they look.
    this.composer.addPass(new ShaderPass(GradeShader));
    this.resize();
  }

  setCamera(camera: Camera, scene: Scene): void {
    const pass = this.composer.passes[0];
    if (pass instanceof RenderPass) {
      pass.camera = camera;
      pass.scene = scene;
    }
  }

  /**
   * Drops bloom when the device is demoted mid-session. The grade pass stays
   * on at every tier: it is one cheap fragment shader and carries most of the
   * look, so losing it would cost more visually than it saves.
   */
  setTier(tier: QualityTier): void {
    if (this.bloom && tier !== 'high') this.bloom.enabled = false;
  }

  resize(): void {
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
