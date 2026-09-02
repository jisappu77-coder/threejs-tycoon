import { describe, expect, it } from 'vitest';
import { Vehicle, turnToward } from './Vehicle';
import { TruckStop } from './TruckStop';
import { Economy, computeOfflineEarnings, divertChance } from './Economy';
import { Progression } from './Progression';
import { migrate, restore, serialize, type SaveData } from './Save';
import { ECONOMY, HIGHWAY, SERVICE } from '../data/config';

/** Runs the stop for `seconds` of simulated time at the real fixed step. */
function run(stop: TruckStop, vehicles: Vehicle[], seconds: number, now = 0): number {
  const dt = 1 / 60;
  let t = now;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    for (const v of vehicles) v.update(dt);
    t += dt;
    stop.update(dt, t);
  }
  return t;
}

describe('Vehicle', () => {
  it('cruises straight down the lane when it has no path', () => {
    const v = new Vehicle('truck', -100, HIGHWAY.z + HIGHWAY.laneOffset);
    v.update(1);
    expect(v.x).toBeCloseTo(-100 + v.spec.speed);
    expect(v.z).toBe(HIGHWAY.z + HIGHWAY.laneOffset);
  });

  it('drives through its waypoints in order and reports arrival', () => {
    const v = new Vehicle('van', 0, 0);
    v.state = 'entering';
    v.setPath([
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ]);
    expect(v.arrived).toBe(false);
    run(new TruckStop(), [v], 6);
    expect(v.arrived).toBe(true);
    expect(v.x).toBeCloseTo(10);
    expect(v.z).toBeCloseTo(10);
  });

  it('tracks service progress and reports completion once', () => {
    const v = new Vehicle('truck', 0, 0);
    v.serviceNeeded = 2;
    expect(v.work(1)).toBe(false);
    expect(v.serviceRatio).toBeCloseTo(0.5);
    expect(v.work(1)).toBe(true);
    expect(v.serviceComplete).toBe(true);
    // Already finished: no double payout.
    expect(v.work(1)).toBe(false);
  });

  it('turns the short way around the +/-pi wrap', () => {
    // 3.0 -> -3.0 is a 0.28rad turn the short way, not a 6rad turn the long way.
    expect(turnToward(3.0, -3.0, 0.1)).toBeCloseTo(3.1);
    // Within one step of the target, it snaps rather than overshooting.
    expect(turnToward(3.0, -3.0, 0.5)).toBe(-3.0);
    expect(turnToward(0, 1, 10)).toBe(1);
  });
});

describe('TruckStop core loop', () => {
  it('takes a truck from the highway through service to a cash drop', () => {
    const stop = new TruckStop();
    const truck = new Vehicle('truck', HIGHWAY.entryX, HIGHWAY.z + HIGHWAY.laneOffset);

    // roll 0 always accepts.
    expect(stop.offer(truck, 0)).toBe(true);
    expect(truck.state).toBe('entering');

    run(stop, [truck], 20);
    expect(truck.state).toBe('servicing');
    expect(truck.bayId).toBe('fuel-1');
    expect(truck.serviceNeeded).toBeGreaterThan(0);

    // Manual work: hold until the job is done.
    let guard = 0;
    while (truck.state === 'servicing' && guard++ < 2000) {
      stop.serveManually(truck, 1 / 60);
    }
    expect(truck.state).toBe('leaving');
    expect(stop.drops).toHaveLength(1);
    expect(stop.drops[0]!.amount).toBe(26);

    // Cash only counts once collected.
    expect(stop.economy.cash).toBe(ECONOMY.startCash);
    stop.collect(stop.drops[0]!.id, 10);
    expect(stop.economy.cash).toBe(ECONOMY.startCash + 26);
    expect(stop.drops).toHaveLength(0);
  });

  it('refuses cars, and refuses anyone once the queue is full', () => {
    const stop = new TruckStop();
    const car = new Vehicle('car', HIGHWAY.entryX, 0);
    expect(stop.offer(car, 0)).toBe(false);

    const admitted: Vehicle[] = [];
    for (let i = 0; i < stop.queueCapacity; i++) {
      const v = new Vehicle('truck', HIGHWAY.entryX, 0);
      expect(stop.offer(v, 0)).toBe(true);
      admitted.push(v);
    }
    expect(stop.queueLength).toBe(stop.queueCapacity);
    const overflow = new Vehicle('truck', HIGHWAY.entryX, 0);
    expect(stop.offer(overflow, 0)).toBe(false);
  });

  it('only opens the second fuel bay after the upgrade is bought', () => {
    const stop = new TruckStop();
    expect(stop.station('fuel')!.openBayCount()).toBe(1);

    stop.economy.grant(1000);
    expect(stop.tryPurchase('pump2').ok).toBe(true);
    expect(stop.station('fuel')!.openBayCount()).toBe(2);

    const a = new Vehicle('truck', HIGHWAY.entryX, 0);
    const b = new Vehicle('truck', HIGHWAY.entryX, 0);
    stop.offer(a, 0);
    stop.offer(b, 0);
    run(stop, [a, b], 26);
    expect([a.state, b.state]).toEqual(['servicing', 'servicing']);
    expect(a.bayId).not.toBe(b.bayId);
  });

  it('services vehicles with no player input once an attendant is hired', () => {
    const stop = new TruckStop();
    stop.economy.grant(5000);
    expect(stop.tryPurchase('worker').ok).toBe(true);
    expect(stop.automationLevel).toBe(1);

    const truck = new Vehicle('truck', HIGHWAY.entryX, 0);
    stop.offer(truck, 0);
    // Long enough to drive in and be served, short enough that the cash it
    // paid is still sitting on the ground.
    run(stop, [truck], 25);

    expect(truck.state).toBe('leaving');
    expect(stop.drops.length).toBeGreaterThan(0);
  });

  it('sends a driver away once their patience runs out', () => {
    const stop = new TruckStop();
    // Fill the only bay with one truck, then queue a second behind it.
    const first = new Vehicle('truck', HIGHWAY.entryX, 0);
    const second = new Vehicle('truck', HIGHWAY.entryX, 0);
    stop.offer(first, 0);
    stop.offer(second, 0);

    run(stop, [first, second], SERVICE.patienceSeconds + 25);
    expect(second.state).toBe('leaving');
    expect(second.wantsStation).toBeNull();
    expect(stop.queueLength).toBe(0);
  });

  it('banks a share of cash the player never picked up', () => {
    const stop = new TruckStop();
    const truck = new Vehicle('truck', HIGHWAY.entryX, 0);
    stop.offer(truck, 0);
    run(stop, [truck], 20);
    while (truck.state === 'servicing') stop.serveManually(truck, 1 / 60);

    const before = stop.economy.cash;
    run(stop, [truck], ECONOMY.dropLifetime + 1, 100);
    expect(stop.drops).toHaveLength(0);
    expect(stop.economy.cash).toBe(before + Math.round(26 * ECONOMY.dropDecayKeep));
  });
});

