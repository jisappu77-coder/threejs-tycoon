import { ECONOMY, HIGHWAY, SERVICE, STATIONS, UPGRADES } from '../data/config';
import { Economy, divertChance } from './Economy';
import { Progression, upgradeById } from './Progression';
import { ServiceStation } from './ServiceStation';
import type { Vehicle, Waypoint } from './Vehicle';

export interface CashDrop {
  id: string;
  x: number;
  z: number;
  amount: number;
  age: number;
  /** Set by the view layer. */
  view?: unknown;
}

export interface TruckStopHooks {
  onCashDrop?(drop: CashDrop): void;
  onCashRemoved?(drop: CashDrop): void;
  onServiceComplete?(vehicle: Vehicle, amount: number): void;
  onVehicleLeaving?(vehicle: Vehicle): void;
  onStationUnlocked?(station: ServiceStation): void;
}

let dropId = 1;

/**
 * The business: stations, the waiting line, cash on the ground and what the
 * player has bought. It decides which passing vehicles become customers, moves
 * them through the queue into bays, and pays out when work finishes.
 */
export class TruckStop {
  readonly stations: ServiceStation[];
  readonly economy: Economy;
  readonly progression: Progression;
  readonly drops: CashDrop[] = [];
  hooks: TruckStopHooks = {};

  /** Vehicles in the waiting line, front first. */
  private queue: Vehicle[] = [];
  /** Vehicles being driven to or sitting in a bay. */
  private docked = new Set<Vehicle>();

  constructor(economy = new Economy(), progression = new Progression()) {
    this.economy = economy;
    this.progression = progression;
    this.stations = STATIONS.map((def) => new ServiceStation(def));
    this.syncFromProgression();
  }

  // ---------------------------------------------------------------- upgrades

  /** Re-applies every purchased upgrade. Used at boot and after loading. */
  syncFromProgression(): void {
    const fuel = this.station('fuel')!;
    const canteen = this.station('canteen')!;

    fuel.bays.forEach((b, i) => (b.open = i === 0 || this.progression.levelOf('pump2') > 0));

    const workerLevel = this.progression.levelOf('worker');
    fuel.workerLevel = workerLevel;
    // The second and third hires also cover the canteen.
    canteen.workerLevel = Math.max(0, workerLevel - 1);

    const speed = this.progression.levelOf('speed');
    for (const s of this.stations) s.speedLevel = speed;

    canteen.unlocked = this.progression.levelOf('canteen') > 0;
    canteen.bays.forEach((b, i) => (b.open = canteen.unlocked && i === 0));
  }

  get queueCapacity(): number {
    const level = Math.min(
      this.progression.levelOf('queue'),
      SERVICE.queueSlots.length - 1,
    );
    return SERVICE.queueSlots[level]!;
  }

  /** Total automation across the stop; 0 means fully manual. */
  get automationLevel(): number {
    return this.stations.reduce((n, s) => n + s.workerLevel, 0);
  }

  station(id: string): ServiceStation | undefined {
    return this.stations.find((s) => s.id === id);
  }

  /** Buys an upgrade if it is available and affordable. */
  tryPurchase(upgradeId: string): { ok: boolean; level: number; reason?: string } {
    const def = upgradeById(upgradeId);
    if (!def) return { ok: false, level: 0, reason: 'Unknown upgrade' };
    if (!this.progression.isAvailable(def)) {
      return { ok: false, level: this.progression.levelOf(def.id), reason: 'Not available' };
    }
    const cost = this.progression.costOf(def);
    if (!this.economy.spend(cost)) {
      return { ok: false, level: this.progression.levelOf(def.id), reason: 'Not enough cash' };
    }
    const level = this.progression.purchase(def.id);
    this.syncFromProgression();
    if (def.id === 'canteen') {
      const canteen = this.station('canteen');
      if (canteen) this.hooks.onStationUnlocked?.(canteen);
    }
    return { ok: true, level };
  }

  // ------------------------------------------------------------------ queue

  get queueLength(): number {
    return this.queue.length;
  }

  queueSlotPosition(index: number): Waypoint {
    return {
      x: SERVICE.queueStart.x - index * SERVICE.queueSpacing,
      z: SERVICE.queueStart.z,
    };
  }

  /** Which service a would-be customer wants, or null if nothing suits it. */
  private pickStation(): ServiceStation | null {
    const open = this.stations.filter((s) => s.unlocked && s.openBayCount() > 0);
    if (open.length === 0) return null;
    // Prefer the most valuable service that is not already saturated.
    const free = open.filter((s) => s.hasFreeBay);
    const pool = free.length > 0 ? free : open;
    return pool.reduce((best, s) => (s.def.payout > best.def.payout ? s : best));
  }

  /**
   * Called when a cruising vehicle reaches the slip road. Returns true if it
   * pulled in, in which case its path into the queue has been set.
   */
  offer(vehicle: Vehicle, roll: number): boolean {
    if (!vehicle.spec.customer) return false;
    if (this.queue.length >= this.queueCapacity) return false;
    const station = this.pickStation();
    if (!station) return false;
    if (roll > divertChance(this.queue.length, this.queueCapacity)) return false;

    vehicle.wantsStation = station.id;
    vehicle.state = 'entering';
    vehicle.queueIndex = this.queue.length;
    vehicle.patience = 0;
    this.queue.push(vehicle);
    vehicle.setPath([
      { x: HIGHWAY.entryX + 10, z: HIGHWAY.slipInZ },
      this.queueSlotPosition(vehicle.queueIndex),
    ]);
    return true;
  }

