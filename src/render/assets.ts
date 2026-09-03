import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inlinedUrl } from './inlined';

/**
 * Loads the Kenney CC0 model kits (see public/models/CREDITS.md) and hands out
 * ready-to-use clones.
 *
 * Two things happen at load time that matter for both looks and performance:
 *
 * 1. **Material dedup.** Every model in a Kenney kit samples that kit's shared
 *    colour atlas, but each `.glb` arrives with its own material instance.
 *    Left alone that is one material — and one shader program — per model,
 *    which breaks batching. Here they are folded into one material per atlas,
 *    so a whole kit draws with a single material.
 * 2. **Normalising.** The kits are authored at their own scale and facing, so
 *    each entry declares the length it should be in world units and the loader
 *    derives the scale from the model's real bounding box. Nothing depends on
 *    hand-tuned magic numbers that break when a kit is updated.
 */

export type ModelId =
  // vehicles
  | 'boxTruck'
  | 'flatbed'
  | 'pickup'
  | 'van'
  | 'sedan'
  | 'suv'
  | 'taxi'
  | 'police'
  | 'ambulance'
  // nature
  | 'treeDefault'
  | 'treeOak'
  | 'treeCone'
  | 'treeDetailed'
  | 'bush'
  | 'bushLarge'
  | 'rockLarge'
  | 'rockSmall'
  | 'grassTuft'
  // city
  | 'canteenBuilding'
  | 'awning'
  | 'parasol'
  | 'tank'
  | 'container'
  | 'waterTower'
  | 'pole'
  | 'cone'
  | 'barrier'
  | 'streetLight'
  | 'dumpster'
  // people
  | 'workerA'
  | 'workerB';

interface ModelSpec {
  url: string;
  /**
   * Target size in world units. `length` normalises against the longest
   * horizontal axis (right for vehicles and buildings); `height` normalises
   * against Y, which is what tall thin things like trees, poles and people
   * need — sizing a tree by its width makes it enormous.
   */
  length?: number;
  height?: number;
  /** Extra Y rotation so the model faces +X, the direction vehicles travel. */
  turn?: number;
}

const BASE = import.meta.env.BASE_URL ?? './';

const MODELS: Record<ModelId, ModelSpec> = {
  // Kenney's vehicles are modelled facing +Z; the game drives along +X.
  boxTruck: { url: 'cars/delivery.glb', length: 8.6, turn: Math.PI / 2 },
  flatbed: { url: 'cars/truck-flat.glb', length: 9, turn: Math.PI / 2 },
  pickup: { url: 'cars/truck.glb', length: 6.4, turn: Math.PI / 2 },
  van: { url: 'cars/van.glb', length: 6, turn: Math.PI / 2 },
  sedan: { url: 'cars/sedan.glb', length: 4.6, turn: Math.PI / 2 },
  suv: { url: 'cars/suv.glb', length: 4.9, turn: Math.PI / 2 },
  taxi: { url: 'cars/taxi.glb', length: 4.7, turn: Math.PI / 2 },
  police: { url: 'cars/police.glb', length: 4.8, turn: Math.PI / 2 },
  ambulance: { url: 'cars/ambulance.glb', length: 5.6, turn: Math.PI / 2 },

  treeDefault: { url: 'nature/tree_default.glb', height: 7 },
  treeOak: { url: 'nature/tree_oak.glb', height: 8 },
  treeCone: { url: 'nature/tree_cone.glb', height: 6.5 },
  treeDetailed: { url: 'nature/tree_detailed.glb', height: 7.5 },
  bush: { url: 'nature/plant_bush.glb', height: 1.1 },
  bushLarge: { url: 'nature/plant_bushLarge.glb', height: 1.7 },
  rockLarge: { url: 'nature/rock_largeA.glb', height: 1.6 },
  rockSmall: { url: 'nature/rock_smallA.glb', height: 0.8 },
  grassTuft: { url: 'nature/grass_large.glb', height: 0.7 },

  canteenBuilding: { url: 'commercial/building-e.glb', length: 15 },
  awning: { url: 'commercial/detail-awning-wide.glb', length: 6 },
  parasol: { url: 'commercial/detail-parasol-a.glb', length: 3 },
  tank: { url: 'industrial/detail-tank.glb', length: 5 },
  container: { url: 'industrial/shipping-container-a.glb', length: 6.5 },
  waterTower: { url: 'industrial/water-tower.glb', length: 6 },
  pole: { url: 'roads/electricity-pole.glb', height: 9 },
  cone: { url: 'roads/construction-cone.glb', height: 0.8 },
  barrier: { url: 'roads/construction-fence.glb', height: 1.2 },
  streetLight: { url: 'roads/light-square.glb', height: 7 },
  dumpster: { url: 'roads/dumpster.glb', length: 3 },

  workerA: { url: 'characters/character-male-b.glb', height: 1.8 },
  workerB: { url: 'characters/character-female-a.glb', height: 1.8 },
};

