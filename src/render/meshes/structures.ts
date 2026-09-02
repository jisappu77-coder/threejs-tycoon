import { Group, Mesh, Object3D, type BufferGeometry, type Material } from 'three';
import { findByName, model } from '../assets';
import { box, cone, cylinder, rbox, sphere, taper, torus } from './geometry';
import { PALETTE, glow, mat, texMat } from '../materials';
import {
  concreteTexture,
  panelTexture,
  plasterTexture,
  roofTexture,
  woodTexture,
} from '../textures';

function add(
  parent: Group,
  g: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
): Mesh {
  const m = new Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function part(
  parent: Group,
  g: BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh {
  return add(parent, g, mat(color), x, y, z);
}

/**
 * The fuel island: pumps down the middle with a bay either side, wrapped in an
 * open canopy frame. The frame is beams rather than a solid roof on purpose —
 * a slab at this height would hide the vehicles being served underneath it
 * from a camera looking down at the forecourt, which is the one thing the
 * player needs to see.
 */
export function buildFuelStation(): Group {
  const g = new Group();
  const concrete = texMat(concreteTexture(), 0xffffff);

  // Island: kerbed, with a chamfered edge so it catches light.
  add(g, rbox(14, 0.38, 3, 0.1), concrete, 0, 0.19, 0);
  part(g, rbox(14.3, 0.16, 3.3, 0.06), PALETTE.kerb, 0, 0.42, 0);

  for (const x of [-4, 4]) {
    // Pump body with a display head and a hose reaching out to the bay.
    part(g, rbox(1.3, 2.2, 1.4, 0.16), PALETTE.pumpBody, x, 1.4, 0);
    part(g, rbox(1.05, 0.75, 0.22, 0.06), PALETTE.sign, x, 2.15, 0.72);
    add(g, rbox(0.85, 0.5, 0.1, 0.04), glow(PALETTE.gold, 0.5), x, 2.15, 0.84);
    part(g, rbox(1.34, 0.2, 1.44, 0.06), PALETTE.pumpTrim, x, 2.62, 0);
    // Hose: a short arc of segments beats a straight stick for readability.
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      part(
        g,
        cylinder(0.07, 0.4, 6),
        PALETTE.tyre,
        x + 0.72,
        1.85 - t * 0.5,
        0.55 + t * 0.75,
      );
    }
    part(g, rbox(0.18, 0.34, 0.18, 0.05), PALETTE.chrome, x + 0.72, 1.28, 1.4);
  }

  // Corner posts stand clear of both bays.
  for (const x of [-6.5, 6.5]) {
    for (const z of [-6.5, 6.5]) {
      part(g, rbox(0.72, 5.0, 0.72, 0.1), PALETTE.canopyTrim, x, 2.5, z);
      part(g, rbox(1.1, 0.3, 1.1, 0.08), PALETTE.concrete, x, 0.15, z);
    }
  }
  const beam = texMat(panelTexture('#f0f2f4', 'rgba(160,168,178,0.5)'), 0xffffff);
  for (const z of [-6.5, 6.5]) {
    add(g, rbox(14.6, 0.6, 0.6, 0.12), beam, 0, 5.0, z);
    part(g, rbox(14.8, 0.38, 0.8, 0.1), PALETTE.canopyTrim, 0, 4.6, z);
  }
  for (const x of [-6.5, -2.2, 2.2, 6.5]) {
    add(g, rbox(0.5, 0.44, 13.6, 0.1), beam, x, 5.0, 0);
  }
  // A solid roof panel over the island strip only. It gives the canopy a real
  // roof to read as, while the bays either side stay open to the camera so the
  // vehicles being served are never hidden.
  // Kept to the width of the island itself: any deeper and it starts hiding
  // the vehicle in the far bay from a camera looking over the canopy.
  add(g, rbox(14.6, 0.34, 3.2, 0.1), beam, 0, 5.12, 0);
  part(g, rbox(14.8, 0.22, 3.4, 0.08), PALETTE.canopyTrim, 0, 4.92, 0);
  // Illuminated header board facing the highway.
  part(g, rbox(9, 1.6, 0.4, 0.14), PALETTE.canopyTrim, 0, 6.1, -6.5);
  add(g, rbox(8.2, 1.0, 0.16, 0.1), glow(PALETTE.gold, 0.75), 0, 6.1, -6.75);
  // Downlights under the beams.
  for (const x of [-4.5, 0, 4.5]) {
    add(g, cylinder(0.28, 0.16, 8), glow(PALETTE.headlight, 0.9), x, 4.72, 0);
  }
  return g;
}

/**
 * The dhaba, assembled from Kenney City Kit pieces: a low roadside building
 * with a wide awning and a couple of parasols out front. Composing a place
 * from several kit pieces reads far more like a business than a single box.
 */
export function buildCanteen(): Group {
  const g = new Group();
  const building = model('canteenBuilding');
  if (building) {
    g.add(building);
  } else {
    // Fallback if the model failed to load, so the station is never invisible.
    add(g, rbox(12, 4, 8, 0.2), texMat(plasterTexture(), 0xffffff), 0, 2, 0);
  }

  const awning = model('awning');
  if (awning) {
    awning.position.set(0, 0, -5.4);
    g.add(awning);
  }
  for (const x of [-5.2, 5.2]) {
    const parasol = model('parasol');
    if (!parasol) break;
    parasol.position.set(x, 0, -7.4);
    g.add(parasol);
  }
  const tank = model('waterTower');
  if (tank) {
    tank.position.set(7.5, 0, 4.5);
    tank.scale.setScalar(0.7);
    g.add(tank);
  }
  return g;
}

/** Reserved for the repair & wash unlock; an open-fronted workshop. */
export function buildWorkshop(): Group {
  const g = new Group();
  const panel = texMat(panelTexture('#8b929b', 'rgba(60,66,74,0.5)'), 0xffffff);
  const roof = texMat(roofTexture(), 0xffffff);
  add(g, rbox(12.4, 0.45, 9.4, 0.1), texMat(concreteTexture(), 0xffffff), 0, 0.22, 0);
  add(g, rbox(11, 4.4, 8, 0.16), panel, 0, 2.6, 1);
  add(g, rbox(11.8, 0.55, 9.2, 0.12), roof, 0, 5.0, 0.6);
  part(g, rbox(9, 3.4, 0.3, 0.1), PALETTE.glass, 0, 2.1, -3.1);
  return g;
}

/** Roadside totem so the stop announces itself from down the highway. */
export function buildSign(): Group {
  const g = new Group();
  part(g, rbox(0.7, 8, 0.7, 0.12), PALETTE.sign, 0, 4, 0);
  part(g, rbox(4.8, 3.2, 0.5, 0.18), PALETTE.canopyTrim, 0, 8.6, 0);
  add(g, rbox(4.2, 1.1, 0.2, 0.1), glow(PALETTE.gold, 0.8), 0, 9.2, -0.2);
  add(g, rbox(4.2, 0.8, 0.2, 0.1), glow(PALETTE.lineWhite, 0.5), 0, 8.0, -0.2);
  part(g, rbox(1.6, 0.3, 1.6, 0.08), PALETTE.concrete, 0, 0.15, 0);
  return g;
}

/**
 * Attendant. Kenney's mini characters are rigged with named limb nodes, so the
 * view layer can drive a work cycle straight off the model with no rigging
 * work here.
 */
export interface WorkerParts {
  group: Group;
  arms: Object3D[];
  legs: Object3D[];
}

export function buildWorker(variant = 0): WorkerParts {
  const group = new Group();
  const character = model(variant % 2 === 0 ? 'workerA' : 'workerB');
  if (!character) {
    // Fallback stick figure; keeps the hire visible if the model is missing.
    part(group, rbox(0.78, 1.05, 0.5, 0.16), PALETTE.worker, 0, 1.15, 0);
    part(group, sphere(0.29, 10), PALETTE.workerSkin, 0, 1.95, 0);
    return { group, arms: [], legs: [] };
  }
  group.add(character);
  return {
    group,
    arms: findByName(character, (n) => n.startsWith('arm')),
    legs: findByName(character, (n) => n.startsWith('leg')),
  };
}

/** Stack of cash that pops out of a serviced vehicle. */
export function buildCashPile(): Group {
  const g = new Group();
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(
      rbox(1.05, 0.18, 0.62, 0.05),
      mat(i === 2 ? PALETTE.gold : PALETTE.cash),
    );
    m.position.set(0, 0.22 + i * 0.19, 0);
    m.rotation.y = i * 0.3;
    m.castShadow = true;
    g.add(m);
  }
  const coin = new Mesh(cylinder(0.3, 0.1, 12), glow(PALETTE.gold, 0.6));
  coin.position.y = 0.95;
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  return g;
}

