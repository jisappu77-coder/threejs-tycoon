import { BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry } from 'three';

/**
 * Geometry cache. Primitives are built once and shared by reference across
 * every mesh that uses the same dimensions; only the mesh transform differs.
 */
const boxes = new Map<string, BoxGeometry>();
const cylinders = new Map<string, CylinderGeometry>();
const cones = new Map<string, ConeGeometry>();
const spheres = new Map<string, SphereGeometry>();

export function box(w: number, h: number, d: number): BoxGeometry {
  const key = `${w},${h},${d}`;
  let g = boxes.get(key);
  if (!g) {
    g = new BoxGeometry(w, h, d);
    boxes.set(key, g);
  }
  return g;
}

export function cylinder(r: number, h: number, segments = 8): CylinderGeometry {
  const key = `${r},${h},${segments}`;
  let g = cylinders.get(key);
  if (!g) {
    g = new CylinderGeometry(r, r, h, segments);
    cylinders.set(key, g);
  }
  return g;
}

export function cone(r: number, h: number, segments = 7): ConeGeometry {
  const key = `${r},${h},${segments}`;
  let g = cones.get(key);
  if (!g) {
    g = new ConeGeometry(r, h, segments);
    cones.set(key, g);
  }
  return g;
}

export function sphere(r: number, segments = 8): SphereGeometry {
  const key = `${r},${segments}`;
  let g = spheres.get(key);
  if (!g) {
    g = new SphereGeometry(r, segments, Math.max(4, segments >> 1));
    spheres.set(key, g);
  }
  return g;
}