interface LoadedModel {
  root: Object3D;
  spec: ModelSpec;
}

const loaded = new Map<ModelId, LoadedModel>();
/**
 * One shared material per colour atlas. Each Kenney kit ships its own
 * `colormap.png`, so the key is the texture's source image — sharing globally
 * would paint every kit with whichever atlas happened to load first.
 */
const atlasMaterials = new Map<string, MeshStandardMaterial>();
const plainMaterials = new Map<string, MeshStandardMaterial>();

/**
 * Surface response per material class. Everything used to be Lambert, which has
 * no specular term at all — car paint and glass came out as matte clay however
 * good the model was. These values are what let the environment map actually
 * show up on a surface.
 */
interface Surface {
  roughness: number;
  metalness: number;
}

const PAINT: Surface = { roughness: 0.38, metalness: 0.1 };
const MATTE: Surface = { roughness: 0.92, metalness: 0 };
const FOLIAGE: Surface = { roughness: 0.85, metalness: 0 };
const METAL: Surface = { roughness: 0.35, metalness: 0.75 };

/**
 * Kenney's atlas packs paint, glass, tyres and trim into one texture, so a
 * per-pixel split is not available. Vehicles and props get a mild paint
 * response, which reads correctly on bodywork and is harmless on the rest.
 */
function surfaceFor(name: string | undefined): Surface {
  if (!name) return MATTE;
  if (name in NATURE_PALETTE) return name === 'leafsGreen' || name === 'grass' ? FOLIAGE : MATTE;
  return PAINT;
}

/** Kenney Nature Kit material name -> this game's palette. */
const NATURE_PALETTE: Record<string, number> = {
  leafsGreen: 0x4f8f3f,
  grass: 0x5f9a44,
  woodBark: 0x7a5233,
  dirt: 0x8a6b45,
};

function atlasKey(texture: Texture): string {
  const image = texture.image as { src?: string; currentSrc?: string } | undefined;
  return image?.src ?? image?.currentSrc ?? texture.uuid;
}

/**
 * Converts a glTF's PBR materials to the cheap Lambert this game lights with,
 * and folds every atlas-textured material into one shared instance.
 */
function adoptMaterial(source: Material): MeshStandardMaterial {
  const src = source as Material & {
    map?: Texture | null;
    color?: Color;
    name?: string;
  };

  if (src.map) {
    const key = atlasKey(src.map);
    let shared = atlasMaterials.get(key);
    if (!shared) {
      shared = new MeshStandardMaterial({
        map: src.map,
        roughness: PAINT.roughness,
        metalness: PAINT.metalness,
        envMapIntensity: 1,
      });
      atlasMaterials.set(key, shared);
    }
    return shared;
  }

  // The Nature Kit colours by material rather than by atlas, and its foliage
  // is a cool mint that clashes with this game's warmer grass. Those few
  // materials are remapped by name to the game palette so the whole world
  // reads as one place; everything else keeps the artist's colour.
  const remap = src.name ? NATURE_PALETTE[src.name] : undefined;
  const key = remap !== undefined ? `n${remap}` : `${src.color?.getHex() ?? 'white'}`;
  let m = plainMaterials.get(key);
  if (!m) {
    const surface = surfaceFor(src.name);
    m = new MeshStandardMaterial({
      roughness: surface.roughness,
      metalness: surface.metalness,
      envMapIntensity: 1,
    });
    if (remap !== undefined) {
      m.color.setHex(remap);
    } else if (src.color) {
      // Copied, not passed to the constructor: a glTF baseColorFactor is
      // already linear, and the constructor would convert it a second time.
      m.color.copy(src.color as unknown as Color);
    }
    plainMaterials.set(key, m);
  }
  return m;
}