export function buildTree(variant: number): Group {
  const g = new Group();
  part(g, taper(0.22, 0.4, 2.4, 7), PALETTE.treeTrunk, 0, 1.2, 0);
  const leaf =
    variant % 3 === 0
      ? PALETTE.treeLeaf
      : variant % 3 === 1
        ? PALETTE.treeLeafAlt
        : PALETTE.treeLeafLight;
  if (variant % 2 === 0) {
    // Conifer: stacked cones.
    part(g, cone(1.9, 2.6, 8), leaf, 0, 3.1, 0);
    part(g, cone(1.45, 2.2, 8), leaf, 0, 4.3, 0);
    part(g, cone(0.95, 1.7, 8), leaf, 0, 5.4, 0);
  } else {
    // Broadleaf: overlapping spheres make a fuller, less geometric canopy.
    part(g, sphere(1.7, 10), leaf, 0, 3.5, 0);
    part(g, sphere(1.2, 9), leaf, 0.9, 4.2, 0.4);
    part(g, sphere(1.0, 9), leaf, -0.8, 4.0, -0.5);
  }
  return g;
}

// ---------------------------------------------------------------- yard props

/** Oil drum. */
export function buildDrum(color: number = PALETTE.drum): Group {
  const g = new Group();
  part(g, cylinder(0.42, 1.2, 12), color, 0, 0.6, 0);
  for (const y of [0.35, 0.85]) part(g, torus(0.44, 0.05, 12), PALETTE.chrome, 0, y, 0);
  part(g, cylinder(0.43, 0.08, 12), PALETTE.chrome, 0, 1.22, 0);
  return g;
}