describe('Economy', () => {
  it('refuses purchases it cannot pay for', () => {
    const e = new Economy(50);
    expect(e.spend(80)).toBe(false);
    expect(e.cash).toBe(50);
    expect(e.spend(50)).toBe(true);
    expect(e.cash).toBe(0);
  });

  it('names the stop from lifetime earnings', () => {
    const e = new Economy(0);
    expect(e.levelName).toBe('Roadside Stop');
    e.grant(1500);
    expect(e.levelName).toBe('Busy Stop');
  });

  it('grows upgrade costs for repeatable upgrades', () => {
    const p = new Progression();
    const worker = { id: 'worker', cost: 260, costGrowth: 2.4, maxLevel: 3 } as never;
    expect(p.costOf(worker)).toBe(260);
    p.purchase('worker');
    expect(p.costOf(worker)).toBe(624);
    p.purchase('worker');
    p.purchase('worker');
    expect(p.isMaxed(worker)).toBe(true);
    expect(p.isAvailable(worker)).toBe(false);
  });

  it('hides upgrades whose prerequisites are unmet', () => {
    const p = new Progression();
    const ids = p.visibleUpgrades().map((u) => u.id);
    expect(ids).toContain('pump2');
    expect(ids).not.toContain('canteen');
    p.purchase('pump2');
    expect(p.visibleUpgrades().map((u) => u.id)).toContain('canteen');
  });

  it('makes a long queue put drivers off', () => {
    expect(divertChance(0, 3)).toBeGreaterThan(divertChance(2, 3));
    expect(divertChance(3, 3)).toBe(0);
  });
});

describe('offline earnings', () => {
  it('pays nothing without automation', () => {
    expect(computeOfflineEarnings(3600, 5, 0)).toBe(0);
  });

  it('pays a reduced rate while away', () => {
    expect(computeOfflineEarnings(100, 2, 1)).toBe(100 * 2 * ECONOMY.offlineRate);
  });

  it('caps however long the player was away', () => {
    const capped = ECONOMY.offlineCapHours * 3600 * 2 * ECONOMY.offlineRate;
    expect(computeOfflineEarnings(48 * 3600, 2, 1)).toBe(capped);
  });
});

describe('Save', () => {
  it('round-trips a stop through serialize and restore', () => {
    const stop = new TruckStop();
    stop.economy.grant(2000);
    stop.tryPurchase('pump2');
    stop.tryPurchase('worker');

    const data = serialize(stop, 1_000_000);
    const { stop: loaded } = restore(data, (e, p) => new TruckStop(e, p), 1_000_000);

    expect(loaded.economy.cash).toBe(stop.economy.cash);
    expect(loaded.progression.levelOf('pump2')).toBe(1);
    expect(loaded.station('fuel')!.openBayCount()).toBe(2);
    expect(loaded.station('fuel')!.workerLevel).toBe(1);
  });

  it('grants offline earnings for the time between save and load', () => {
    const stop = new TruckStop();
    stop.economy.grant(1000);
    stop.tryPurchase('worker');
    stop.economy.incomePerSecond = 3;

    const data = serialize(stop, 0);
    const { stop: loaded, offline } = restore(
      data,
      (e, p) => new TruckStop(e, p),
      600_000, // ten minutes later
    );
    expect(offline).toBe(Math.floor(600 * 3 * ECONOMY.offlineRate));
    expect(loaded.economy.cash).toBe(data.cash + offline);
  });

  it('rejects malformed or future save data instead of throwing', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({ version: 99, cash: 10 })).toBeNull();
    expect(migrate({ version: 1, cash: 'lots' })).toBeNull();
  });

  it('fills in fields missing from an older save', () => {
    const migrated = migrate({ version: 1, cash: 40 } as Partial<SaveData>);
    expect(migrated).not.toBeNull();
    expect(migrated!.upgrades).toEqual({});
    expect(migrated!.totalEarned).toBe(40);
  });
});
