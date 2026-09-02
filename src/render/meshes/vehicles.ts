import { Group, Mesh, type BufferGeometry } from 'three';
import { box, cylinder } from './geometry';
import { PALETTE, mat } from '../materials';
import type { VehicleKind } from '../../data/config';

/**
 * Procedural low-poly vehicles. Each builder returns a Group whose origin is
 * on the ground at the vehicle's centre, facing +X.
 */

function part(
  g: BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
  parent: Group,
  shadows = true,
): Mesh {
  const m = new Mesh(g, mat(color));
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function wheels(parent: Group, positions: number[], z: number, r = 0.45): void {
  for (const x of positions) {
    for (const side of [-z, z]) {
      const w = new Mesh(cylinder(r, 0.32, 7), mat(PALETTE.tyre));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, r, side);
      parent.add(w);
    }
  }
}

export function buildTruck(cabColor: number = PALETTE.truckCab): Group {
  const g = new Group();
  // trailer
  part(box(6.4, 2.6, 2.5), PALETTE.truckTrailer, -1.6, 2.0, 0, g);
  part(box(6.6, 0.3, 2.6), PALETTE.tyre, -1.6, 0.68, 0, g);
  // cab
  part(box(2.6, 2.2, 2.4), cabColor, 3.4, 1.6, 0, g);
  part(box(1.0, 0.9, 2.2), PALETTE.glass, 4.4, 2.2, 0, g);
  part(box(0.5, 0.7, 2.0), PALETTE.tyre, 4.9, 0.9, 0, g);
  // exhaust
  part(cylinder(0.12, 1.6, 6), PALETTE.rock, 2.2, 2.9, -1.0, g);
  wheels(g, [3.6, -0.4, -2.2, -3.8], 1.15, 0.52);
  return g;
}

export function buildVan(color: number): Group {
  const g = new Group();
  part(box(4.4, 2.0, 2.1), color, -0.2, 1.5, 0, g);
  part(box(1.4, 1.3, 2.0), color, 2.2, 1.1, 0, g);
  part(box(0.4, 0.7, 1.8), PALETTE.glass, 2.75, 1.5, 0, g);
  wheels(g, [1.9, -1.7], 0.95, 0.42);
  return g;
}

export function buildCar(color: number): Group {
  const g = new Group();
  part(box(3.9, 0.85, 1.85), color, 0, 0.85, 0, g);
  part(box(2.1, 0.75, 1.65), color, -0.15, 1.6, 0, g);
  part(box(1.9, 0.45, 1.7), PALETTE.glass, -0.15, 1.75, 0, g);
  wheels(g, [1.3, -1.3], 0.85, 0.38);
  return g;
}

export function buildBus(color: number): Group {
  const g = new Group();
  part(box(8.2, 2.6, 2.5), color, 0, 1.9, 0, g);
  part(box(8.3, 0.5, 2.55), PALETTE.lineWhite, 0, 2.5, 0, g);
  part(box(1.4, 1.0, 2.4), PALETTE.glass, 3.5, 2.4, 0, g);
  wheels(g, [3.0, -1.0, -2.6], 1.15, 0.5);
  return g;
}

export function buildVehicle(kind: VehicleKind, colorIndex: number): Group {
  const color = PALETTE.carBodies[colorIndex % PALETTE.carBodies.length]!;
  switch (kind) {
    case 'truck':
      return buildTruck(colorIndex % 2 === 0 ? PALETTE.truckCab : PALETTE.truckCabAlt);
    case 'van':
      return buildVan(color);
    case 'bus':
      return buildBus(color);
    case 'car':
    default:
      return buildCar(color);
  }
}

/** Rough length of each vehicle, used for queue spacing and bay offsets. */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  truck: 9,
  bus: 8.2,
  van: 5,
  car: 4,
};
