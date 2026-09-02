import { Color, Fog, Group, Scene } from 'three';
import { HIGHWAY, STATIONS, WORLD } from '../data/config';
import { Rng } from '../core/Rng';
import { createLighting } from '../render/Lighting';
import type { QualityTier } from '../render/Renderer';
import {
  buildBayMarking,
  buildBoundary,
  buildGround,
  buildHighway,
  buildScatter,
} from '../render/meshes/terrain';
import {
  buildCanteen,
  buildFuelStation,
  buildSign,
} from '../render/meshes/structures';
import type { TruckStop } from '../sim/TruckStop';

const TREES = { low: 90, medium: 180, high: 300 } as const;

/**
 * The static scene: ground, highway, scenery, boundary hills, and the physical
 * structures of the stop. Structures appear when their station is unlocked, so
 * buying an upgrade visibly changes the world rather than a number on a menu.
 */
export class World {
  readonly scene = new Scene();
  private structures = new Map<string, Group>();
  private scatter: Group;
  private applyLightTier: (tier: QualityTier) => void;

  constructor(
    private readonly stop: TruckStop,
    tier: QualityTier,
    seed = 20260902,
  ) {
    const rng = new Rng(seed);
    this.scene.background = new Color(WORLD.skyColor);
    this.scene.fog = new Fog(WORLD.skyColor, WORLD.fogNear, WORLD.fogFar);

    this.applyLightTier = createLighting(this.scene);
    this.scene.add(buildGround());
    this.scene.add(buildHighway());
    this.scene.add(buildBoundary(rng));

    this.scatter = buildScatter(rng, TREES[tier]);
    this.scene.add(this.scatter);

    // Roadside totem, so the stop announces itself from down the highway.
    const sign = buildSign();
    sign.position.set(-26, 0, -19);
    this.scene.add(sign);

    for (const def of STATIONS) {
      const group = def.id === 'canteen' ? buildCanteen() : buildFuelStation();
      group.position.set(def.x, 0, def.z);
      group.rotation.y = def.heading;
      this.scene.add(group);
      this.structures.set(def.id, group);

      for (const bay of def.bays) {
        const marking = buildBayMarking();
        marking.position.set(bay.x, 0.18, bay.z);
        this.scene.add(marking);
      }
    }
    this.refresh();
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
    this.scatter = buildScatter(new Rng(20260902), TREES[tier]);
    this.scene.add(this.scatter);
  }

  /** Advances the short "built!" animation on any newly placed structure. */
  update(dt: number): void {
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
}

const animating = new WeakMap<Group, number>();

function popIn(group: Group): void {
  animating.set(group, 0.001);
  group.scale.set(1, 0.02, 1);
}
