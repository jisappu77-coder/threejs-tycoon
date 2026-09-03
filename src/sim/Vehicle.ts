import { VEHICLES, type VehicleKind, type VehicleSpec, type Waypoint } from '../data/config';

export type { Waypoint };

export type VehicleState =
  /** On the highway, not (yet) a customer. */
  | 'cruising'
  /** Left the highway, driving into the forecourt. */
  | 'entering'
  /** Parked in the waiting line. */
  | 'queued'
  /** Driving from the queue to an assigned bay. */
  | 'toBay'
  /** Parked in a bay, waiting for or receiving service. */
  | 'servicing'
  /** Serviced and paid, driving back to the highway. */
  | 'leaving'
  /** Off the far end of the highway; ready to be recycled. */
  | 'done';

let nextId = 1;

/**
 * One interactive vehicle. Deliberately free of three.js: the mesh is attached
 * by the renderer layer as `view`, and every rule here is plain arithmetic so
 * the state machine can be unit tested without a WebGL context.
 */
export class Vehicle {
  readonly id = `v${nextId++}`;
  readonly spec: VehicleSpec;
  readonly colorIndex: number;

  x: number;
  z: number;
  heading: number;
  state: VehicleState = 'cruising';

  /** Points the vehicle is currently driving through, in order. */
  waypoints: Waypoint[] = [];

  /** Set once the stop accepts this vehicle; which service it wants. */
  wantsStation: string | null = null;
  bayId: string | null = null;
  queueIndex = -1;

  /** Seconds of work done, and how many are needed for this vehicle. */
  serviceProgress = 0;
  serviceNeeded = 0;

  /** Seconds spent waiting, used to make impatient drivers leave. */
  patience = 0;

  /** Set once the stop has had its chance to pull this vehicle in. */
  offered = false;

  /**
   * Set each step by the separation pass when the road ahead is blocked. A
   * yielding vehicle holds its position and heading rather than driving into
   * the back of whoever is in front of it.
   */
  yielding = false;

  /** Attached by the view layer; the sim never reads it. */
  view: unknown = null;

  constructor(kind: VehicleKind, x: number, z: number, colorIndex = 0) {
    this.spec = VEHICLES[kind];
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.colorIndex = colorIndex;
  }

  get kind(): VehicleKind {
    return this.spec.kind;
  }

  /** True once every queued waypoint has been reached. */
  get arrived(): boolean {
    return this.waypoints.length === 0;
  }

  get serviceRatio(): number {
    if (this.serviceNeeded <= 0) return 0;
    return Math.min(1, this.serviceProgress / this.serviceNeeded);
  }

  get serviceComplete(): boolean {
    return this.serviceNeeded > 0 && this.serviceProgress >= this.serviceNeeded;
  }

  setPath(points: Waypoint[]): void {
    this.waypoints = points.slice();
  }

  /** Adds seconds of service work. Returns true if this completed the job. */
  work(seconds: number): boolean {
    if (this.serviceComplete) return false;
    this.serviceProgress += seconds;
    return this.serviceComplete;
  }

  /**
   * Advances one fixed step. Cruising vehicles drive straight down the lane;
   * everything else follows its waypoint list, easing its heading round so
   * turns look driven rather than snapped.
   */
  update(dt: number): void {
    if (this.state === 'servicing' || this.state === 'done') {
      if (this.state === 'servicing') this.patience += dt;
      return;
    }

    if (this.state === 'cruising' && this.waypoints.length === 0) {
      if (this.yielding) return;
      this.x += this.spec.speed * dt;
      this.heading = 0;
      return;
    }

    if (this.state === 'queued') this.patience += dt;
    if (this.yielding) return;

    const target = this.waypoints[0];
    if (!target) return;

    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    // Slow down for the last stretch so vehicles settle into bays.
    const speed = this.spec.speed * (dist < 6 ? Math.max(0.28, dist / 6) : 1);
    const step = speed * dt;

    if (dist <= Math.max(step, 0.12)) {
      this.x = target.x;
      this.z = target.z;
      this.waypoints.shift();
      return;
    }

    this.x += (dx / dist) * step;
    this.z += (dz / dist) * step;

    const want = Math.atan2(-dz, dx);
    this.heading = turnToward(this.heading, want, dt * 4.5);
  }
}

/** Rotates `from` toward `to` by at most `maxDelta`, across the ±π wrap. */
export function turnToward(from: number, to: number, maxDelta: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return to;
  return from + Math.sign(diff) * maxDelta;
}
