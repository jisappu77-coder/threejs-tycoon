import { AmbientLight, DirectionalLight, HemisphereLight, Scene } from 'three';
import { TIERS, type QualityTier } from './Renderer';

/**
 * A three-light stylised rig rather than a single lamp:
 *
 * - a warm key sun that casts the shadows and sets the time of day,
 * - a cool sky/ground hemisphere that fills the shadow side so nothing goes to
 *   dead black (flat black shadows are what make untextured 3D look cheap),
 * - a dim cool rim from behind that separates objects from the ground.
 *
 * The shadow camera is kept deliberately tight around the playable stop — a
 * wide shadow frustum is the classic cause of blurry, expensive mobile shadows.
 */
export function createLighting(scene: Scene): (tier: QualityTier) => void {
  // Much weaker than before: the environment map now supplies most of the
  // ambient. Leaving the old constants in on top of IBL washes the scene flat.
  scene.add(new HemisphereLight(0xbcd9f2, 0x6d7a52, 0.28));
  scene.add(new AmbientLight(0xffffff, 0.05));

  const sun = new DirectionalLight(0xffe9c4, 2.1);
  sun.position.set(-38, 44, 26);
  sun.castShadow = true;
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  const rim = new DirectionalLight(0x9dc4ea, 0.3);
  rim.position.set(30, 18, -34);
  scene.add(rim);

  return (tier: QualityTier) => {
    // Every tier casts shadows now; the tier only sets how sharp they are.
    sun.castShadow = true;
    const size = TIERS[tier].shadowMapSize;
    sun.shadow.mapSize.set(size, size);
    // Force the shadow map to be rebuilt at the new size.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
}
