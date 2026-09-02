import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Object3D,
} from 'three';
import { box, cone, sphere } from './geometry';
import { PALETTE, mat } from '../materials';
import { HIGHWAY, WORLD } from '../../data/config';
import type { Rng } from '../../core/Rng';

/** Flat ground plane. Kept as one big quad — it is always fully covered. */
export function buildGround(): Mesh {
  const g = new PlaneGeometry(WORLD.groundHalf * 2, WORLD.groundHalf * 2, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new Mesh(g, mat(PALETTE.grass, { flatShading: false }));
  m.receiveShadow = true;
  m.position.y = -0.02;
  return m;
}

/**
 * The highway: a long asphalt ribbon with a shoulder, a dashed centre line and
 * the slip road into the stop. Every piece is a flat box so the whole road is
 * a handful of draw calls.
 */
export function buildHighway(): Group {
  const g = new Group();
  const len = HIGHWAY.spanX * 2;

  const road = new Mesh(box(len, 0.2, HIGHWAY.width), mat(PALETTE.asphalt));
  road.position.set(0, 0.1, HIGHWAY.z);
  road.receiveShadow = true;
  g.add(road);

  // shoulders
  for (const side of [-1, 1]) {
    const s = new Mesh(box(len, 0.24, 1.2), mat(PALETTE.concrete));
    s.position.set(0, 0.12, HIGHWAY.z + side * (HIGHWAY.width / 2 + 0.6));
    s.receiveShadow = true;
    g.add(s);
  }

  // dashed centre line, drawn as one instanced mesh
  const dashCount = Math.floor(len / 9);
  const dashes = new InstancedMesh(box(4.5, 0.05, 0.35), mat(PALETTE.lineYellow), dashCount);
  const dummy = new Object3D();
  for (let i = 0; i < dashCount; i++) {
    dummy.position.set(-HIGHWAY.spanX + i * 9 + 2, 0.22, HIGHWAY.z);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  dashes.instanceMatrix.needsUpdate = true;
  g.add(dashes);

  // apron: the paved area the stop is built on
  const apron = new Mesh(box(58, 0.16, 30), mat(PALETTE.asphaltDark));
  apron.position.set(2, 0.08, 1);
  apron.receiveShadow = true;
  g.add(apron);

  // access lane running west from the apron, where vehicles queue
  const lane = new Mesh(box(42, 0.16, 9), mat(PALETTE.asphaltDark));
  lane.position.set(-38, 0.08, -12);
  lane.receiveShadow = true;
  g.add(lane);

  // slip roads connecting the lane and the apron to the highway
  for (const [x, rot] of [
    [HIGHWAY.entryX, 0.42],
    [HIGHWAY.exitX, -0.42],
  ] as const) {
    const slip = new Mesh(box(22, 0.17, 9), mat(PALETTE.asphaltDark));
    slip.position.set(x, 0.085, (HIGHWAY.z + HIGHWAY.slipInZ) / 2);
    slip.rotation.y = rot;
    slip.receiveShadow = true;
    g.add(slip);
  }

  return g;
}

/**
 * Distant hills that close off the playable area without an obvious wall, plus
 * a far mountain ridge for scale.
 */
export function buildBoundary(rng: Rng): Group {
  const g = new Group();
  const ring = 78;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng.range(-0.06, 0.06);
    const r = ring + rng.range(-10, 14);
    const s = rng.range(7, 15);
    const hill = new Mesh(sphere(s, 7), mat(PALETTE.hill));
    hill.position.set(Math.cos(a) * r, -s * rng.range(0.45, 0.62), Math.sin(a) * r);
    hill.scale.y = rng.range(0.5, 0.8);
    g.add(hill);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = 118 + rng.range(-12, 12);
    const h = rng.range(22, 40);
    const mtn = new Mesh(cone(rng.range(16, 26), h, 5), mat(PALETTE.rock));
    mtn.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    g.add(mtn);
  }
  return g;
}

/**
 * Scatters trees and rocks as instanced meshes so hundreds of props cost two
 * draw calls. The scatter avoids the road corridor and the stop's apron.
 */
export function buildScatter(rng: Rng, treeCount: number): Group {
  const g = new Group();
  const trunk = new InstancedMesh(box(0.5, 2.2, 0.5), mat(PALETTE.treeTrunk), treeCount);
  const leaves = new InstancedMesh(cone(1.9, 3.6, 6), mat(PALETTE.treeLeaf), treeCount);
  const dummy = new Object3D();
  let placed = 0;
  let guard = 0;

  while (placed < treeCount && guard++ < treeCount * 12) {
    const x = rng.range(-WORLD.groundHalf * 0.62, WORLD.groundHalf * 0.62);
    const z = rng.range(-WORLD.groundHalf * 0.62, WORLD.groundHalf * 0.62);
    const nearRoad = Math.abs(z - HIGHWAY.z) < HIGHWAY.width / 2 + 5;
    const onApron = x > -62 && x < 34 && z > -20 && z < 20;
    if (nearRoad || onApron) continue;

    const s = rng.range(0.7, 1.5);
    dummy.position.set(x, 1.1 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rng.range(0, Math.PI * 2);
    dummy.updateMatrix();
    trunk.setMatrixAt(placed, dummy.matrix);

    dummy.position.y = 3.4 * s;
    dummy.updateMatrix();
    leaves.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  // Unused instances would render at the origin; collapse them.
  const hide = new Matrix4().makeScale(0, 0, 0);
  for (let i = placed; i < treeCount; i++) {
    trunk.setMatrixAt(i, hide);
    leaves.setMatrixAt(i, hide);
  }
  trunk.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  trunk.castShadow = false;
  leaves.castShadow = false;
  g.add(trunk, leaves);
  return g;
}

/** Painted parking-bay markings, one flat quad per bay. */
export function buildBayMarking(): Mesh {
  const geo = new BufferGeometry();
  const w = 3.4;
  const l = 9;
  const verts = [-l / 2, 0, -w / 2, l / 2, 0, -w / 2, l / 2, 0, w / 2, -l / 2, 0, w / 2];
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  const m = new Mesh(geo, mat(PALETTE.asphalt, { flatShading: false }));
  m.position.y = 0.18;
  return m;
}
