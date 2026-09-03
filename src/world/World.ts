import { Fog, Group, InstancedMesh, Matrix4, Object3D, Scene } from 'three';
import { HIGHWAY, STATIONS, WORLD } from '../data/config';
import { Rng } from '../core/Rng';
import { createLighting } from '../render/Lighting';
import { TIERS, type QualityTier } from '../render/Renderer';
import {
  buildBayMarking,
  buildBoundary,
  buildGround,
  buildHighway,
  buildOffRoadTrack,
  buildScatter,
  buildSky,
  buildStain,
} from '../render/meshes/terrain';
import { buildCanteen, buildFuelStation, buildSign } from '../render/meshes/structures';
import { meshOf, model, type ModelId } from '../render/assets';
import type { TruckStop } from '../sim/TruckStop';
import { City } from './City';

/**
 * The static scene: sky, ground, highway, scenery, boundary and the physical
 * structures of the stop. Structures appear when their station is unlocked, so
 * buying an upgrade visibly changes the world rather than a number on a menu.
 */
export class World {
  readonly scene = new Scene();
  private structures = new Map<string, Group>();
  private scatter: Group;
  private city: City;
  private applyLightTier: (tier: QualityTier) => void;
  private seed: number;

  constructor(
    private readonly stop: TruckStop,
    tier: QualityTier,
    seed = 20260902,
  ) {
    this.seed = seed;
    const rng = new Rng(seed);
    // Fog tinted to the sky's horizon band, so distant hills dissolve into the
    // sky instead of stopping against it. The distances come from config: this
    // used to hardcode its own, which quietly swallowed the city the moment the
    // camera range grew past them.
    this.scene.fog = new Fog(0xa9c8e0, WORLD.fogNear, WORLD.fogFar);

    this.applyLightTier = createLighting(this.scene);
    this.scene.add(buildSky());
    this.scene.add(buildGround());
    this.scene.add(buildHighway());
    this.scene.add(buildBoundary(rng));
    this.scene.add(buildOffRoadTrack());

    this.scatter = buildScatter(rng, TIERS[tier].trees);
    this.scene.add(this.scatter);

    // The city gets its own RNG stream so changing the scatter count does not
    // reshuffle the skyline — the same seed has to produce the same city.
    this.city = new City(new Rng(seed ^ 0x5c17), tier);
    this.scene.add(this.city.group);
    this.scene.add(this.dressing(rng));

    for (const def of STATIONS) {
      const group = def.id === 'canteen' ? buildCanteen() : buildFuelStation();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.heading;
      this.scene.add(group);
      this.structures.set(def.id, group);

      for (const bay of def.bays) {
        const marking = buildBayMarking();
        marking.position.set(bay.x, 0, bay.z);
        this.scene.add(marking);
      }
    }
    this.refresh();
  }

  /**
   * Yard clutter, from the Kenney city kits. A working truck stop is not a
   * clean slab — the containers, tanks, cones and fencing are what make the
   * lot look used rather than newly poured.
   */
  private dressing(rng: Rng): Group {
    const g = new Group();

    // Repeated props are collected and drawn instanced: a run of 20 poles and
    // barriers as individual meshes is 20+ draw calls for scenery nobody looks
    // at closely.
    const batches = new Map<ModelId, Matrix4[]>();
    const dummy = new Object3D();
    const place = (
      id: ModelId,
      x: number,
      z: number,
      rotation = 0,
      scale = 1,
    ): void => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      const list = batches.get(id);
      if (list) list.push(dummy.matrix.clone());
      else batches.set(id, [dummy.matrix.clone()]);
    };

    const flush = (): void => {
      for (const [id, transforms] of batches) {
        const parts = meshOf(id);
        if (parts.length === 0) {
          // Model missing: fall back to real clones so nothing silently vanishes.
          for (const matrix of transforms) {
            const prop = model(id);
            if (!prop) break;
            prop.applyMatrix4(matrix);
            g.add(prop);
          }
          continue;
        }
        for (const { geometry, material } of parts) {
          const mesh = new InstancedMesh(geometry, material, transforms.length);
          transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          g.add(mesh);
        }
      }
    };

