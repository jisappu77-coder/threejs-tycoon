import { SERVICE, type BayDef, type StationDef } from '../data/config';
import type { Vehicle } from './Vehicle';

export interface Bay {
  def: BayDef;
  /** Whether the player has bought this bay yet. */
  open: boolean;
  vehicle: Vehicle | null;
}

/**
 * A place vehicles get serviced. Fuel and canteen differ only in their data
 * (speed, payout, bay layout), so one class covers both — and covers the
 * repair & wash station when that unlocks, without a new type.
 */
export class ServiceStation {
  readonly def: StationDef;
  readonly bays: Bay[];

  unlocked: boolean;
  /** Global equipment level, raised by the "Better Equipment" upgrade. */
  speedLevel = 0;
  /** 0 = manual only. Higher levels service faster. */
  workerLevel = 0;

  constructor(def: StationDef, openBays = 1) {
    this.def = def;
    this.unlocked = def.startUnlocked;
    this.bays = def.bays.map((b, i) => ({ def: b, open: i < openBays, vehicle: null }));
  }

  get id(): string {
    return this.def.id;
  }

  get openBays(): Bay[] {
    return this.bays.filter((b) => b.open);
  }

  get hasFreeBay(): boolean {
    return this.bays.some((b) => b.open && !b.vehicle);
  }

  openBayCount(): number {
    return this.bays.reduce((n, b) => n + (b.open ? 1 : 0), 0);
  }

  /** Opens the next locked bay. Returns false when they are all already open. */
  openNextBay(): boolean {
    const next = this.bays.find((b) => !b.open);
    if (!next) return false;
    next.open = true;
    return true;
  }

  claimBay(vehicle: Vehicle): Bay | null {
    const bay = this.bays.find((b) => b.open && !b.vehicle);
    if (!bay) return null;
    bay.vehicle = vehicle;
    vehicle.bayId = bay.def.id;
    vehicle.serviceNeeded = this.serviceTimeFor(vehicle);
    vehicle.serviceProgress = 0;
    return bay;
  }

  releaseBay(vehicle: Vehicle): void {
    const bay = this.bays.find((b) => b.vehicle === vehicle);
    if (bay) bay.vehicle = null;
  }

  bayById(id: string): Bay | undefined {
    return this.bays.find((b) => b.def.id === id);
  }

  /** Seconds of work this vehicle needs here, after equipment upgrades. */
  serviceTimeFor(vehicle: Vehicle): number {
    return (
      this.def.serviceTime *
      vehicle.spec.serviceMultiplier *
      Math.pow(SERVICE.speedStep, this.speedLevel)
    );
  }

  payoutFor(vehicle: Vehicle): number {
    return Math.round(this.def.payout * vehicle.spec.payMultiplier);
  }

  /** Work per second contributed automatically by hired staff. */
  get autoRate(): number {
    return SERVICE.workerRate[Math.min(this.workerLevel, SERVICE.workerRate.length - 1)] ?? 0;
  }

  /**
   * Runs staff work across the docked vehicles. Returns the vehicles whose
   * service completed this step, for the caller to pay out and send on.
   */
  tickAutomation(dt: number): Vehicle[] {
    const rate = this.autoRate;
    if (rate <= 0) return [];
    const completed: Vehicle[] = [];
    for (const bay of this.bays) {
      const v = bay.vehicle;
      if (!v || v.state !== 'servicing' || v.serviceComplete) continue;
      if (v.work(rate * dt)) completed.push(v);
    }
    return completed;
  }
}
