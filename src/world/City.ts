import {
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import { CITY } from '../data/config';
import type { Rng } from '../core/Rng';
import { box } from '../render/meshes/geometry';
import { texMat } from '../render/materials';
import { asphaltTexture, concreteTexture, tiled } from '../render/textures';
import { surfaceMaterial } from '../render/surfaces';
import { meshOf, type ModelId } from '../render/assets';
import type { QualityTier } from '../render/Renderer';

/**
 * The city across the highway.
 *
 * It is built as an actual grid — an avenue parallel to the highway, cross
 * streets running back from it, and blocks of buildings between — because the
 * traffic in it has to have somewhere to go. A painted backdrop would have been
 * cheaper, but cars sliding across a flat image is exactly the kind of thing
 * that reads as fake the moment it moves.
 *
 * Cost is kept down by never drawing a building on its own: every model in the
 * district is an `InstancedMesh`, so the whole skyline is a handful of draw
 * calls regardless of how many buildings are in it.
 */

/** Buildings used near the avenue, where the eye is closest. */
const FRONT_ROW: ModelId[] = ['cityBlockA', 'cityBlockB', 'cityLowA', 'cityLowC'];
/** Cheap models for the bulk of the district. */
const FILL: ModelId[] = [
  'cityLowA',
  'cityLowB',
  'cityLowC',
  'cityLowD',
  'cityLowE',
  'cityLowF',
  'cityLowG',
  'cityLowH',
];
/** The skyline, kept to the back rows so the towers read as distance. */
const TOWERS: ModelId[] = ['towerA', 'towerB', 'towerC'];
/** Cars on the city streets. */
const CITY_CARS: ModelId[] = ['sedan', 'suv', 'taxi', 'van'];

interface Placement {
  id: ModelId;
  x: number;
  z: number;
  turn: number;
}

/** A car driving the grid: which street it is on and how far along it is. */
interface CityCar {
  /** Fixed coordinate of the lane, and which axis the car travels along. */
  axis: 'x' | 'z';
  lane: number;
  along: number;
  speed: number;
  /** +1 or -1; sets both the travel direction and which side of the road. */
  dir: number;
  group: number;
}

export class City {
  readonly group = new Group();

  private buildings = new Group();
  private carMeshes: { meshes: InstancedMesh[]; cars: CityCar[] }[] = [];
  private cars: CityCar[] = [];
  private dummy = new Object3D();

  constructor(
    private readonly rng: Rng,
    tier: QualityTier,
  ) {
    this.group.add(this.streets());
    this.group.add(this.buildings);
    this.setTier(tier);
  }

  /** X positions of the cross streets. */
  private get streetX(): number[] {
    const out: number[] = [];
    const step = (CITY.spanX * 2) / (CITY.streetCount - 1);
    for (let i = 0; i < CITY.streetCount; i++) out.push(-CITY.spanX + step * i);
    return out;
  }

  /** Z positions of the avenue and the streets parallel to it behind it. */
  private get avenueZ(): number[] {
    const out: number[] = [];
    for (let z = CITY.avenueZ; z >= CITY.avenueZ - CITY.depth; z -= CITY.blockDepth) {
      out.push(z);
    }
    return out;
  }

  // ----------------------------------------------------------------- streets

  private streets(): Group {
    const g = new Group();
    const fallback = asphaltTexture(1, '#5b626d');
    const kerbTex = concreteTexture();
    const width = CITY.roadWidth;
    const surface = (w: number, d: number) =>
      surfaceMaterial('asphalt', w, d, 9, 0xc4c9d0) ??
      texMat(tiled(fallback, w, d), 0xffffff);

    // Every avenue is the same slab and so is every cross street, so each set
    // is one instanced mesh rather than one mesh (and one tiled texture, and
    // one material) per road. Built the obvious way the grid cost about
    // thirty-four draw calls and a dozen extra textures on its own.
    const spanX = CITY.spanX * 2 + width;
    const spanZ = CITY.depth + CITY.blockDepth;
    const centreZ = CITY.avenueZ - CITY.depth / 2;

    g.add(
      this.row(box(spanX, 0.2, width), surface(spanX, width), this.avenueZ, (z) => [0, z]),
    );
    g.add(
      this.row(box(width, 0.2, spanZ), surface(width, spanZ), this.streetX, (x) => [
        x,
        centreZ,
      ]),
    );

    // Kerbs: two per road, so the offsets are dealt out as pairs.
    const kerbAlongX = texMat(tiled(kerbTex, spanX, 1.4, 5), 0xffffff);
    const kerbAlongZ = texMat(tiled(kerbTex, spanZ, 1.4, 5), 0xffffff);
    const offset = width / 2 + 0.7;
    const avenueKerbs: number[] = [];
    for (const z of this.avenueZ) avenueKerbs.push(z - offset, z + offset);
    const streetKerbs: number[] = [];
    for (const x of this.streetX) streetKerbs.push(x - offset, x + offset);
    g.add(
      this.row(box(spanX, 0.32, 1.4), kerbAlongX, avenueKerbs, (z) => [0, z], 0.16),
    );
    g.add(
      this.row(box(1.4, 0.32, spanZ), kerbAlongZ, streetKerbs, (x) => [x, centreZ], 0.16),
    );

    // A short slip joining the avenue to the highway, so the city is visibly
    // connected to the road the game is played on rather than floating behind it.
    const link = new Mesh(box(width, 0.2, 26), surface(width, 26));
    link.position.set(4, 0.1, CITY.avenueZ + 13);
    link.receiveShadow = true;
    g.add(link);
    return g;
  }

  /** One instanced mesh laying the same slab at each position in `values`. */
  private row(
    geometry: BufferGeometry,
    material: Material,
    values: number[],
    place: (value: number) => [number, number],
    y = 0.1,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, values.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    values.forEach((value, i) => {
      const [x, z] = place(value);
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // --------------------------------------------------------------- buildings

  /**
   * Lays buildings out block by block, set back from the kerb. Positions are
   * drawn from the seeded RNG, so the same city comes back on every reload —
   * a skyline that reshuffles when the tier changes would be very obvious.
   */
  private placements(perBlock: number): Placement[] {
    const out: Placement[] = [];
    const streets = this.streetX;
    const rows = this.avenueZ;
    const setback = CITY.roadWidth / 2 + 7;

    for (let row = 0; row < rows.length - 1; row++) {
      const zNear = rows[row]! - setback;
      const zFar = rows[row + 1]! + setback;
      for (let col = 0; col < streets.length - 1; col++) {
        const xNear = streets[col]! + setback;
        const xFar = streets[col + 1]! - setback;
        if (xFar <= xNear || zFar >= zNear) continue;

        for (let i = 0; i < perBlock; i++) {
          // Rows nearer the highway stay low; towers only appear further back,
          // which is what makes the district read as having depth.
          const pool =
            row === 0 ? FRONT_ROW : row >= CITY.towerFromRow && i === 0 ? TOWERS : FILL;
          out.push({
            id: this.rng.pick(pool),
            x: this.rng.range(xNear, xFar),
            z: this.rng.range(zFar, zNear),
            // Buildings face the street they front, in quarter turns.
            turn: this.rng.int(0, 3) * (Math.PI / 2),
          });
        }
      }
    }
    return out;
  }

  private buildBuildings(perBlock: number): void {
    this.buildings.clear();
    const byModel = new Map<ModelId, Placement[]>();
    for (const p of this.placements(perBlock)) {
      const list = byModel.get(p.id);
      if (list) list.push(p);
      else byModel.set(p.id, [p]);
    }

    for (const [id, list] of byModel) {
      const parts = meshOf(id);
      if (parts.length === 0) continue;
      for (const { geometry, material } of parts) {
        const mesh = new InstancedMesh(geometry, material, list.length);
        // The district spans the whole world; a per-instance frustum test
        // against one shared bounding sphere just pops the skyline in and out.
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        list.forEach((p, i) => {
          this.dummy.position.set(p.x, 0, p.z);
          this.dummy.rotation.set(0, p.turn, 0);
          this.dummy.scale.setScalar(1);
          this.dummy.updateMatrix();
          mesh.setMatrixAt(i, this.dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.buildings.add(mesh);
      }
    }
  }

  // ----------------------------------------------------------------- traffic

  private buildTraffic(count: number): void {
    for (const { meshes } of this.carMeshes) {
      for (const mesh of meshes) {
        this.group.remove(mesh);
        mesh.dispose();
      }
    }
    this.carMeshes = [];
    this.cars = [];

    const avenues = this.avenueZ;
    const streets = this.streetX;
    const halfLane = CITY.roadWidth / 4;
    for (let i = 0; i < count; i++) {
      // Alternate between the avenues and the cross streets so the grid is
      // busy in both directions rather than only along the skyline.
      const onAvenue = i % 2 === 0;
      const dir = this.rng.chance(0.5) ? 1 : -1;
      if (onAvenue) {
        const z = this.rng.pick(avenues);
        this.cars.push({
          axis: 'x',
          lane: z - dir * halfLane,
          along: this.rng.range(-CITY.spanX, CITY.spanX),
          speed: this.rng.range(9, 15),
          dir,
          group: 0,
        });
      } else {
        const x = this.rng.pick(streets);
        this.cars.push({
          axis: 'z',
          lane: x + dir * halfLane,
          along: this.rng.range(CITY.avenueZ - CITY.depth, CITY.avenueZ),
          speed: this.rng.range(9, 15),
          dir,
          group: 0,
        });
      }
    }

    // Deal the cars across the model pool, one InstancedMesh set per model.
    const buckets = CITY_CARS.map(() => [] as CityCar[]);
    this.cars.forEach((car, i) => {
      car.group = i % CITY_CARS.length;
      buckets[car.group]!.push(car);
    });

    CITY_CARS.forEach((id, index) => {
      const cars = buckets[index]!;
      if (cars.length === 0) return;
      const parts = meshOf(id);
      if (parts.length === 0) return;
      const meshes = parts.map(({ geometry, material }) => {
        const mesh = new InstancedMesh(geometry, material, cars.length);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return mesh;
      });
      this.carMeshes.push({ meshes, cars });
    });
  }

  /** Drives the city traffic. Called once per rendered frame. */
  update(dt: number): void {
    const minZ = CITY.avenueZ - CITY.depth;
    for (const car of this.cars) {
      car.along += car.speed * car.dir * dt;
      if (car.axis === 'x') {
        if (car.along > CITY.spanX) car.along = -CITY.spanX;
        if (car.along < -CITY.spanX) car.along = CITY.spanX;
      } else {
        if (car.along > CITY.avenueZ) car.along = minZ;
        if (car.along < minZ) car.along = CITY.avenueZ;
      }
    }

    for (const { meshes, cars } of this.carMeshes) {
      cars.forEach((car, i) => {
        if (car.axis === 'x') {
          this.dummy.position.set(car.along, 0, car.lane);
          this.dummy.rotation.set(0, car.dir > 0 ? 0 : Math.PI, 0);
        } else {
          this.dummy.position.set(car.lane, 0, car.along);
          // Models face +X, so driving along Z is a quarter turn either way.
          this.dummy.rotation.set(0, car.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        }
        this.dummy.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(i, this.dummy.matrix);
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setTier(tier: QualityTier): void {
    this.buildBuildings(CITY.density[tier]);
    this.buildTraffic(CITY.traffic[tier]);
  }
}
