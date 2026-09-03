import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';

/**
 * A soft dark blob laid flat on the ground under an object.
 *
 * Screen-space AO was tried first (GTAOPass) and crushed whole surfaces to
 * black at this camera's depth range. This is the cheap, predictable
 * alternative: one transparent quad per object, no extra pass, and it does the
 * job that matters — stopping things from looking like they hover.
 *
 * The directional light already casts a real shadow; this fills the tight
 * contact region under a body that a 512-2048px shadow map cannot resolve.
 */
let sharedTexture: Texture | null = null;

function blobTexture(): Texture {
  if (sharedTexture) return sharedTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  // Radial falloff, squared so the centre stays dense and the edge fades out
  // well before the quad's border (a visible seam reads as a decal).
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  sharedTexture = new CanvasTexture(canvas);
  return sharedTexture;
}

const geometry = new PlaneGeometry(1, 1);
let sharedMaterial: MeshBasicMaterial | null = null;

function blobMaterial(): MeshBasicMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
      // Unlit: a contact shadow should not itself be lit or it brightens in
      // sun and disappears exactly where it is most needed.
      fog: true,
    });
  }
  return sharedMaterial;
}

/**
 * Builds a contact shadow sized to an object's footprint. `length` runs along
 * X, matching how vehicles are oriented.
 */
export function buildContactShadow(length: number, width: number): Mesh {
  const mesh = new Mesh(geometry, blobMaterial());
  mesh.rotation.x = -Math.PI / 2;
  // Slightly larger than the object and just above the ground plane, under the
  // road markings' own offset so it never z-fights with them.
  mesh.scale.set(length * 1.25, width * 1.7, 1);
  mesh.position.y = 0.215;
  mesh.renderOrder = 1;
  return mesh;
}
