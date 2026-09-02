import { Group, Scene, type Camera } from 'three';
import { UPGRADES, type UpgradeDef } from '../data/config';
import { buildPad, type Pad } from '../render/meshes/pads';
import {
  buildCashPile,
  buildWorker,
  type WorkerParts,
} from '../render/meshes/structures';
import type { CashDrop, TruckStop } from '../sim/TruckStop';
import type { Picker } from '../input/Picker';

interface WorkerView {
  parts: WorkerParts;
  /** Station the attendant covers. */
  stationId: string;
  phase: number;
}

/**
 * The parts of the stop that come and go: upgrade pads, cash on the ground and
 * the attendants you hire. Kept apart from `World` because these are driven by
 * simulation state every frame, where the terrain is built once.
 */
export class StopView {
  private pads = new Map<string, { pad: Pad; def: UpgradeDef }>();
  private cash = new Map<string, Group>();
  private workers: WorkerView[] = [];
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly stop: TruckStop,
    private readonly picker: Picker,
  ) {
    this.syncPads();
  }

  /** Rebuilds the set of visible pads after a purchase or a load. */
  syncPads(): void {
    const visible = new Set(this.stop.visiblePads().map((u) => u.id));

    for (const [id, entry] of this.pads) {
      if (visible.has(id)) continue;
      this.picker.unregister(entry.pad.hitbox);
      this.scene.remove(entry.pad.group);
      entry.pad.dispose();
      this.pads.delete(id);
    }

    for (const def of UPGRADES) {
      if (!visible.has(def.id) || this.pads.has(def.id)) continue;
      const pad = buildPad(def.id === 'canteen' ? 4.5 : 3);
      pad.group.position.set(def.pad.x, 0, def.pad.z);
      this.scene.add(pad.group);
      this.picker.register(pad.hitbox, 'pad', def.id);
      this.pads.set(def.id, { pad, def });
    }
    this.syncWorkers();
  }

  /** One attendant mesh per hire, parked beside the station they cover. */
  private syncWorkers(): void {
    const hires = this.stop.progression.levelOf('worker');
    while (this.workers.length > hires) {
      const w = this.workers.pop();
      if (w) this.scene.remove(w.parts.group);
    }
    while (this.workers.length < hires) {
      const index = this.workers.length;
      const parts = buildWorker(index);
      // The first hire works the pumps; later hires cover the canteen.
      const station = this.stop.stations[index === 0 ? 0 : 1] ?? this.stop.stations[0]!;
      parts.group.position.set(
        station.def.x + (index % 2 === 0 ? -5.5 : 5.5),
        0,
        station.def.z + 2.6,
      );
      parts.group.rotation.y = index % 2 === 0 ? 0.6 : -0.6;
      this.scene.add(parts.group);
      this.workers.push({ parts, stationId: station.id, phase: index * 1.7 });
    }
  }

  addCash(drop: CashDrop): void {
    const group = buildCashPile();
    group.position.set(drop.x, 0, drop.z);
    this.scene.add(group);
    this.picker.register(group, 'cash', drop.id);
    this.cash.set(drop.id, group);
    drop.view = group;
  }

  removeCash(drop: CashDrop): void {
    const group = this.cash.get(drop.id);
    if (!group) return;
    this.picker.unregister(group);
    this.scene.remove(group);
    this.cash.delete(drop.id);
  }

  /** Per-frame animation: pad pulse, cash bob, attendants pottering about. */
  update(dt: number, _camera: Camera): void {
    this.time += dt;
    const affordable = this.stop.economy.cash;

    for (const { pad, def } of this.pads.values()) {
      pad.setAffordable(affordable >= this.stop.progression.costOf(def));
      pad.update(this.time);
    }

    for (const [id, group] of this.cash) {
      const drop = this.stop.drops.find((d) => d.id === id);
      group.position.y = 0.25 + Math.sin(this.time * 3 + group.position.x) * 0.18;
      group.rotation.y += dt * 1.2;
      // Cash close to expiring flattens toward the ground as a warning.
      if (drop) group.scale.setScalar(1 - Math.max(0, drop.age / 26 - 0.75) * 1.4);
    }

    for (const worker of this.workers) {
      const station = this.stop.station(worker.stationId);
      const busy = station?.bays.some((b) => b.vehicle?.state === 'servicing') ?? false;
      worker.phase += dt * (busy ? 6 : 1.5);
      const swing = Math.sin(worker.phase);
      // Busy: arms pumping and a bob. Idle: a slow weight shift.
      const reach = busy ? 1 : 0.18;
      worker.parts.arms[0]!.rotation.x = swing * 0.9 * reach;
      worker.parts.arms[1]!.rotation.x = -swing * 0.9 * reach;
      worker.parts.legs[0]!.rotation.x = swing * 0.25 * reach;
      worker.parts.legs[1]!.rotation.x = -swing * 0.25 * reach;
      worker.parts.group.position.y = busy ? Math.abs(swing) * 0.09 : 0;
    }
  }

  padPosition(id: string): { x: number; z: number } | null {
    const entry = this.pads.get(id);
    return entry ? { x: entry.def.pad.x, z: entry.def.pad.z } : null;
  }
}
