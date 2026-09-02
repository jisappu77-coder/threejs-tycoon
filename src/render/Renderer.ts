import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer,
  type Camera,
} from 'three';

export type QualityTier = 'low' | 'medium' | 'high';

/**
 * Owns the WebGL context and the quality tier. The tier is guessed at boot from
 * the device, then demoted at runtime if frames are consistently slow — this is
 * the main lever that keeps cheap Android phones playable.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  tier: QualityTier;

  private onTierChange?: (tier: QualityTier) => void;
  private frameTimes: number[] = [];
  private lastDemote = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.tier = guessTier();
    this.gl = new WebGLRenderer({
      canvas,
      antialias: this.tier === 'high',
      powerPreference: 'high-performance',
      stencil: false,
      // The scene always paints a full-screen background, so we never need the
      // alpha channel and can let the compositor skip a blend.
      alpha: false,
    });
    this.gl.setPixelRatio(this.pixelRatioFor(this.tier));
    this.gl.shadowMap.enabled = this.tier !== 'low';
    this.gl.shadowMap.type = PCFSoftShadowMap;
    // Filmic tone mapping keeps the warm key light from blowing out to flat
    // white and rolls the shadows off gently, which is most of the difference
    // between "3D primitives" and "a lit scene".
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.12;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
  }

  onTier(fn: (tier: QualityTier) => void): void {
    this.onTierChange = fn;
    fn(this.tier);
  }

  private pixelRatioFor(tier: QualityTier): number {
    const dpr = window.devicePixelRatio || 1;
    if (tier === 'high') return Math.min(dpr, 2);
    if (tier === 'medium') return Math.min(dpr, 1.5);
    return 1;
  }

  /** Called after a resize so the post chain can match the new backbuffer. */
  onResize?: () => void;

  private resize = (): void => {
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this.onResize?.();
  };

  get aspect(): number {
    return window.innerWidth / Math.max(window.innerHeight, 1);
  }

  /**
   * Watches frame cost over a rolling window and steps the tier down when the
   * device clearly cannot hold the budget. It never steps back up: flapping
   * between tiers looks worse than sitting one notch low.
   */
  sampleFrame(frameMs: number, nowSeconds: number): void {
    if (this.tier === 'low') return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 90) return;

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.frameTimes.length = 0;

    // Demote at a sustained ~28fps or worse, and only once every few seconds.
    if (median > 34 && nowSeconds - this.lastDemote > 4) {
      this.lastDemote = nowSeconds;
      this.tier = this.tier === 'high' ? 'medium' : 'low';
      this.gl.setPixelRatio(this.pixelRatioFor(this.tier));
      this.gl.shadowMap.enabled = this.tier !== 'low';
      this.onTierChange?.(this.tier);
    }
  }

  render(scene: Scene, camera: Camera): void {
    this.gl.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.gl.dispose();
  }
}

function guessTier(): QualityTier {
  const dpr = window.devicePixelRatio || 1;
  const px = window.innerWidth * window.innerHeight * dpr * dpr;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (cores <= 4 || mem <= 3 || px > 4_500_000) return 'low';
  if (cores <= 6 || mem <= 6) return 'medium';
  return 'high';
}