    const sign = buildSign();
    sign.position.set(-26, 0, -19);
    g.add(sign);

    // Power poles marching along the far verge, giving the highway depth.
    for (let x = -110; x <= 110; x += 26) {
      place('pole', x, HIGHWAY.z - 13, Math.PI / 2);
    }
    // Street lights along the forecourt edge.
    for (const x of [-30, -6, 18]) place('streetLight', x, -15.5, Math.PI);

    // Barriers marking the back edge of the lot.
    for (let x = -20; x <= 30; x += 5) place('barrier', x, 16.6);

    // Working clutter.
    // The industrial tank used to sit here. It is a very dark model and, at
    // every camera position tried, it read as a hole in the tarmac rather than
    // as a piece of kit — dropped rather than kept moving it somewhere else.
    place('container', 25, 12.5, 0.2);
    place('container', 27.5, 8, 1.6, 0.9);
    place('dumpster', -27, 6, 0.9);
    place('cone', -14.5, -8.5);
    place('cone', 4, -8.6);
    place('cone', 21, 9);
    place('cone', -13.2, -8.2);

    // Bushes softening the edge where tarmac meets grass.
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? 17.8 : -16.2;
      place(
        i % 3 === 0 ? 'bush' : 'bushLarge',
        rng.range(-32, 34),
        side + rng.range(-1.4, 1.4),
        rng.range(0, Math.PI * 2),
        rng.range(0.8, 1.5),
      );
    }

    // Oil stains where vehicles stand the longest.
    for (const [x, z, r] of [
      [-9, -4.5, 1.5],
      [-9, 4.5, 1.3],
      [9, -1, 1.4],
      [-18, -10, 1.1],
      [-25, -10, 0.9],
    ] as const) {
      const stain = buildStain(r);
      stain.position.set(x + rng.range(-0.6, 0.6), 0.2, z + rng.range(-0.6, 0.6));
      g.add(stain);
    }

    flush();
    return g;
  }

  /** Shows or hides structures to match what has been bought. */
  refresh(): void {
    for (const station of this.stop.stations) {
      const group = this.structures.get(station.id);
      if (!group) continue;
      if (station.unlocked && !group.visible) {
        group.visible = true;
        popIn(group);
      } else {
        group.visible = station.unlocked;
      }
    }
  }

  setTier(tier: QualityTier): void {
    this.applyLightTier(tier);
    this.scene.remove(this.scatter);
    this.scatter = buildScatter(new Rng(this.seed), TIERS[tier].trees);
    this.scene.add(this.scatter);
    this.city.setTier(tier);
  }

  /** Advances the short "built!" animation on any newly placed structure. */
  update(dt: number): void {
    this.city.update(dt);
    for (const group of this.structures.values()) {
      const anim = animating.get(group);
      if (anim === undefined) continue;
      const t = Math.min(1, anim + dt * 1.8);
      if (t >= 1) {
        animating.delete(group);
        group.scale.setScalar(1);
        continue;
      }
      animating.set(group, t);
      // Overshoot slightly then settle, so a new building lands with weight.
      const eased = 1 + Math.sin(t * Math.PI) * 0.12;
      group.scale.set(eased, t < 0.5 ? t * 2 * eased : eased, eased);
    }
  }

  static get highwayLaneZ(): number {
    return HIGHWAY.z + HIGHWAY.laneOffset;
  }

  static get groundHalf(): number {
    return WORLD.groundHalf;
  }
}

const animating = new WeakMap<Group, number>();

function popIn(group: Group): void {
  animating.set(group, 0.001);
  group.scale.set(1, 0.02, 1);
}
