import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer,
  type Camera,
} from 'three';

export type QualityTier = 'low' | 'medium' | 'high';

/**
 * What each tier actually costs. Kept as one table so every system reads the
 * same numbers instead of each inventing its own tier rules.
 *
 * The guiding principle, learned the hard way: **resolution is the thing to
 * trade, not lighting.** An earlier version disabled shadows and anti-aliasing
 * on the low tier, which made the game look broken rather than cheap. Every
 * tier now gets shadows and AA; the tier scales how much they cost.
 */
export interface TierSettings {
  /** Cap on devicePixelRatio — by far the biggest lever on fill rate. */
  pixelRatio: number;
  /** Directional shadow map resolution. */
  shadowMapSize: number;
  /** MSAA samples on the post-processing render target. */
  samples: number;
  /** Scenery instance count. */
  trees: number;
  /**
   * Distant instanced traffic count. Capped by spacing rather than by cost:
   * these cars are evenly dealt along the road, so a higher count means a
   * shorter gap between them, and past about thirty they start to overlap.
   */
  ambientTraffic: number;
  /** Bloom is a multi-pass blur; only worth it when there is headroom. */
  bloom: boolean;
  /**
   * Contact shadows under objects. Screen-space AO (GTAOPass) was tried here
   * first and crushed whole surfaces to black at this camera's depth range;
   * baked contact blobs are cheaper and behave predictably.
   */
  contactShadows: boolean;
  /** Strength of image-based lighting reflections. */
  envIntensity: number;
}

export const TIERS: Record<QualityTier, TierSettings> = {
  low: {
    pixelRatio: 1.25,
    shadowMapSize: 512,
    samples: 0,
    trees: 90,
    ambientTraffic: 12,
    bloom: false,
    contactShadows: false,
    envIntensity: 0.55,
  },
  medium: {
    pixelRatio: 1.5,
    shadowMapSize: 1024,
    samples: 4,
    trees: 170,
    ambientTraffic: 20,
    bloom: true,
    contactShadows: true,
    envIntensity: 0.85,
  },
  high: {
    pixelRatio: 2,
    shadowMapSize: 2048,
    samples: 4,
    trees: 260,
    ambientTraffic: 30,
    bloom: true,
    contactShadows: true,
    envIntensity: 1,
  },
};

/**
 * Owns the WebGL context and the quality tier. The tier is guessed at boot from
 * the device, can be forced for testing, and is demoted at runtime if frames are
 * consistently slow.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  tier: QualityTier;

  private onTierChange?: (tier: QualityTier) => void;
  private frameTimes: number[] = [];
  private lastDemote = 0;
  /** A forced tier disables automatic demotion, so a test stays at its tier. */
  private readonly forced: boolean;

  constructor(canvas: HTMLCanvasElement) {
    const forced = forcedTier();
    this.forced = forced !== null;
    this.tier = forced ?? guessTier();

    this.gl = new WebGLRenderer({
      canvas,
      // Context-level MSAA does nothing once rendering goes through an
      // EffectComposer render target; anti-aliasing is handled there instead
      // via a multisampled target (see settings.samples).
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    // Filmic tone mapping keeps the warm key light from blowing out to flat
    // white and rolls the shadows off gently.
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.applyTier();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
  }

  get settings(): TierSettings {
    return TIERS[this.tier];
  }

  onTier(fn: (tier: QualityTier) => void): void {
    this.onTierChange = fn;
    fn(this.tier);
  }

  private applyTier(): void {
    const dpr = window.devicePixelRatio || 1;
    this.gl.setPixelRatio(Math.min(dpr, this.settings.pixelRatio));
  }

  /** Switches tier at runtime. Used by the automatic demotion and by tests. */
  setTier(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.applyTier();
    this.resize();
    this.onTierChange?.(tier);
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
    if (this.forced || this.tier === 'low') return;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 90) return;

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.frameTimes.length = 0;

    // Demote at a sustained ~28fps or worse, and only once every few seconds.
    if (median > 34 && nowSeconds - this.lastDemote > 4) {
      this.lastDemote = nowSeconds;
      this.setTier(this.tier === 'high' ? 'medium' : 'low');
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

/**
 * An explicit quality choice from `?quality=high` or a saved preference. This
 * exists so a tier can be captured deliberately in a screenshot, and so a
 * player can override a bad guess on their own phone.
 */
function forcedTier(): QualityTier | null {
  const fromUrl = new URLSearchParams(window.location.search).get('quality');
  const stored = safeGet('highway-tycoon:quality');
  const value = fromUrl ?? stored;
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Guesses a tier from the device. Deliberately does NOT demote on high pixel
 * counts: a sharp screen is a reason to cap pixel ratio, never a reason to turn
 * the lighting off.
 */
function guessTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 6 || mem <= 4) return 'medium';
  return 'high';
}
