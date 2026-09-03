import { describe, expect, it } from 'vitest';
import { Vehicle } from './Vehicle';
import { TruckStop } from './TruckStop';
import { Economy } from './Economy';
import { Progression } from './Progression';
import { applySeparation } from './separation';
import { HIGHWAY, SERVICE, STATIONS, VEHICLE_FOOTPRINT } from '../data/config';

/**
 * The reported bug was vehicles sliding through each other around the pumps.
 * These tests assert the property directly — run the whole stop for a while
 * with traffic arriving and leaving, and check that no two vehicles ever
 * overlap — rather than checking any single route in isolation, because the
 * failure came from routes interacting.
 */

/** Half-width of every vehicle. They are all roughly a lane's worth wide. */
const HALF_WIDTH = 1.25;

/**
 * Separating-axis test on the two vehicles' oriented boxes. Treating a 9m
 * hauler as a circle — which is what a plain centre-distance check does —
 * reports an overlap whenever two long vehicles pass in neighbouring lanes,
 * which is not what the player sees and not what was reported.
 */
function overlapping(a: Vehicle, b: Vehicle): boolean {
  const boxA = box(a);
  const boxB = box(b);
  return !(separated(boxA, boxB) || separated(boxB, boxA));
}

interface Box {
  x: number;
  z: number;
  /** Half-extents along the box's own axes. */
  half: [number, number];
  /** The box's forward and side unit vectors. */
  axes: [[number, number], [number, number]];
}

function box(v: Vehicle): Box {
  const cos = Math.cos(v.heading);
  const sin = Math.sin(v.heading);
  // Heading 0 points along +X, and a positive heading turns toward -Z.
  return {
    x: v.x,
    z: v.z,
    half: [VEHICLE_FOOTPRINT[v.kind] / 2, HALF_WIDTH],
    axes: [
      [cos, -sin],
      [sin, cos],
    ],
  };
}

/** True if either of `a`'s axes separates the two boxes. */
function separated(a: Box, b: Box): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return a.axes.some((axis, i) => {
    const gap = Math.abs(dx * axis[0] + dz * axis[1]);
    const reach =
      a.half[i]! +
      b.axes.reduce(
        (sum, other, j) =>
          sum + b.half[j]! * Math.abs(other[0] * axis[0] + other[1] * axis[1]),
        0,
      );
    return gap > reach;
  });
}

