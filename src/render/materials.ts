import {
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Texture,
} from 'three';

/**
 * One shared material per colour (and per colour+texture pair). Creating a
 * material per mesh is the single biggest avoidable cost on low-end Android —
 * every unique material is a separate shader program and a broken batch — so
 * everything draws from here.
 *
 * These are `MeshStandardMaterial` so they respond to the environment map the
 * same way the glTF models do. A scene that mixes Lambert and Standard reads as
 * two different worlds bolted together: the Lambert half stays flat while
 * everything around it picks up sky reflections.
 */
const cache = new Map<string, MeshStandardMaterial>();

export function mat(color: number, opts?: { flatShading?: boolean }): MeshStandardMaterial {
  const key = `${color}:${opts?.flatShading ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      // Smooth shading by default now that geometry is bevelled: flat shading
      // on a rounded box throws away the soft edge highlight that sells it.
      flatShading: opts?.flatShading ?? false,
      roughness: 0.82,
      metalness: 0.04,
    });
    cache.set(key, m);
  }
  return m;
}

let texKey = 0;
const texIds = new WeakMap<Texture, number>();

/** A shared material that tints a procedural texture. */
export function texMat(
  texture: Texture,
  color = 0xffffff,
  opts?: { flatShading?: boolean },
): MeshStandardMaterial {
  let id = texIds.get(texture);
  if (id === undefined) {
    id = texKey++;
    texIds.set(texture, id);
  }
  const key = `t${id}:${color}:${opts?.flatShading ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      map: texture,
      color,
      flatShading: opts?.flatShading ?? false,
      roughness: 0.9,
      metalness: 0.02,
    });
    cache.set(key, m);
  }
  return m;
}

const basicCache = new Map<number, MeshBasicMaterial>();

/** Unlit material for things that should read as self-illuminated. */
export function basic(color: number): MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

const emissiveCache = new Map<number, MeshStandardMaterial>();

/** Lit material with an emissive lift — lamps, signs, brake lights. */
export function glow(color: number, strength = 0.85): MeshStandardMaterial {
  const key = color * 100 + Math.round(strength * 10);
  let m = emissiveCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color,
      emissive: new Color(color),
      emissiveIntensity: strength,
      roughness: 0.6,
      metalness: 0,
    });
    emissiveCache.set(key, m);
  }
  return m;
}

/** A cloned material — only for the few objects that animate opacity/colour. */
export function unique(color: number, transparent = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    transparent,
    opacity: transparent ? 0.45 : 1,
    roughness: 0.8,
    metalness: 0,
  });
}

export const PALETTE = {
  asphalt: 0x3c414b,
  asphaltDark: 0x30343d,
  lineWhite: 0xe8ecef,
  lineYellow: 0xf0c94a,
  concrete: 0x9aa0a8,
  kerb: 0xbfc4ca,
  grass: 0x6f8f4f,
  grassDark: 0x5c7a41,
  dirt: 0xa8875c,
  rock: 0x7b7f86,
  rockLight: 0x969ba3,
  snow: 0xeef2f6,
  hill: 0x5a7a48,
  hillFar: 0x4d6b46,
  treeTrunk: 0x6b4a2f,
  treeLeaf: 0x3f7a3a,
  treeLeafAlt: 0x4f8c40,
  treeLeafLight: 0x63a04b,
  bush: 0x4b8340,
  flowerA: 0xe8734a,
  flowerB: 0xf0d05a,
  cash: 0x4ddb7a,
  cashEdge: 0x2f9c55,
  gold: 0xffd24a,
  goldDeep: 0xe0a92c,
  truckCab: 0xd94f45,
  truckCabAlt: 0x3f7fd9,
  truckTrailer: 0xe4e7ea,
  carBodies: [0xd94f45, 0x3f7fd9, 0xf0c94a, 0xe8ecef, 0x4a4f57, 0x53b06a],
  glass: 0x3d5468,
  glassLight: 0x7fa8c4,
  chrome: 0xc8cdd4,
  tyre: 0x24272c,
  hub: 0xa9b0b8,
  headlight: 0xfff4d0,
  taillight: 0xff5a48,
  pumpBody: 0xe25b3a,
  pumpTrim: 0xf5f7f8,
  canopy: 0xf0f2f4,
  canopyTrim: 0xe25b3a,
  building: 0xe8d9be,
  buildingRoof: 0xc0553f,
  wood: 0x9c6b3f,
  fabric: 0x2f8f7a,
  worker: 0x2f6fd0,
  workerSkin: 0xd8a678,
  padGhost: 0x4ddb7a,
  padLocked: 0x8b93a0,
  sign: 0x2f3742,
  drum: 0x3f7fd9,
  crate: 0xb08149,
} as const;

/** Frees materials created with `unique()`; the cached ones live for the session. */
export function disposeMaterial(m: Material | Material[]): void {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}

export function lerpColor(a: number, b: number, t: number): Color {
  return new Color(a).lerp(new Color(b), t);
}
