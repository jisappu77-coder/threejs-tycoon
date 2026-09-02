import { Group, Mesh, type Camera } from 'three';
import { box } from './geometry';
import { PALETTE, basic } from '../materials';

/**
 * A billboarded progress bar floating above a vehicle. A bar rather than a
 * radial ring on purpose: filling a bar is a single scale change per frame,
 * where a ring means rebuilding geometry every step.
 */
export class ProgressBar {
  readonly group = new Group();
  private fill: Mesh;

  constructor(width = 3.4) {
    // Dark plate behind a bright fill, so the bar reads against both the sky
    // and a pale vehicle.
    const back = new Mesh(box(width + 0.3, 0.72, 0.06), basic(0x11151b));
    const inset = new Mesh(box(width + 0.06, 0.5, 0.07), basic(0x2b333f));
    inset.position.z = 0.01;

    this.fill = new Mesh(box(width, 0.44, 0.09), basic(PALETTE.gold));
    this.fill.position.z = 0.02;
    // Move the pivot to the left edge so scaling grows the bar rightwards.
    this.fill.geometry = this.fill.geometry.clone();
    this.fill.geometry.translate(width / 2, 0, 0);
    this.fill.position.x = -width / 2;

    this.group.add(back, inset, this.fill);
    this.group.visible = false;
  }

  set(progress: number): void {
    this.fill.scale.x = Math.max(0.001, Math.min(1, progress));
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Keeps the bar facing the camera. Cheap: copies the camera's rotation. */
  faceCamera(camera: Camera): void {
    if (!this.group.visible) return;
    this.group.quaternion.copy(camera.quaternion);
  }
}
