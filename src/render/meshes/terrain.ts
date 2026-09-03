import {
  BackSide,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Material,
} from 'three';
import { box, cone, sphere } from './geometry';
import { PALETTE, mat, texMat } from '../materials';
import {
  asphaltTexture,
  concreteTexture,
  dirtTexture,
  grassTexture,
  tiled,
} from '../textures';
import { surfaceMaterial } from '../surfaces';
import { HIGHWAY, WORLD } from '../../data/config';
import type { Rng } from '../../core/Rng';
import { meshOf, type ModelId } from '../assets';

/** Textured ground plane. Still one quad — it is always fully covered. */
export function buildGround(): Mesh {
  const size = WORLD.groundHalf * 2;
  const g = new PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  // Procedural grass on purpose — see the note in surfaces.ts about why the
  // photographic ground sets were rejected here.
  const m = new Mesh(g, texMat(grassTexture(), 0xffffff));
  m.receiveShadow = true;
  m.position.y = -0.02;
  return m;
}

/**
 * Gradient sky dome. A flat background colour makes every outdoor scene look
 * like a screenshot on coloured paper; a vertical gradient gives the world a
 * horizon to sit against.
 */
export function buildSky(): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new Color(0x5b93c9) },
      middle: { value: new Color(0x9fc6e4) },
      bottom: { value: new Color(0xe3d9c2) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 middle;
      uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.0
          ? mix(middle, top, pow(h, 0.7))
          : mix(middle, bottom, pow(-h, 0.35));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const m = new Mesh(new SphereGeometry(300, 24, 16), material);
  m.frustumCulled = false;
  return m;
}

/**
 * The highway: asphalt with proper markings — solid white edge lines, a dashed
 * centre line, kerbs and a dirt verge where the tarmac meets the grass.
 * Markings are what make a road read as a road rather than a grey strip.
 */
