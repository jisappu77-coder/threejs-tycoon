import { Color, Group, InstancedMesh, Object3D, Scene } from 'three';
import { HIGHWAY, VEHICLES, type VehicleKind } from '../data/config';
import type { Rng } from '../core/Rng';
import { Vehicle } from '../sim/Vehicle';
import type { TruckStop } from '../sim/TruckStop';
import { ambientShell, buildVehicle, type VehicleParts } from '../render/meshes/vehicles';
import { ProgressBar } from '../render/meshes/indicators';
import { PALETTE, mat } from '../render/materials';
import type { Picker } from '../input/Picker';
import type { QualityTier } from '../render/Renderer';

interface VehicleView {
  parts: VehicleParts;
  bar: ProgressBar;
  /** Accumulated wheel rotation, so wheels turn with distance travelled. */
  spin: number;
  /** Phase offset so vehicles do not all bob in lockstep. */
  bobPhase: number;
  lastX: number;
  lastZ: number;
}

const KINDS = Object.keys(VEHICLES) as VehicleKind[];
const MAX_INTERACTIVE = 12;

/**
 * Two tiers of traffic. The near lane holds a handful of real `Vehicle`
 * objects that can divert into the stop; the far lane is a single instanced
 * mesh of shells that only ever move in a straight line. Distant traffic is
 * what makes the highway feel busy, and it costs almost nothing.
 */
export class Traffic {
  readonly vehicles: Vehicle[] = [];

  private views = new Map<string, VehicleView>();
  private spawnTimer = 1;
  private ambient!: InstancedMesh;
  private ambientX: number[] = [];
  private ambientSpeed: number[] = [];
  private ambientLane: number[] = [];
  private dummy = new Object3D();
  private clock = 0;

  constructor(
    private readonly scene: Scene,
    private readonly rng: Rng,
    private readonly stop: TruckStop,
    private readonly picker: Picker,
    tier: QualityTier,
  ) {
    this.buildAmbient(HIGHWAY.ambientCount[tier]);
  }

  private buildAmbient(count: number): void {
    if (this.ambient) {
      this.scene.remove(this.ambient);
      this.ambient.dispose();
    }
    this.ambient = new InstancedMesh(ambientShell(), mat(PALETTE.lineWhite), count);
    this.ambient.castShadow = false;
    this.ambient.receiveShadow = false;
    this.ambientX = [];
    this.ambientSpeed = [];
    this.ambientLane = [];
    const color = new Color();
    for (let i = 0; i < count; i++) {
      this.ambientX.push(this.rng.range(-HIGHWAY.spanX, HIGHWAY.spanX));
      this.ambientSpeed.push(this.rng.range(14, 22));
      // Most of the far-lane traffic runs west; a few share the near lane far
      // from the stop so the road never looks one-directional.
      this.ambientLane.push(this.rng.chance(0.75) ? -1 : 1);
      color.setHex(this.rng.pick(PALETTE.carBodies));
      this.ambient.setColorAt(i, color);
    }
    if (this.ambient.instanceColor) this.ambient.instanceColor.needsUpdate = true;
    this.scene.add(this.ambient);
  }

  setTier(tier: QualityTier): void {
    this.buildAmbient(HIGHWAY.ambientCount[tier]);
  }

  private spawn(): void {
    if (this.vehicles.length >= MAX_INTERACTIVE) return;
    const kind = this.rng.weighted(KINDS, (k) => VEHICLES[k].weight);
    const v = new Vehicle(
      kind,
      HIGHWAY.interactiveSpawnX,
      HIGHWAY.z + HIGHWAY.laneOffset,
      this.rng.int(0, 6),
    );
    this.vehicles.push(v);

    const parts = buildVehicle(kind, v.colorIndex);
    const bar = new ProgressBar();
    // Above the fuel canopy, so the service bar is never hidden by the roof
    // the vehicle is parked under.
    bar.group.position.y = kind === 'truck' || kind === 'hauler' ? 6.4 : 4.6;
    parts.group.add(bar.group);
    parts.group.position.set(v.x, 0, v.z);
    this.scene.add(parts.group);
    this.views.set(v.id, {
      parts,
      bar,
      spin: 0,
      bobPhase: this.rng.range(0, Math.PI * 2),
      lastX: v.x,
      lastZ: v.z,
    });
    this.picker.register(parts.group, 'vehicle', v.id);
  }

