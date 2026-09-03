import {
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TIERS, type QualityTier } from './Renderer';

/**
 * Colour grade + vignette. One full-screen pass that warms the highlights,
 * cools the shadows, lifts saturation slightly and darkens the corners — most
 * of what gives a stylised game its "painted" look.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.14 },
    contrast: { value: 1.05 },
    vignette: { value: 0.26 },
    warmth: { value: 0.04 },
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

      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, saturation);
      c = (c - 0.5) * contrast + 0.5;

      // Split tone: warm the highlights, cool the shadows.
      c.r += warmth * luma;
      c.b += warmth * (1.0 - luma) * 0.8;

      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.4;
      c *= clamp(v, 0.0, 1.0);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }
  `,
};

/**
 * Owns the post chain. The whole chain is rebuilt when the tier changes,
 * because anti-aliasing lives in the render target's sample count and that
 * cannot be changed on an existing target.
 */
export class PostFx {
  private composer!: EffectComposer;
  private target!: WebGLRenderTarget;

  constructor(
    private readonly renderer: WebGLRenderer,
    private scene: Scene,
    private camera: Camera,
    tier: QualityTier,
  ) {
    this.build(tier);
  }

  private build(tier: QualityTier): void {
    const settings = TIERS[tier];
    this.composer?.dispose();
    this.target?.dispose();

    const size = this.renderer.getDrawingBufferSize(new Vector2());
    // A multisampled target is where anti-aliasing actually happens: the
    // context's own `antialias` flag is ignored once we render through a
    // composer, which is why the earlier build had jagged edges everywhere.
    this.target = new WebGLRenderTarget(size.x, size.y, {
      type: HalfFloatType,
      samples: settings.samples,
    });
    this.composer = new EffectComposer(this.renderer, this.target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (settings.bloom) {
      this.composer.addPass(
        new UnrealBloomPass(
          new Vector2(size.x, size.y),
          0.28, // strength — a glow on signs and lamps, not a haze
          0.7, // radius
          0.85, // threshold: only genuinely bright pixels bloom
        ),
      );
    }

    // OutputPass applies tone mapping and the linear -> sRGB conversion that
    // the renderer skips when drawing into a render target. Without it the
    // whole scene comes out dark and muddy.
    this.composer.addPass(new OutputPass());
    // The grade runs last, on sRGB-encoded pixels, so its contrast and
    // vignette behave the way they look.
    this.composer.addPass(new ShaderPass(GradeShader));
    this.resize();
  }

  setCamera(camera: Camera, scene: Scene): void {
    this.camera = camera;
    this.scene = scene;
    const pass = this.composer.passes[0];
    if (pass instanceof RenderPass) {
      pass.camera = camera;
      pass.scene = scene;
    }
  }

  setTier(tier: QualityTier): void {
    this.build(tier);
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
    this.target.dispose();
  }
}
