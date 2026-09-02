import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

export type PickKind = 'vehicle' | 'pad' | 'cash';

interface Registration {
  object: Object3D;
  kind: PickKind;
  id: string;
}

/**
 * Raycasts against a small registry of pickable objects rather than the whole
 * scene. Ray-testing every tree and every road dash on each tap is wasted work
 * on a phone; this keeps the candidate set to a couple of dozen objects.
 */
export class Picker {
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private registry = new Map<Object3D, Registration>();

  register(object: Object3D, kind: PickKind, id: string): void {
    this.registry.set(object, { object, kind, id });
  }

  unregister(object: Object3D): void {
    this.registry.delete(object);
  }

  clear(): void {
    this.registry.clear();
  }

  /** Returns the nearest registered object under the given screen point. */
  pick(
    screenX: number,
    screenY: number,
    camera: Camera,
  ): { kind: PickKind; id: string } | null {
    if (this.registry.size === 0) return null;
    this.ndc.set(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, camera);

    const objects = [...this.registry.keys()];
    const hits = this.raycaster.intersectObjects(objects, true);
    for (const hit of hits) {
      // Walk up to whichever ancestor was actually registered.
      let node: Object3D | null = hit.object;
      while (node) {
        const reg = this.registry.get(node);
        if (reg) return { kind: reg.kind, id: reg.id };
        node = node.parent;
      }
    }
    return null;
  }
}
