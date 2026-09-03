import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { IsoCamera } from './IsoCamera';

/**
 * Panning is a sign bug waiting to happen: the rig orbits, so a mistake in the
 * basis can look correct at one rotation and be inverted at another. These
 * tests assert the *observable* behaviour — where a fixed world point lands on
 * screen after a drag — by projecting through the camera itself, rather than
 * restating the arithmetic the implementation uses.
 */
function screenOf(camera: IsoCamera, point: Vector3): { x: number; y: number } {
  // Nothing renders here, and `project` reads `matrixWorldInverse`, which only
  // the render loop refreshes — without this every projection is a frame stale.
  camera.camera.updateMatrixWorld(true);
  const ndc = point.clone().project(camera.camera);
  // NDC y points up; screen y points down.
  return { x: ndc.x, y: -ndc.y };
}

/** Pans and settles the easing so the projection reflects the new target. */
function drag(camera: IsoCamera, dx: number, dy: number): void {
  camera.pan(dx, dy, 900);
  camera.update(5);
}

function fresh(yaw: number): { camera: IsoCamera; probe: Vector3 } {
  const camera = new IsoCamera(412 / 915);
  camera.yaw = yaw;
  camera.focus(0, 0);
  camera.update(5);
  // A point on the ground the drag should carry with it.
  return { camera, probe: new Vector3(0, 0, 0) };
}

describe('IsoCamera.pan', () => {
  for (const yaw of [0, -Math.PI / 4, Math.PI / 3, Math.PI]) {
    it(`carries the world with the finger at yaw ${yaw.toFixed(2)}`, () => {
      const right = fresh(yaw);
      const beforeRight = screenOf(right.camera, right.probe);
      drag(right.camera, 40, 0);
      const afterRight = screenOf(right.camera, right.probe);
      const movedRight = afterRight.x - beforeRight.x;
      expect(movedRight).toBeGreaterThan(0);
      // Perspective means a sideways drag never leaves the other axis exactly
      // untouched, so this bounds the cross-talk rather than forbidding it.
      expect(Math.abs(afterRight.y - beforeRight.y)).toBeLessThan(movedRight * 0.5);

      const down = fresh(yaw);
      const beforeDown = screenOf(down.camera, down.probe);
      drag(down.camera, 0, 40);
      const afterDown = screenOf(down.camera, down.probe);
      const movedDown = afterDown.y - beforeDown.y;
      expect(movedDown).toBeGreaterThan(0);
      expect(Math.abs(afterDown.x - beforeDown.x)).toBeLessThan(movedDown * 0.5);
    });
  }

  it('returns to where it started when a drag is undone', () => {
    const { camera, probe } = fresh(-Math.PI / 4);
    const before = screenOf(camera, probe);
    drag(camera, 35, -20);
    drag(camera, -35, 20);
    const after = screenOf(camera, probe);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });
});
