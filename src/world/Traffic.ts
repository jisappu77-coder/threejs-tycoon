import { Color, Group, InstancedMesh, Object3D, Scene } from 'three';
import { HIGHWAY, VEHICLES, type VehicleKind } from '../data/config';
import type { Rng } from '../core/Rng';
import { Vehicle } from '../sim/Vehicle';
import type { TruckStop } from '../sim/TruckStop';
import { buildVehicle } from '../render/meshes/vehicles';
import { ProgressBar } from '../render/meshes/indicators';
import { box } from '../render/meshes/geometry';
import { PALETTE, mat } from '../render/materials';
import type { Picker } from '../input/Picker';
import type { QualityTier } from '../render/Renderer';

interface VehicleView {
  group: Group;
  bar: ProgressBar;
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
    this.ambient = new InstancedMesh(box(4.6, 1.7, 2.0), mat(PALETTE.lineWhite), count);
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

    const group = buildVehicle(kind, v.colorIndex);
    const bar = new ProgressBar();
    bar.group.position.y = 4.4;
    group.add(bar.group);
    group.position.set(v.x, 0, v.z);
    this.scene.add(group);
    this.views.set(v.id, { group, bar });
    this.picker.register(group, 'vehicle', v.id);
  }

  private recycle(v: Vehicle): void {
    const view = this.views.get(v.id);
    if (view) {
      this.picker.unregister(view.group);
      this.scene.remove(view.group);
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
  render(camera: Parameters<ProgressBar['faceCamera']>[0]): void {
    for (const v of this.vehicles) {
      const view = this.views.get(v.id);
      if (!view) continue;
      view.group.position.set(v.x, 0, v.z);
      view.group.rotation.y = v.heading;

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
    return this.views.get(id)?.group;
  }
}