describe('separation', () => {
  it('holds a vehicle that is closing on a stationary one ahead', () => {
    // Bumper-to-bumper gap of 1.2m: inside the following distance a truck keeps.
    const parked = new Vehicle('car', 8, 0);
    parked.state = 'servicing';
    const following = new Vehicle('truck', 0, 0);
    following.setPath([{ x: 30, z: 0 }]);

    applySeparation([parked, following]);
    expect(following.yielding).toBe(true);
    expect(parked.yielding).toBe(false);
  });

  it('lets a vehicle through once the one ahead has moved on', () => {
    const ahead = new Vehicle('car', 40, 0);
    ahead.state = 'servicing';
    const following = new Vehicle('truck', 0, 0);
    following.setPath([{ x: 30, z: 0 }]);

    applySeparation([ahead, following]);
    expect(following.yielding).toBe(false);
  });

  it('ignores a vehicle in an adjacent lane', () => {
    const other = new Vehicle('car', 4, 9);
    other.state = 'servicing';
    const driving = new Vehicle('truck', 0, 0);
    driving.setPath([{ x: 30, z: 0 }]);

    applySeparation([other, driving]);
    expect(driving.yielding).toBe(false);
  });

  it('breaks a head-on deadlock so one vehicle still moves', () => {
    const a = new Vehicle('car', 0, 0);
    a.setPath([{ x: 30, z: 0 }]);
    const b = new Vehicle('car', 5, 0);
    b.setPath([{ x: -30, z: 0 }]);

    applySeparation([a, b]);
    expect([a.yielding, b.yielding]).toContain(false);
  });

  it('spaces queue slots wider than the longest vehicle', () => {
    const longest = Math.max(...Object.values(VEHICLE_FOOTPRINT));
    expect(SERVICE.queueSpacing).toBeGreaterThan(longest);
  });

  it('never lets two vehicles occupy the same space over a long run', () => {
    const stop = new TruckStop(new Economy(), new Progression());
    // Open everything, so all four bays and both routes are in play — the
    // canteen is where the reported overlap happened.
    for (const def of STATIONS) {
      const station = stop.stations.find((s) => s.id === def.id)!;
      station.unlocked = true;
      while (station.openNextBay()) {
        /* open every bay */
      }
    }

    const live: Vehicle[] = [];
    const dt = 1 / 60;
    let spawnIn = 0;
    let worst = Infinity;
    let served = 0;
    stop.hooks = { onServiceComplete: () => (served += 1) };

    for (let step = 0; step < 60 * 180; step++) {
      spawnIn -= dt;
      const spawnClear = live.every(
        (v) => v.state !== 'cruising' || v.x - HIGHWAY.interactiveSpawnX > 16,
      );
      if (spawnIn <= 0 && spawnClear && live.length < 12) {
        spawnIn = HIGHWAY.spawnInterval;
        const kind = (['truck', 'car', 'van', 'hauler'] as const)[live.length % 4]!;
        live.push(new Vehicle(kind, HIGHWAY.interactiveSpawnX, HIGHWAY.z + HIGHWAY.laneOffset));
      }

      applySeparation(live);
      for (const v of live) v.update(dt);
      for (const v of live) {
        if (v.state === 'cruising' && !v.offered && v.x >= HIGHWAY.entryX) {
          v.offered = true;
          // A roll of 0 always accepts, so every vehicle that can divert does.
          stop.offer(v, 0);
        }
      }
      // Mirror Traffic's own state handoffs: a vehicle that has driven its exit
      // route rejoins the highway, and one that runs off the end is recycled.
      // Without this a finished vehicle parks on the road forever and, now that
      // traffic keeps its distance, everything behind it gridlocks.
      for (const v of live) {
        if (v.state === 'leaving' && v.arrived) {
          v.state = 'cruising';
          v.offered = true;
          v.z = HIGHWAY.z + HIGHWAY.laneOffset;
        }
      }
      // Serve instantly so bays keep cycling and exit routes stay busy.
      for (const v of live) {
        if (v.state === 'servicing' && !v.serviceComplete) stop.serveManually(v, 10);
      }
      stop.update(dt, step * dt);

      for (let i = live.length - 1; i >= 0; i--) {
        const v = live[i]!;
        if (v.state === 'done' || v.x > HIGHWAY.interactiveDespawnX) {
          stop.forget(v);
          live.splice(i, 1);
        }
      }

      // Only vehicles on the forecourt matter: two trucks nose-to-tail in the
      // same highway lane are the traffic, not a bug.
      // Every third step: an overlap lasts many steps, so this cannot miss one,
      // and the pairwise check is what makes this test expensive.
      if (step % 3 !== 0) continue;
      const onSite = live.filter((v) => v.state !== 'cruising');
      for (let i = 0; i < onSite.length; i++) {
        for (let j = i + 1; j < onSite.length; j++) {
          const a = onSite[i]!;
          const b = onSite[j]!;
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.z - b.z));
          expect(
            overlapping(a, b),
            `${a.kind} ${a.id} (${a.state}) and ${b.kind} ${b.id} (${b.state}) ` +
              `overlap at step ${step}: (${a.x.toFixed(1)},${a.z.toFixed(1)}) ` +
              `vs (${b.x.toFixed(1)},${b.z.toFixed(1)})`,
          ).toBe(false);
        }
      }
    }

    // Guard against the test passing because nothing ever met, or because
    // everything gridlocked and stopped interacting at all.
    expect(worst).toBeLessThan(30);
    expect(served).toBeGreaterThan(20);
  });
});
