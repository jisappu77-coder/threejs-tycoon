import { Group, Mesh, type BufferGeometry } from 'three';
import { box, cylinder, cone } from './geometry';
import { PALETTE, mat } from '../materials';

function add(
  parent: Group,
  g: BufferGeometry,
  color: number,
  x: number,
  y: number,
  z: number,
): Mesh {
  const m = new Mesh(g, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
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
  add(g, box(14, 0.3, 3), PALETTE.concrete, 0, 0.15, 0);

  for (const x of [-4, 4]) {
    add(g, box(1.1, 2.0, 1.3), PALETTE.pumpBody, x, 1.3, 0);
    add(g, box(0.7, 0.7, 0.2), PALETTE.pumpTrim, x, 1.9, 0.72);
    add(g, cylinder(0.08, 1.2, 5), PALETTE.tyre, x + 0.7, 1.6, 0);
  }

  // Corner posts stand clear of both bays.
  for (const x of [-6.5, 6.5]) {
    for (const z of [-6.5, 6.5]) {
      add(g, box(0.6, 5.0, 0.6), PALETTE.canopyTrim, x, 2.5, z);
    }
  }
  for (const z of [-6.5, 6.5]) {
    add(g, box(14.6, 0.55, 0.55), PALETTE.canopy, 0, 5.0, z);
    add(g, box(14.8, 0.35, 0.75), PALETTE.canopyTrim, 0, 4.62, z);
  }
  for (const x of [-6.5, -2.2, 2.2, 6.5]) {
    add(g, box(0.45, 0.4, 13.6), PALETTE.canopy, x, 5.0, 0);
  }
  // Illuminated header board facing the highway.
  add(g, box(9, 1.5, 0.35), PALETTE.gold, 0, 6.1, -6.5);
  return g;
}

/** The dhaba: a low building with a shaded veranda and rooftop sign. */
export function buildCanteen(): Group {
  const g = new Group();
  add(g, box(12, 0.4, 8), PALETTE.concrete, 0, 0.2, 0);
  add(g, box(10, 3.4, 6.4), PALETTE.building, 0, 2.1, 0);
  add(g, box(11, 0.5, 7.4), PALETTE.buildingRoof, 0, 4.05, 0);
  // veranda posts and awning facing the forecourt (-Z)
  for (const x of [-4.2, 0, 4.2]) add(g, box(0.4, 2.8, 0.4), PALETTE.wood, x, 1.8, -4.6);
  add(g, box(11, 0.3, 3.2), PALETTE.canopyTrim, 0, 3.3, -4.6);
  // windows and door
  add(g, box(1.6, 1.2, 0.2), PALETTE.glass, -3, 2.3, -3.3);
  add(g, box(1.6, 1.2, 0.2), PALETTE.glass, 3, 2.3, -3.3);
  add(g, box(1.6, 2.4, 0.2), PALETTE.wood, 0, 1.6, -3.3);
  // rooftop sign
  add(g, box(6, 1.4, 0.3), PALETTE.gold, 0, 5.1, 0);
  for (const x of [-2, 2]) add(g, box(0.25, 0.9, 0.25), PALETTE.sign, x, 4.4, 0);
  return g;
}

/** Reserved for the repair & wash unlock; a simple open-fronted workshop. */
export function buildWorkshop(): Group {
  const g = new Group();
  add(g, box(12, 0.4, 9), PALETTE.concrete, 0, 0.2, 0);
  add(g, box(11, 4.2, 8), PALETTE.rock, 0, 2.5, 1);
  add(g, box(11.6, 0.5, 9), PALETTE.buildingRoof, 0, 4.8, 0.6);
  add(g, box(9, 3.2, 0.3), PALETTE.glass, 0, 2.0, -3.1);
  return g;
}

/** Roadside totem sign that shows the stop exists from a distance. */
export function buildSign(): Group {
  const g = new Group();
  add(g, box(0.6, 8, 0.6), PALETTE.sign, 0, 4, 0);
  add(g, box(4.4, 3, 0.4), PALETTE.gold, 0, 8.6, 0);
  add(g, box(3.6, 0.7, 0.5), PALETTE.sign, 0, 9.2, 0.1);
  add(g, box(3.6, 0.7, 0.5), PALETTE.sign, 0, 8.1, 0.1);
  return g;
}

/** Simple humanoid used for attendants. */
export function buildWorker(): Group {
  const g = new Group();
  add(g, box(0.7, 1.0, 0.45), PALETTE.worker, 0, 1.05, 0);
  add(g, box(0.5, 0.5, 0.45), PALETTE.workerSkin, 0, 1.8, 0);
  add(g, box(0.62, 0.16, 0.55), PALETTE.gold, 0, 2.03, 0);
  add(g, box(0.28, 0.55, 0.28), PALETTE.tyre, -0.18, 0.28, 0);
  add(g, box(0.28, 0.55, 0.28), PALETTE.tyre, 0.18, 0.28, 0);
  return g;
}

/** Stack of cash that pops out of a serviced vehicle. */
export function buildCashPile(): Group {
  const g = new Group();
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(box(1.0, 0.16, 0.6), mat(i === 2 ? PALETTE.gold : PALETTE.cash));
    m.position.set(0, 0.2 + i * 0.17, 0);
    m.rotation.y = i * 0.28;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function buildTree(variant: number): Group {
  const g = new Group();
  add(g, cylinder(0.28, 2.2, 5), PALETTE.treeTrunk, 0, 1.1, 0);
  const leaf = variant % 2 === 0 ? PALETTE.treeLeaf : PALETTE.treeLeafAlt;
  if (variant % 3 === 0) {
    add(g, cone(1.7, 4.2, 6), leaf, 0, 4.0, 0);
  } else {
    add(g, cone(1.9, 2.6, 6), leaf, 0, 3.0, 0);
    add(g, cone(1.4, 2.2, 6), leaf, 0, 4.3, 0);
  }
  return g;
}