export function buildHighway(): Group {
  const g = new Group();
  const len = HIGHWAY.spanX * 2;
  // Every large surface gets the texture tiled to its own proportions, so the
  // grain stays the same size everywhere instead of stretching.
  const road4 = asphaltTexture(1);
  const paving = asphaltTexture(1, '#5b626d');
  const concreteBase = concreteTexture();
  const dirtBase = dirtTexture();
  // Photographic asphalt where it exists, painted canvas as the fallback. The
  // forecourt is tinted a shade lighter than the highway so the two surfaces
  // still read as different places.
  const surface = (w: number, d: number) =>
    surfaceMaterial('asphalt', w, d, 9) ?? texMat(tiled(road4, w, d), 0xffffff);
  const paved = (w: number, d: number) =>
    surfaceMaterial('asphalt', w, d, 9, 0xb9bec6) ?? texMat(tiled(paving, w, d), 0xffffff);
  const concreteFor = (w: number, d: number) =>
    texMat(tiled(concreteBase, w, d, 5), 0xffffff);

  const road = new Mesh(box(len, 0.22, HIGHWAY.width), surface(len, HIGHWAY.width));
  road.position.set(0, 0.11, HIGHWAY.z);
  road.receiveShadow = true;
  g.add(road);

  // Kerbs and verges either side.
  for (const side of [-1, 1]) {
    const kerb = new Mesh(box(len, 0.3, 1.3), concreteFor(len, 1.3));
    kerb.position.set(0, 0.15, HIGHWAY.z + side * (HIGHWAY.width / 2 + 0.65));
    kerb.receiveShadow = true;
    g.add(kerb);

    const verge = new Mesh(box(len, 0.16, 4), texMat(tiled(dirtBase, len, 4, 6), 0xffffff));
    verge.position.set(0, 0.08, HIGHWAY.z + side * (HIGHWAY.width / 2 + 3.3));
    verge.receiveShadow = true;
    g.add(verge);

    // Solid edge line.
    const edge = new Mesh(box(len, 0.06, 0.3), mat(PALETTE.lineWhite));
    edge.position.set(0, 0.24, HIGHWAY.z + side * (HIGHWAY.width / 2 - 1.1));
    g.add(edge);
  }

  // Dashed centre line, drawn as one instanced mesh.
  const dashCount = Math.floor(len / 9);
  const dashes = new InstancedMesh(
    box(4.5, 0.06, 0.34),
    mat(PALETTE.lineYellow),
    dashCount * 2,
  );
  const dummy = new Object3D();
  let n = 0;
  for (let i = 0; i < dashCount; i++) {
    for (const dz of [-0.42, 0.42]) {
      dummy.position.set(-HIGHWAY.spanX + i * 9 + 2, 0.24, HIGHWAY.z + dz);
      dummy.updateMatrix();
      dashes.setMatrixAt(n++, dummy.matrix);
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  g.add(dashes);

  // Apron the stop is built on, with a kerbed edge.
  const apron = new Mesh(box(58, 0.18, 30), paved(58, 30));
  apron.position.set(2, 0.09, 1);
  apron.receiveShadow = true;
  g.add(apron);
  g.add(edgeKerb(concreteFor(58, 0.6), 2, 16.1, 58, 0.6));
  g.add(edgeKerb(concreteFor(58, 0.6), 2, -14.1, 58, 0.6));

  // Access lane running west from the apron, where vehicles queue.
  const lane = new Mesh(box(42, 0.18, 9), paved(42, 9));
  lane.position.set(-38, 0.09, -12);
  lane.receiveShadow = true;
  g.add(lane);
  g.add(edgeKerb(concreteFor(42, 0.5), -38, -7.4, 42, 0.5));

  // Slip roads connecting the lane and the apron to the highway.
  for (const [x, rot] of [
    [HIGHWAY.entryX, 0.42],
    [HIGHWAY.exitX, -0.42],
  ] as const) {
    const slip = new Mesh(box(22, 0.17, 9), paved(22, 9));
    slip.position.set(x, 0.085, (HIGHWAY.z + HIGHWAY.slipInZ) / 2);
    slip.rotation.y = rot;
    slip.receiveShadow = true;
    g.add(slip);
  }

  return g;
}

function edgeKerb(
  material: Material,
  x: number,
  z: number,
  len: number,
  w: number,
): Mesh {
  const kerb = new Mesh(box(len, 0.3, w), material);
  kerb.position.set(x, 0.15, z);
  kerb.receiveShadow = true;
  return kerb;
}

/**
 * Distant hills that close off the playable area without an obvious wall, plus
 * a far mountain ridge with snow caps for scale.
 */
export function buildBoundary(rng: Rng): Group {
  const g = new Group();
  const ring = 78;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rng.range(-0.06, 0.06);
    const r = ring + rng.range(-10, 16);
    const s = rng.range(7, 16);
    const hill = new Mesh(
      sphere(s, 8),
      mat(rng.chance(0.5) ? PALETTE.hill : PALETTE.hillFar),
    );
    hill.position.set(Math.cos(a) * r, -s * rng.range(0.45, 0.62), Math.sin(a) * r);
    hill.scale.y = rng.range(0.5, 0.8);
    g.add(hill);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = 120 + rng.range(-14, 14);
    const h = rng.range(24, 44);
    const radius = rng.range(16, 27);
    const mtn = new Mesh(cone(radius, h, 6), mat(PALETTE.rock));
    mtn.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    g.add(mtn);
    // Snow cap: a smaller cone riding the peak.
    const cap = new Mesh(cone(radius * 0.36, h * 0.3, 6), mat(PALETTE.snow));
    cap.position.set(mtn.position.x, mtn.position.y + h * 0.36, mtn.position.z);
    g.add(cap);
  }
  return g;
}

/**
 * Scatters Kenney nature models across the map as instanced meshes, so
 * hundreds of props cost one draw call per distinct mesh. The scatter avoids
 * the road corridor and the stop's apron.
 *
 * Each model may be several meshes (trunk and leaves are separate materials),
 * so every sub-mesh gets its own InstancedMesh sharing one transform list —
 * that keeps a tree a tree while still batching.
 */
export function buildScatter(rng: Rng, treeCount: number): Group {
  const g = new Group();

  const layers: { id: ModelId; count: number; scale: [number, number] }[] = [
    { id: 'treeDefault', count: Math.round(treeCount * 0.3), scale: [0.8, 1.5] },
    { id: 'treeOak', count: Math.round(treeCount * 0.25), scale: [0.8, 1.4] },
    { id: 'treeCone', count: Math.round(treeCount * 0.25), scale: [0.8, 1.6] },
    { id: 'treeDetailed', count: Math.round(treeCount * 0.2), scale: [0.8, 1.3] },
    { id: 'bushLarge', count: Math.round(treeCount * 0.4), scale: [0.7, 1.4] },
    { id: 'rockLarge', count: Math.round(treeCount * 0.12), scale: [0.6, 1.3] },
    { id: 'rockSmall', count: Math.round(treeCount * 0.18), scale: [0.6, 1.4] },
    { id: 'grassTuft', count: Math.round(treeCount * 0.5), scale: [0.8, 1.6] },
  ];

  const free = (x: number, z: number): boolean => {
    const nearRoad = Math.abs(z - HIGHWAY.z) < HIGHWAY.width / 2 + 6;
    const onApron = x > -64 && x < 36 && z > -20 && z < 20;
    return !nearRoad && !onApron;
  };

  const dummy = new Object3D();
  for (const layer of layers) {
    const parts = meshOf(layer.id);
    if (parts.length === 0) continue;

    // One shared placement list, applied to every sub-mesh of the model.
    const placements: Matrix4[] = [];
    let guard = 0;
    while (placements.length < layer.count && guard++ < layer.count * 12) {
      const x = rng.range(-WORLD.groundHalf * 0.62, WORLD.groundHalf * 0.62);
      const z = rng.range(-WORLD.groundHalf * 0.62, WORLD.groundHalf * 0.62);
      if (!free(x, z)) continue;
      dummy.position.set(x, 0, z);
      dummy.rotation.y = rng.range(0, Math.PI * 2);
      dummy.scale.setScalar(rng.range(layer.scale[0], layer.scale[1]));
      dummy.updateMatrix();
      placements.push(dummy.matrix.clone());
    }

    for (const { geometry, material } of parts) {
      const mesh = new InstancedMesh(geometry, material, placements.length);
      placements.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      // Scenery does not cast shadows: hundreds of shadow casters is the most
      // expensive thing in the scene and buys almost nothing at this distance.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }
  return g;
}

/**
 * Painted parking-bay markings: a white outline rather than a grey patch, so a
 * bay reads as marked-out tarmac.
 */
export function buildBayMarking(): Group {
  const g = new Group();
  const w = 3.6;
  const l = 9.4;
  const line = mat(PALETTE.lineWhite);
  for (const side of [-1, 1]) {
    const rail = new Mesh(box(l, 0.05, 0.22), line);
    rail.position.set(0, 0.2, (side * w) / 2);
    g.add(rail);
  }
  const stop = new Mesh(box(0.22, 0.05, w), line);
  stop.position.set(-l / 2, 0.2, 0);
  g.add(stop);
  // A faint wear strip down the middle of each bay. Kept only a shade darker
  // than the paving — at higher contrast it reads as a painted slab, not wear.
  for (const side of [-0.9, 0.9]) {
    const track = new Mesh(box(l * 0.9, 0.04, 0.55), mat(0x515861));
    track.position.set(0.3, 0.195, side);
    g.add(track);
  }
  return g;
}

/**
 * A soft dark blot on the tarmac — oil stains. Kept close to the paving colour
 * on purpose: a high-contrast blob reads as a hole in the ground rather than
 * as a stain.
 */
export function buildStain(radius: number): Mesh {
  const m = new Mesh(sphere(radius, 10), mat(0x4a505a));
  m.scale.y = 0.008;
  m.position.y = 0.2;
  return m;
}
