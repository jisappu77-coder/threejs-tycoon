import {
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { inlinedUrl } from './inlined';

/**
 * Image-based lighting from a CC0 sky HDRI (see public/env/CREDITS.md).
 *
 * This is the single biggest quality lever in the renderer. Without an
 * environment, `MeshStandardMaterial` has nothing to reflect: paint and glass
 * come out as flat matte colour no matter how good the model is. A prefiltered
 * environment gives every surface something to pick up, and fills the shadow
 * side with sky colour instead of a flat ambient constant.
 *
 * Only the *lighting* comes from the HDRI. The visible background stays the
 * gradient sky dome, which is cheaper to draw and art-directed to match the fog.
 */
const BASE = import.meta.env.BASE_URL ?? './';

let cached: Texture | null = null;

export async function loadEnvironment(renderer: WebGLRenderer): Promise<Texture | null> {
  if (cached) return cached;
  try {
    const path = 'env/sky_1k.hdr';
    const hdr = await new RGBELoader().loadAsync(inlinedUrl(path) ?? `${BASE}${path}`);
    hdr.mapping = EquirectangularReflectionMapping;

    const pmrem = new PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromEquirectangular(hdr);
    cached = target.texture;

    // The source equirect is no longer needed once it has been prefiltered.
    hdr.dispose();
    pmrem.dispose();
    return cached;
  } catch (error) {
    // Lighting degrades to the analytic lights rather than failing to boot.
    console.error('Environment map failed to load; falling back to lights only', error);
    return null;
  }
}

export function applyEnvironment(scene: Scene, environment: Texture | null): void {
  if (environment) scene.environment = environment;
}