/** Stacked crates. */
export function buildCrates(): Group {
  const g = new Group();
  const wood = texMat(woodTexture(), 0xffffff);
  add(g, rbox(1.2, 1.0, 1.2, 0.08), wood, 0, 0.5, 0);
  add(g, rbox(1.0, 0.85, 1.0, 0.08), wood, 0.15, 1.42, -0.1);
  return g;
}

/** Tyre stack — cheap, and instantly reads as a truck stop. */
export function buildTyreStack(): Group {
  const g = new Group();
  for (let i = 0; i < 4; i++) {
    const t = part(g, torus(0.55, 0.22, 12), PALETTE.tyre, 0, 0.24 + i * 0.34, 0);
    t.rotation.x = Math.PI / 2;
    t.rotation.z = i * 0.5;
  }
  return g;
}

/** Traffic cone. */
export function buildCone(): Group {
  const g = new Group();
  part(g, rbox(0.66, 0.1, 0.66, 0.04), PALETTE.canopyTrim, 0, 0.05, 0);
  part(g, cone(0.26, 0.9, 8), PALETTE.canopyTrim, 0, 0.55, 0);
  part(g, torus(0.16, 0.04, 10), PALETTE.lineWhite, 0, 0.62, 0);
  return g;
}

/** Roadside power pole; a run of them gives the highway depth. */
export function buildPole(): Group {
  const g = new Group();
  const wood = texMat(woodTexture(), 0xffffff);
  add(g, taper(0.16, 0.24, 9, 7), wood, 0, 4.5, 0);
  add(g, rbox(2.6, 0.2, 0.2, 0.06), wood, 0, 8.3, 0);
  for (const x of [-1.1, 0, 1.1]) {
    part(g, cylinder(0.07, 0.3, 6), PALETTE.glassLight, x, 8.55, 0);
  }
  return g;
}

/** Low bush for softening hard edges between tarmac and grass. */
export function buildBush(variant: number): Group {
  const g = new Group();
  const color = variant % 2 === 0 ? PALETTE.bush : PALETTE.treeLeaf;
  part(g, sphere(0.85, 8), color, 0, 0.65, 0);
  part(g, sphere(0.6, 8), color, 0.65, 0.5, 0.25);
  part(g, sphere(0.5, 8), color, -0.55, 0.45, -0.2);
  if (variant % 3 === 0) {
    part(g, sphere(0.14, 6), PALETTE.flowerA, 0.2, 1.3, 0.2);
    part(g, sphere(0.12, 6), PALETTE.flowerB, -0.3, 1.15, -0.1);
  }
  return g;
}

/** Metal fence panel, used along the back of the lot. */
export function buildFencePanel(): Group {
  const g = new Group();
  part(g, rbox(0.16, 1.6, 0.16, 0.04), PALETTE.rock, -2, 0.8, 0);
  part(g, rbox(0.16, 1.6, 0.16, 0.04), PALETTE.rock, 2, 0.8, 0);
  for (const y of [0.55, 1.25]) part(g, box(4, 0.1, 0.08), PALETTE.rock, 0, y, 0);
  for (let i = -3; i <= 3; i++) {
    part(g, box(0.07, 1.3, 0.07), PALETTE.rock, i * 0.55, 0.85, 0);
  }
  return g;
}
