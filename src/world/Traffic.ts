import { Group, InstancedMesh, Object3D, Scene } from 'three';
import { HIGHWAY, VEHICLES, type VehicleKind } from '../data/config';
import type { Rng } from '../core/Rng';
import { Vehicle } from '../sim/Vehicle';
import { applySeparation } from '../sim/separation';
import type { TruckStop } from '../sim/TruckStop';
import { VEHICLE_LENGTH, buildVehicle, type VehicleParts } from '../render/meshes/vehicles';
import { ProgressBar } from '../render/meshes/indicators';
import { buildContactShadow } from '../render/meshes/contact';
import { meshOf, type ModelId } from '../render/assets';
import type { Picker } from '../input/Picker';
import { TIERS, type QualityTier } from '../render/Renderer';

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
/** Road that must be empty ahead of the spawn point before a vehicle appears. */
const SPAWN_CLEARANCE = 16;

/**
 * The far lane used to be a tinted rounded box — the single most obviously
 * cheap thing on screen, since it sits right next to the real models. It draws
 * the actual car kit now; the pool is kept small because each model is its own
 * draw call.
 */
const AMBIENT_MODELS: ModelId[] = ['sedan', 'suv', 'taxi', 'van', 'boxTruck', 'pickup'];

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
  /**
   * One InstancedMesh per sub-mesh of each ambient car model. Every mesh of a
   * given model shares one instance-matrix write, so a car with a separate
   * wheel mesh still costs one matrix update per car.
   */
  private ambientMeshes: { meshes: InstancedMesh[]; slots: number[] }[] = [];
  /** Which model group each ambient slot belongs to, and its index within it. */
  private ambientX: number[] = [];
  private ambientSpeed: number[] = [];
  private ambientLane: number[] = [];
  private dummy = new Object3D();
  private clock = 0;
  private tier: QualityTier;

  constructor(
    private readonly scene: Scene,
    private readonly rng: Rng,
    private readonly stop: TruckStop,
    private readonly picker: Picker,
    tier: QualityTier,
  ) {
    this.tier = tier;
    this.buildAmbient(TIERS[tier].ambientTraffic);
  }

  private buildAmbient(count: number): void {
    for (const group of this.ambientMeshes) {
      for (const mesh of group.meshes) {
        this.scene.remove(mesh);
        mesh.dispose();
      }
    }
    this.ambientMeshes = [];
    this.ambientX = [];
    this.ambientSpeed = [];
    this.ambientLane = [];

    // Deal positions out along the road in even slices with jitter rather than
    // at random: pure random placement puts cars inside each other immediately.
    //
    // Every car in a lane then runs at that lane's single speed. Giving each
    // one its own speed looked better for the first few seconds and then fell
    // apart — a faster car slowly reels in the one ahead and drives through it,
    // which is exactly the overlap that gets noticed. These cars are scenery
    // with no separation logic of their own, so the spacing has to be a
    // property of how they move, not something maintained after the fact.
    const westbound = Math.round(count * 0.6);
    const laneSpeed = { '-1': this.rng.range(17, 20), '1': this.rng.range(15, 18) };
    for (let i = 0; i < count; i++) {
      const lane = i < westbound ? -1 : 1;
      const n = lane < 0 ? westbound : count - westbound;
      const index = lane < 0 ? i : i - westbound;
      const slice = (HIGHWAY.spanX * 2) / Math.max(n, 1);
      // Jitter is capped at 15% of a slice either way, so two neighbours are
      // never closer than 70% of a slice. At the busiest tier that is 10.1
      // units in the tighter lane, which clears the 8.6-unit box truck — the
      // longest model in the ambient pool.
      const centre = -HIGHWAY.spanX + slice * (index + 0.5);
      this.ambientX.push(centre + this.rng.range(-slice * 0.15, slice * 0.15));
      this.ambientSpeed.push(lane < 0 ? laneSpeed['-1'] : laneSpeed['1']);
      this.ambientLane.push(lane);
    }

    // Deal the slots out across the model pool before building anything, so
    // each InstancedMesh is allocated at exactly the size it needs.
    const buckets = AMBIENT_MODELS.map(() => [] as number[]);
    for (let i = 0; i < count; i++) buckets[i % AMBIENT_MODELS.length]!.push(i);

    AMBIENT_MODELS.forEach((id, index) => {
      const slots = buckets[index]!;
      if (slots.length === 0) return;
      const parts = meshOf(id);
      if (parts.length === 0) return;
      const meshes = parts.map(({ geometry, material }) => {
        const mesh = new InstancedMesh(geometry, material, slots.length);
        // Distant filler: it reads as traffic, not as a shadow caster, and
        // dropping it from the shadow pass keeps the map free for the stop.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        // The highway runs the full width of the world; culling per instance
        // against a stale bounding sphere pops cars in and out.
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
      });
      this.ambientMeshes.push({ meshes, slots });
    });
  }

  setTier(tier: QualityTier): void {
    this.tier = tier;
    this.buildAmbient(TIERS[tier].ambientTraffic);
  }

  private spawn(): void {
    if (this.vehicles.length >= MAX_INTERACTIVE) return;
    // Never drop a vehicle on top of one that has not cleared the spawn point.
    // Now that traffic keeps its distance, a stacked spawn does not resolve
    // itself — the pair simply sit there blocking the lane behind them.
    const clear = this.vehicles.every(
      (v) =>
        v.state !== 'cruising' ||
        Math.abs(v.x - HIGHWAY.interactiveSpawnX) > SPAWN_CLEARANCE,
    );
    if (!clear) return;
    const kind = this.rng.weighted(KINDS, (k) => VEHICLES[k].weight);
    const v = new Vehicle(
      kind,
      HIGHWAY.interactiveSpawnX,
      HIGHWAY.z + HIGHWAY.laneOffset,
      this.rng.int(0, 6),
    );
    this.vehicles.push(v);

    const parts = buildVehicle(kind, v.colorIndex);
    // Only add contact shadows where the tier can afford the extra transparent
    // quads; the real shadow map still grounds the vehicle without them.
    if (TIERS[this.tier].contactShadows) {
      parts.group.add(buildContactShadow(VEHICLE_LENGTH[kind], 2.4));
    }
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

    // Decide who has to give way before anyone moves, so the decision is made
    // from one consistent snapshot rather than from half-updated positions.
    applySeparation(this.vehicles);

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

    for (const { meshes, slots } of this.ambientMeshes) {
      for (let n = 0; n < slots.length; n++) {
        const i = slots[n]!;
        const lane = this.ambientLane[i]!;
        this.dummy.position.set(this.ambientX[i]!, 0, HIGHWAY.z - lane * HIGHWAY.laneOffset);
        // The car kit models face +X once normalised, so westbound needs a flip.
        this.dummy.rotation.y = lane > 0 ? 0 : Math.PI;
        this.dummy.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(n, this.dummy.matrix);
      }
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** World position of a vehicle's mesh, for camera focus and effects. */
  viewOf(id: string): Group | undefined {
    return this.views.get(id)?.parts.group;
  }
}
