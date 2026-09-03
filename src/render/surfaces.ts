import {
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Texture,
} from 'three';
import { inlinedUrl } from './inlined';

/**
 * Photographic PBR surfaces for the ground and road (CC0, see
 * public/textures/CREDITS.md).
 *
 * The canvas-painted textures these replace carried colour but no *relief*:
 * with only a colour map, tarmac and grass stay perfectly flat however good the
 * lighting is. A normal map is what lets a low sun rake across the road and
 * pick out its grain, and it is the difference between "a grey plane" and "a
 * surface".
 *
 * Poly Haven ships an ARM map — ambient occlusion in red, roughness in green,
 * metalness in blue — and three samples exactly those channels, so one file
 * covers roughness (the channel that matters here) instead of three.
 *
 * Only the road is photographic. Photographic *grass* was tried and dropped:
 * Poly Haven's ground sets are naturalistic — dry, rocky, leaf-littered — and
 * next to Kenney's saturated stylised models they read as mud rather than as
 * detail. The procedural grass in `textures.ts` suits the art direction, and
 * now that it is shaded with a Standard material it still picks up the
 * environment light.
 */

export type SurfaceName = 'asphalt';

interface SurfaceMaps {
  diff: Texture;
  nor: Texture;
  arm: Texture;
}

const BASE = import.meta.env.BASE_URL ?? './';
const loaded = new Map<SurfaceName, SurfaceMaps>();
const materials = new Map<string, MeshStandardMaterial>();

/** Loads every surface set. Call during boot, before the world is built. */
export async function loadSurfaces(): Promise<void> {
  const loader = new TextureLoader();
  const names: SurfaceName[] = ['asphalt'];

  await Promise.all(
    names.map(async (name) => {
      try {
        const url = (suffix: string): string => {
          const path = `textures/${name}_${suffix}.jpg`;
          return inlinedUrl(path) ?? `${BASE}${path}`;
        };
        const [diff, nor, arm] = await Promise.all([
          loader.loadAsync(url('diff')),
          loader.loadAsync(url('nor')),
          loader.loadAsync(url('arm')),
        ]);
        // Only the colour map is sRGB; normal and ARM carry data, not colour,
        // and converting them would corrupt the values.
        diff.colorSpace = SRGBColorSpace;
        for (const t of [diff, nor, arm]) {
          t.wrapS = RepeatWrapping;
          t.wrapT = RepeatWrapping;
          t.anisotropy = 4;
        }
        loaded.set(name, { diff, nor, arm });
      } catch (error) {
        // The caller falls back to the procedural textures.
        console.error(`Surface set ${name} failed to load`, error);
      }
    }),
  );
}

export function hasSurface(name: SurfaceName): boolean {
  return loaded.has(name);
}

/**
 * A material for a surface, tiled to the real proportions of the thing it is
 * painted on. A box face maps UVs 0..1 whatever its size, so without this the
 * grain stretches on every non-square surface.
 */
export function surfaceMaterial(
  name: SurfaceName,
  width: number,
  depth: number,
  unitsPerTile = 8,
  tint = 0xffffff,
): MeshStandardMaterial | null {
  const maps = loaded.get(name);
  if (!maps) return null;

  const rx = Math.max(1, Math.round(width / unitsPerTile));
  const ry = Math.max(1, Math.round(depth / unitsPerTile));
  const key = `${name}:${rx}:${ry}:${tint}`;
  const hit = materials.get(key);
  if (hit) return hit;

  // Clones share the uploaded image but carry their own repeat.
  const repeat = new Vector2(rx, ry);
  const diff = maps.diff.clone();
  const nor = maps.nor.clone();
  const arm = maps.arm.clone();
  for (const t of [diff, nor, arm]) {
    t.repeat.copy(repeat);
    t.needsUpdate = true;
  }

  const material = new MeshStandardMaterial({
    map: diff,
    normalMap: nor,
    // Green channel of the ARM map; three reads roughness from .g.
    roughnessMap: arm,
    color: tint,
    roughness: 1,
    metalness: 0,
  });
  materials.set(key, material);
  return material;
}
