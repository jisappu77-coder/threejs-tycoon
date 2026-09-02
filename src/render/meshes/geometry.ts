import {
  BoxGeometry,
  CylinderGeometry,
  ConeGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Geometry cache. Primitives are built once and shared by reference across
 * every mesh that uses the same dimensions; only the mesh transform differs.
 *
 * `rbox` is the workhorse: a bevelled box catches a highlight along every edge,
 * which is most of the difference between a toy-like stylised look and a pile
 * of flat cubes. Bevels cost a few triangles and no draw calls.
 */
const cache = new Map<string, BufferGeometry>();

function memo<T extends BufferGeometry>(key: string, build: () => T): T {
  let g = cache.get(key) as T | undefined;
  if (!g) {
    g = build();
    cache.set(key, g);
  }
  return g;
}

/** Sharp-edged box. Use for thin plates and anything hidden. */
export function box(w: number, h: number, d: number): BoxGeometry {
  return memo(`b${w},${h},${d}`, () => new BoxGeometry(w, h, d));
}

/**
 * Rounded box. The radius is clamped to the smallest half-extent so a thin
 * slab bevels rather than collapsing into a pill.
 */
export function rbox(w: number, h: number, d: number, radius = 0.12, segments = 2) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 0.001);
  return memo(
    `r${w},${h},${d},${r.toFixed(3)},${segments}`,
    () => new RoundedBoxGeometry(w, h, d, segments, r),
  );
}

export function cylinder(r: number, h: number, segments = 10): CylinderGeometry {
  return memo(`c${r},${h},${segments}`, () => new CylinderGeometry(r, r, h, segments));
}

/** Tapered cylinder, for tree trunks and chimneys. */
export function taper(
  rTop: number,
  rBottom: number,
  h: number,
  segments = 8,
): CylinderGeometry {
  return memo(
    `tp${rTop},${rBottom},${h},${segments}`,
    () => new CylinderGeometry(rTop, rBottom, h, segments),
  );
}

export function cone(r: number, h: number, segments = 8): ConeGeometry {
  return memo(`k${r},${h},${segments}`, () => new ConeGeometry(r, h, segments));
}

export function sphere(r: number, segments = 10): SphereGeometry {
  return memo(
    `s${r},${segments}`,
    () => new SphereGeometry(r, segments, Math.max(4, segments >> 1)),
  );
}

/** Torus, used for tyre stacks and the odd hoop. */
export function torus(r: number, tube: number, segments = 10): TorusGeometry {
  return memo(
    `to${r},${tube},${segments}`,
    () => new TorusGeometry(r, tube, 6, segments),
  );
}
