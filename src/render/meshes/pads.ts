import { Group, Mesh, RingGeometry } from 'three';
import { cone, cylinder } from './geometry';
import { PALETTE, basic, mat } from '../materials';
import { MeshBasicMaterial } from 'three';

/**
 * An upgrade pad: a glowing footprint in the world that the player taps to buy
 * the thing that will be built there. Upgrades are physical places, not menu
 * rows, so the world itself tells you what you can do next.
 */
export interface Pad {
  group: Group;
  /** The mesh registered with the picker. */
  hitbox: Mesh;
  setAffordable(canAfford: boolean): void;
  update(t: number): void;
  dispose(): void;
}

export function buildPad(radius = 3): Pad {
  const group = new Group();

  // Unlit materials: a pad has to stay readable against dark asphalt in
  // shadow, and shading it would let the sun angle decide how visible it is.
  const ringMat = new MeshBasicMaterial({
    color: PALETTE.padGhost,
    transparent: true,
    opacity: 0.8,
  });
  const fillMat = new MeshBasicMaterial({
    color: PALETTE.padGhost,
    transparent: true,
    opacity: 0.22,
  });

  const ring = new Mesh(new RingGeometry(radius * 0.86, radius, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.24;
  group.add(ring);

  const fill = new Mesh(new RingGeometry(0, radius * 0.86, 24), fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.23;
  group.add(fill);

  // Floating marker so the pad reads even when the camera is low or the pad is
  // behind a building.
  const marker = new Group();
  const shaft = new Mesh(cylinder(0.22, 1.3, 6), basic(PALETTE.gold));
  shaft.position.y = 1.25;
  const head = new Mesh(cone(0.7, 1.1, 6), basic(PALETTE.gold));
  head.rotation.x = Math.PI; // point down at the pad
  marker.add(shaft, head);
  marker.position.y = 3.0;
  group.add(marker);

  // Invisible, generously sized tap target — a thin ring is very hard to hit
  // with a fingertip on a phone.
  const hitbox = new Mesh(cylinder(radius * 1.2, 5, 10), mat(PALETTE.padGhost));
  hitbox.position.y = 2.5;
  hitbox.visible = false;
  group.add(hitbox);

  let affordable = true;

  return {
    group,
    hitbox,
    setAffordable(canAfford: boolean) {
      if (canAfford === affordable) return;
      affordable = canAfford;
      const color = canAfford ? PALETTE.padGhost : PALETTE.padLocked;
      ringMat.color.setHex(color);
      fillMat.color.setHex(color);
      marker.visible = canAfford;
    },
    update(t: number) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      ringMat.opacity = 0.55 + pulse * 0.45;
      fillMat.opacity = 0.14 + pulse * 0.14;
      marker.position.y = 3.0 + pulse * 0.6;
      marker.rotation.y = t * 1.2;
    },
    dispose() {
      ring.geometry.dispose();
      fill.geometry.dispose();
      ringMat.dispose();
      fillMat.dispose();
    },
  };
}
