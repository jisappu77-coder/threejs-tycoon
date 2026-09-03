import { VEHICLE_FOOTPRINT } from '../data/config';
import type { Vehicle } from './Vehicle';

/**
 * Keeps vehicles from driving through each other.
 *
 * Routes are authored so that no route ends inside another bay, but they still
 * share aisles and cross at junctions — a forecourt is not a set of disjoint
 * tracks. So rather than trying to make the layout collision-free, this pass
 * runs once per simulation step and makes a vehicle hold position when another
 * one occupies the road immediately in front of it.
 *
 * It is deliberately a "yield or go" decision rather than a speed ramp: a
 * vehicle either has room or it does not, and at this scale a car easing into a
 * gap is indistinguishable from one stopping a beat and then moving.
 */

/** How far ahead a vehicle looks, beyond the two vehicles' own half-lengths. */
const GAP = 2.2;
/** How far off the centre line another vehicle still counts as "in the way". */
const HALF_WIDTH = 2.6;

interface Placed {
  vehicle: Vehicle;
  /** Unit vector the vehicle is travelling along, or null when stationary. */
  dirX: number;
  dirZ: number;
  moving: boolean;
  half: number;
}

function place(vehicle: Vehicle): Placed {
  const half = VEHICLE_FOOTPRINT[vehicle.kind] / 2;
  const next = vehicle.waypoints[0];
  if (!next) {
    // A cruising vehicle with no waypoints drives straight along +X; anything
    // else with nothing left to drive to is parked.
    const cruising = vehicle.state === 'cruising';
    return { vehicle, dirX: 1, dirZ: 0, moving: cruising, half };
  }
  const dx = next.x - vehicle.x;
  const dz = next.z - vehicle.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { vehicle, dirX: 1, dirZ: 0, moving: false, half };
  return { vehicle, dirX: dx / dist, dirZ: dz / dist, moving: true, half };
}

/** True when `other` sits in the corridor directly ahead of `self`. */
function blocks(self: Placed, other: Placed): boolean {
  const dx = other.vehicle.x - self.vehicle.x;
  const dz = other.vehicle.z - self.vehicle.z;
  // Distance along the direction of travel, and offset perpendicular to it.
  const ahead = dx * self.dirX + dz * self.dirZ;
  if (ahead <= 0) return false;
  // Measure clearance against the other vehicle's extent, not just its centre.
  // A hauler crossing a junction broadside occupies four and a half metres
  // either side of its centre; testing the centre alone means it stays
  // invisible until the two are already interpenetrating.
  const lateral = Math.abs(dx * self.dirZ - dz * self.dirX);
  if (lateral > HALF_WIDTH + other.half) return false;
  return ahead < self.half + other.half + GAP;
}

/**
 * Sets `yielding` on every vehicle that has to wait this step.
 *
 * Head-on and crossing pairs would otherwise deadlock — each waiting for the
 * other — so ties are broken by spawn order: the vehicle that has been on the
 * road longer goes first. That is arbitrary, but it is *consistently*
 * arbitrary, which is what stops two vehicles staring at each other forever.
 */
export function applySeparation(vehicles: Vehicle[]): void {
  const placed = vehicles.map(place);
  for (const self of placed) self.vehicle.yielding = false;

  for (const self of placed) {
    if (!self.moving) continue;
    for (const other of placed) {
      if (other === self) continue;
      if (!blocks(self, other)) continue;
      // A stationary vehicle (parked in a bay, or waiting in the queue) is an
      // obstacle that will not move out of the way, so always yield to it.
      if (!other.moving) {
        self.vehicle.yielding = true;
        break;
      }
      // Two moving vehicles in each other's way: the older one has priority.
      if (blocks(other, self) && precedes(self.vehicle, other.vehicle)) continue;
      self.vehicle.yielding = true;
      break;
    }
  }
}

/** Spawn order, recovered from the `v<n>` id the vehicle was created with. */
function precedes(a: Vehicle, b: Vehicle): boolean {
  return Number(a.id.slice(1)) < Number(b.id.slice(1));
}