function prepare(root: Object3D, spec: ModelSpec): Object3D {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.material = Array.isArray(node.material)
      ? node.material.map(adoptMaterial)
      : adoptMaterial(node.material);
    node.castShadow = true;
    node.receiveShadow = true;
  });

  // Scale from the model's real bounds to the size the game wants, and sit it
  // on the ground with its footprint centred on the origin.
  const wrapper = new Group();
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const scale =
    spec.height !== undefined
      ? spec.height / (size.y || 1)
      : (spec.length ?? 1) / (Math.max(size.x, size.z) || 1);
  root.scale.setScalar(scale);
  root.position.set(
    -((box.min.x + box.max.x) / 2) * scale,
    -box.min.y * scale,
    -((box.min.z + box.max.z) / 2) * scale,
  );
  if (spec.turn) root.rotation.y = spec.turn;
  wrapper.add(root);
  return wrapper;
}

/**
 * Loads every model. Call once at boot and await it before building the scene;
 * `onProgress` reports 0..1 for the loading screen.
 */
export async function loadAssets(onProgress?: (ratio: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const entries = Object.entries(MODELS) as [ModelId, ModelSpec][];
  let done = 0;

  await Promise.all(
    entries.map(async ([id, spec]) => {
      try {
        const gltf = await loader.loadAsync(
          inlinedUrl(`models/${spec.url}`) ?? `${BASE}models/${spec.url}`,
        );
        loaded.set(id, { root: prepare(gltf.scene, spec), spec });
      } catch (error) {
        // A missing model must not take the whole game down: callers fall back
        // to a primitive when `model()` returns null.
        console.error(`Failed to load model ${id} (${spec.url})`, error);
      } finally {
        done++;
        onProgress?.(done / entries.length);
      }
    }),
  );
}

/** A fresh clone of a loaded model, or null if it failed to load. */
export function model(id: ModelId): Group | null {
  const entry = loaded.get(id);
  if (!entry) return null;
  return entry.root.clone(true) as Group;
}

/**
 * The geometry and material of a single-mesh model, for building an
 * InstancedMesh — how the scenery is drawn, so hundreds of trees cost one call.
 */
export function meshOf(id: ModelId): { geometry: BufferGeometry; material: Material }[] {
  const entry = loaded.get(id);
  if (!entry) return [];
  const out: { geometry: BufferGeometry; material: Material }[] = [];
  entry.root.updateWorldMatrix(true, true);
  entry.root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    // Bake the normalising transform into the geometry so instance matrices
    // only carry placement.
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    out.push({
      geometry,
      material: Array.isArray(node.material) ? node.material[0]! : node.material,
    });
  });
  return out;
}

/** Finds named child nodes — Kenney rigs name wheels and limbs usefully. */
export function findByName(root: Object3D, test: (name: string) => boolean): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (node.name && test(node.name)) found.push(node);
  });
  return found;
}

export function isLoaded(id: ModelId): boolean {
  return loaded.has(id);
}

/**
 * Scales reflection strength across every loaded material. The low tier dials
 * the environment down rather than dropping it, so the look degrades smoothly
 * instead of snapping back to matte.
 */
export function setEnvIntensity(intensity: number): void {
  for (const m of atlasMaterials.values()) m.envMapIntensity = intensity;
  for (const m of plainMaterials.values()) m.envMapIntensity = intensity;
}

/** Unused-surface reference kept honest: METAL is applied via surfaceFor. */
export const SURFACES = { PAINT, MATTE, FOLIAGE, METAL };