  /** Re-targets everyone in the line after the front vehicle moves off. */
  private reflowQueue(): void {
    this.queue.forEach((v, i) => {
      if (v.queueIndex === i) return;
      v.queueIndex = i;
      v.setPath([this.queueSlotPosition(i)]);
      if (v.state === 'queued') v.state = 'entering';
    });
  }

  /**
   * The shared run back to the highway. Vehicles reach it from their bay's own
   * authored exit route, so the leg that used to be `x + 13` — a blind lunge
   * forward that took a fuel customer straight across both canteen bays — is
   * gone.
   */
  private exitPath(lead: Waypoint[]): Waypoint[] {
    return [
      ...lead,
      { x: HIGHWAY.exitX - 8, z: HIGHWAY.exitZ },
      { x: HIGHWAY.exitX + 10, z: HIGHWAY.z + HIGHWAY.laneOffset },
    ];
  }

  private sendAway(vehicle: Vehicle, lead: Waypoint[] = []): void {
    vehicle.state = 'leaving';
    vehicle.setPath(this.exitPath(lead));
    this.hooks.onVehicleLeaving?.(vehicle);
  }

  // ------------------------------------------------------------------- work

  /**
   * Applies manual work from a held touch. Returns the fraction of the job
   * completed so the UI can show progress, or -1 when the vehicle is not
   * servable right now.
   */
  serveManually(vehicle: Vehicle, dt: number): number {
    if (vehicle.state !== 'servicing' || vehicle.serviceComplete) return -1;
    if (vehicle.work(SERVICE.manualRate * dt)) this.completeService(vehicle);
    return vehicle.serviceRatio;
  }

  private completeService(vehicle: Vehicle): void {
    const station = this.stations.find((s) => s.id === vehicle.wantsStation);
    const amount = station ? station.payoutFor(vehicle) : 0;
    // Read the bay's exit route before releasing it, or the route is gone.
    const lead = station?.bayById(vehicle.bayId ?? '')?.def.exit ?? [];
    station?.releaseBay(vehicle);
    this.docked.delete(vehicle);

    if (amount > 0) {
      const drop: CashDrop = {
        id: `c${dropId++}`,
        // Drop beside the vehicle so the pile is never hidden under it.
        x: vehicle.x + 2.6,
        z: vehicle.z + 3.4,
        amount,
        age: 0,
      };
      this.drops.push(drop);
      this.hooks.onCashDrop?.(drop);
    }
    this.hooks.onServiceComplete?.(vehicle, amount);
    this.sendAway(vehicle, lead);
  }

  collect(dropIdToCollect: string, now: number): number {
    const index = this.drops.findIndex((d) => d.id === dropIdToCollect);
    if (index < 0) return 0;
    const [drop] = this.drops.splice(index, 1);
    if (!drop) return 0;
    this.economy.earn(drop.amount, now);
    this.hooks.onCashRemoved?.(drop);
    return drop.amount;
  }

  // ------------------------------------------------------------------ update

  update(dt: number, now: number): void {
    // 1. Move the front of the queue into any free bay.
    while (this.queue.length > 0) {
      const front = this.queue[0]!;
      if (front.state !== 'queued' || !front.arrived) break;
      const station = this.stations.find((s) => s.id === front.wantsStation);
      if (!station || !station.hasFreeBay) break;
      const bay = station.claimBay(front);
      if (!bay) break;
      this.queue.shift();
      this.docked.add(front);
      front.state = 'toBay';
      front.setPath([...bay.def.approach, { x: bay.def.x, z: bay.def.z }]);
      this.reflowQueue();
    }

    // 2. Promote arrivals to their resting state.
    for (const v of this.queue) {
      if (v.state === 'entering' && v.arrived) v.state = 'queued';
    }
    for (const v of this.docked) {
      if (v.state === 'toBay' && v.arrived) {
        v.state = 'servicing';
        v.patience = 0;
      }
    }

    // 3. Staff work on docked vehicles.
    for (const station of this.stations) {
      for (const done of station.tickAutomation(dt)) this.completeService(done);
    }

    // 4. Drivers who have waited too long give up — the visible cost of a
    //    queue that outgrows the stop's capacity.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const v = this.queue[i]!;
      if (v.state !== 'queued' || v.patience < SERVICE.patienceSeconds) continue;
      this.queue.splice(i, 1);
      v.wantsStation = null;
      this.sendAway(v);
      this.reflowQueue();
    }

    // 5. Age out cash left on the ground; some of it is banked automatically
    //    so a distracted player is never punished with a total loss.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i]!;
      drop.age += dt;
      if (drop.age < ECONOMY.dropLifetime) continue;
      this.drops.splice(i, 1);
      this.economy.earn(Math.round(drop.amount * ECONOMY.dropDecayKeep), now);
      this.hooks.onCashRemoved?.(drop);
    }

    this.economy.refreshRate(now);
  }

  /** Vehicles the stop is currently responsible for (queue + bays). */
  customers(): Vehicle[] {
    return [...this.queue, ...this.docked];
  }

  /** Forgets a vehicle that is being recycled out from under us. */
  forget(vehicle: Vehicle): void {
    const qi = this.queue.indexOf(vehicle);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      this.reflowQueue();
    }
    if (this.docked.delete(vehicle)) {
      this.stations.find((s) => s.id === vehicle.wantsStation)?.releaseBay(vehicle);
    }
  }

  /** Upgrade pads that should currently be visible in the world. */
  visiblePads(): typeof UPGRADES {
    return this.progression.visibleUpgrades();
  }
}
