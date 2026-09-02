import { DirectionalLight, HemisphereLight, Scene } from 'three';
import { WORLD } from '../data/config';
import type { QualityTier } from './Renderer';

/**
 * One hemisphere fill plus one shadow-casting sun. The shadow camera is kept
 * deliberately tight around the playable stop — a wide shadow frustum is the
 * classic cause of blurry, expensive shadows on mobile.
 */
export function createLighting(scene: Scene): (tier: QualityTier) => void {
  const hemi = new HemisphereLight(WORLD.skyColor, WORLD.groundColor, 1.05);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff3dd, 1.5);
  sun.position.set(-34, 46, 24);
  sun.castShadow = true;
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  return (tier: QualityTier) => {
    sun.castShadow = tier !== 'low';
    const size = tier === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    // Force the shadow map to be rebuilt at the new size.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
}
