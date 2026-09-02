import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA, WORLD } from '../data/config';

/**
 * A Clash-of-Clans style rig: a perspective camera locked to a shallow pitch,
 * orbiting a ground target. Perspective rather than orthographic — it reads as
 * isometric at this pitch but keeps the parallax that makes the world feel 3D.
 */
export class IsoCamera {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3(CAMERA.startTarget.x, 0, CAMERA.startTarget.z);

  yaw = -Math.PI / 4;
  private distance: number = CAMERA.startZoom;
  private smoothed = new Vector3();
  private aspectPullback = 1;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(52, aspect, 1, 400);
    this.setAspect(aspect);
    this.smoothed.copy(this.target);
    this.apply();
  }

  setAspect(aspect: number): void {
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Pull back on tall screens so a portrait phone frames the whole stop
    // rather than one building.
    this.aspectPullback =
      1 + Math.max(0, 1 - aspect) * (CAMERA.portraitPullback - 1) * 2;
  }

  get zoom(): number {
    return this.distance;
  }

  /** 0 at max zoom-out, 1 fully zoomed in. Used to scale pan speed. */
  get zoomFactor(): number {
    return (
      (this.distance - CAMERA.minZoom) / (CAMERA.maxZoom - CAMERA.minZoom)
    );
  }

  /** Screen-space drag, in pixels, converted to movement on the ground plane. */
  pan(dxPixels: number, dyPixels: number, viewportHeight: number): void {
    // Scale so a drag moves roughly the same amount of world under the finger
    // regardless of zoom level.
    const worldPerPixel = (this.distance * this.aspectPullback * 1.1) / viewportHeight;
    const dx = -dxPixels * worldPerPixel;
    const dz = -dyPixels * worldPerPixel;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    this.target.x += dx * cos - dz * sin;
    this.target.z += dx * sin + dz * cos;
    this.clampTarget();
  }

  zoomBy(factor: number): void {
    this.distance = MathUtils.clamp(
      this.distance / factor,
      CAMERA.minZoom,
      CAMERA.maxZoom,
    );
  }

  rotateBy(radians: number): void {
    this.yaw += radians;
  }

  focus(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.clampTarget();
  }

  private clampTarget(): void {
    this.target.x = MathUtils.clamp(this.target.x, -WORLD.panLimit.x, WORLD.panLimit.x);
    this.target.z = MathUtils.clamp(this.target.z, -WORLD.panLimit.z, WORLD.panLimit.z);
  }

  /** Called once per rendered frame; eases toward the target for a soft feel. */
  update(dt: number): void {
    const k = 1 - Math.pow(0.0015, dt);
    this.smoothed.lerp(this.target, k);
    this.apply();
  }

  private apply(): void {
    const pitch = CAMERA.pitch;
    const dist = this.distance * this.aspectPullback;
    const horizontal = Math.cos(pitch) * dist;
    this.camera.position.set(
      this.smoothed.x + Math.sin(this.yaw) * horizontal,
      Math.sin(pitch) * dist,
      this.smoothed.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.smoothed);
  }
}