  private recycle(v: Vehicle): void {
    const view = this.views.get(v.id);
    if (view) {
      this.picker.unregister(view.parts.group);
      this.scene.remove(view.parts.group);
      this.views.delete(v.id);
    }
    this.stop.forget(v);
  }

  vehicleById(id: string): Vehicle | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  /** Fixed-step simulation update. */
  update(dt: number): void {
    // Busier stops attract more passing trade, which keeps the highway lively
    // as the business grows.
    const growth = 1 + this.stop.progression.levelOf('speed') * 0.15;
    this.spawnTimer -= dt * growth;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = HIGHWAY.spawnInterval * this.rng.range(0.7, 1.4);
      this.spawn();
    }

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i]!;
      v.update(dt);

      if (v.state === 'cruising') {
        if (!v.offered && v.x >= HIGHWAY.entryX && v.x < HIGHWAY.entryX + 12) {
          v.offered = true;
          this.stop.offer(v, this.rng.next());
        }
        if (v.x > HIGHWAY.interactiveDespawnX) v.state = 'done';
      } else if (v.state === 'leaving' && v.arrived) {
        // Back on the highway; let it drive off the end normally.
        v.state = 'cruising';
        v.offered = true;
        v.z = HIGHWAY.z + HIGHWAY.laneOffset;
      }

      if (v.state === 'done') {
        this.recycle(v);
        this.vehicles.splice(i, 1);
      }
    }

    for (let i = 0; i < this.ambientX.length; i++) {
      const lane = this.ambientLane[i]!;
      this.ambientX[i] = this.ambientX[i]! + this.ambientSpeed[i]! * dt * lane;
      if (lane < 0 && this.ambientX[i]! < -HIGHWAY.spanX) this.ambientX[i] = HIGHWAY.spanX;
      if (lane > 0 && this.ambientX[i]! > HIGHWAY.spanX) this.ambientX[i] = -HIGHWAY.spanX;
    }
  }

  /** Per-frame view sync. Separate from `update` so it runs once per frame. */
  render(camera: Parameters<ProgressBar['faceCamera']>[0], dt: number): void {
    this.clock += dt;
    for (const v of this.vehicles) {
      const view = this.views.get(v.id);
      if (!view) continue;
      const { group } = view.parts;
      group.position.set(v.x, 0, v.z);
      group.rotation.y = v.heading;

      // Wheels turn with distance actually travelled, not with time, so they
      // stop dead when the vehicle does.
      const travelled = Math.hypot(v.x - view.lastX, v.z - view.lastZ);
      view.lastX = v.x;
      view.lastZ = v.z;
      view.spin += travelled / 0.5;
      for (const wheel of view.parts.wheels) wheel.rotation.x = view.spin;

      // A slight suspension bob while rolling sells the weight of a truck.
      const moving = travelled > 0.001;
      view.parts.body.position.y = moving
        ? Math.sin(this.clock * 9 + view.bobPhase) * 0.035
        : 0;
      view.parts.body.rotation.z = moving
        ? Math.sin(this.clock * 6.2 + view.bobPhase) * 0.006
        : 0;

      const showBar = v.state === 'servicing' && !v.serviceComplete;
      view.bar.show(showBar);
      if (showBar) {
        view.bar.set(v.serviceRatio);
        view.bar.faceCamera(camera);
      }
    }

    for (let i = 0; i < this.ambientX.length; i++) {
      const lane = this.ambientLane[i]!;
      this.dummy.position.set(
        this.ambientX[i]!,
        0.95,
        HIGHWAY.z - lane * HIGHWAY.laneOffset,
      );
      this.dummy.rotation.y = lane > 0 ? 0 : Math.PI;
      this.dummy.updateMatrix();
      this.ambient.setMatrixAt(i, this.dummy.matrix);
    }
    this.ambient.instanceMatrix.needsUpdate = true;
  }

  /** World position of a vehicle's mesh, for camera focus and effects. */
  viewOf(id: string): Group | undefined {
    return this.views.get(id)?.parts.group;
  }
}
