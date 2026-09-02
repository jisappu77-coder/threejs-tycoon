import { Group, Mesh, Object3D, type BufferGeometry } from 'three';
import { rbox } from './geometry';
import { PALETTE, mat } from '../materials';
import { findByName, model, type ModelId } from '../assets';
import type { VehicleKind } from '../../data/config';

/**
 * Vehicles come from Kenney's CC0 Car Kit (see public/models/CREDITS.md). Each
 * model already carries named wheel nodes, so the view layer can spin the
 * wheels and bob the body without any rigging work here.
 */

export interface VehicleParts {
  group: Group;
  /** Wheel nodes, spun by the view layer with distance travelled. */
  wheels: Object3D[];
  /** Body node, bobbed slightly on its suspension while moving. */
  body: Object3D;
}

/**
 * Which model each vehicle kind uses. Passing traffic draws from a pool so the
 * highway is not a parade of one car: the kit paints each model from a fixed
 * spot on its colour atlas, so variety has to come from using different models
 * rather than from tinting one.
 */
const CAR_VARIANTS: ModelId[] = ['sedan', 'suv', 'taxi', 'police', 'ambulance'];
const CUSTOMER_VARIANTS: ModelId[] = ['boxTruck', 'pickup'];

function modelFor(kind: VehicleKind, colorIndex: number): ModelId {
  switch (kind) {
    case 'truck':
      return CUSTOMER_VARIANTS[colorIndex % CUSTOMER_VARIANTS.length]!;
    case 'hauler':
      return 'flatbed';
    case 'van':
      return 'van';
    case 'car':
    default:
      return CAR_VARIANTS[colorIndex % CAR_VARIANTS.length]!;
  }
}

/**
 * Fallback shape, used only if a model failed to load. Better a plain box than
 * an invisible vehicle the player can still be asked to serve.
 */
function fallback(kind: VehicleKind): VehicleParts {
  const group = new Group();
  const body = new Group();
  const long = kind === 'truck' || kind === 'hauler' ? 9 : kind === 'van' ? 6 : 4.6;
  const m = new Mesh(rbox(long, 2.4, 2.3, 0.3), mat(PALETTE.truckTrailer));
  m.position.y = 1.4;
  m.castShadow = true;
  body.add(m);
  group.add(body);
  return { group, body, wheels: [] };
}

export function buildVehicle(kind: VehicleKind, colorIndex: number): VehicleParts {
  const loaded = model(modelFor(kind, colorIndex));
  if (!loaded) return fallback(kind);

  const group = new Group();
  const body = loaded;
  group.add(body);

  const wheels = findByName(loaded, (name) => name.startsWith('wheel'));
  return { group, body, wheels };
}

/** A simplified shell for distant instanced traffic. */
export function ambientShell(): BufferGeometry {
  return rbox(4.8, 1.8, 2.1, 0.35);
}

/** Rough length of each vehicle, used for queue spacing and bay offsets. */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  truck: 8.6,
  hauler: 9,
  van: 6,
  car: 5,
};
