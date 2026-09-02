import {
  Color,
  MeshLambertMaterial,
  type Material,
  MeshBasicMaterial,
} from 'three';

/**
 * One shared material per colour. Creating a material per mesh is the single
 * biggest avoidable cost on low-end Android (every unique material is a
 * separate shader program and a broken batch), so everything draws from here.
 */
const cache = new Map<string, MeshLambertMaterial>();

export function mat(color: number, opts?: { flatShading?: boolean }): MeshLambertMaterial {
  const key = `${color}:${opts?.flatShading ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshLambertMaterial({
      color,
      flatShading: opts?.flatShading ?? true,
    });
    cache.set(key, m);
  }
  return m;
}

const basicCache = new Map<number, MeshBasicMaterial>();

/** Unlit material for things that should read as self-illuminated (cash, glow). */
export function basic(color: number): MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

/** A cloned material — only for the few objects that animate opacity/colour. */
export function unique(color: number, transparent = false): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color,
    flatShading: true,
    transparent,
    opacity: transparent ? 0.45 : 1,
  });
}

export const PALETTE = {
  asphalt: 0x3c414b,
  asphaltDark: 0x30343d,
  lineWhite: 0xe8ecef,
  lineYellow: 0xf0c94a,
  concrete: 0x9aa0a8,
  grass: 0x6f8f4f,
  grassDark: 0x5c7a41,
  dirt: 0xa8875c,
  rock: 0x7b7f86,
  hill: 0x5a7a48,
  treeTrunk: 0x6b4a2f,
  treeLeaf: 0x3f7a3a,
  treeLeafAlt: 0x4f8c40,
  cash: 0x4ddb7a,
  cashEdge: 0x2f9c55,
  gold: 0xffd24a,
  truckCab: 0xd94f45,
  truckCabAlt: 0x3f7fd9,
  truckTrailer: 0xe4e7ea,
  carBodies: [0xd94f45, 0x3f7fd9, 0xf0c94a, 0xe8ecef, 0x4a4f57, 0x53b06a],
  glass: 0x2b3540,
  tyre: 0x24272c,
  pumpBody: 0xe25b3a,
  pumpTrim: 0xf5f7f8,
  canopy: 0xf0f2f4,
  canopyTrim: 0xe25b3a,
  building: 0xe8d9be,
  buildingRoof: 0xc0553f,
  wood: 0x9c6b3f,
  worker: 0x2f6fd0,
  workerSkin: 0xd8a678,
  padGhost: 0x4ddb7a,
  padLocked: 0x8b93a0,
  sign: 0x2f3742,
} as const;

/** Frees materials created with `unique()`; the cached ones live for the session. */
export function disposeMaterial(m: Material | Material[]): void {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}

export function lerpColor(a: number, b: number, t: number): Color {
  return new Color(a).lerp(new Color(b), t);
}
