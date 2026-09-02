/**
 * Every tunable number in the game lives here so balancing is a single-file
 * edit. Nothing in this module imports from the rest of the game.
 *
 * World axes: the highway runs along +X. Traffic drives east on the near lane
 * and west on the far lane. The player's stop sits south of the highway (+Z).
 */

export const WORLD = {
  /** Half-extent of the visible ground plane. */
  groundHalf: 140,
  /** Camera pan is clamped to this box around the stop. */
  panLimit: { x: 44, z: 26 },
  skyColor: 0x8fb8dc,
  groundColor: 0x6f8f4f,
  fogNear: 70,
  fogFar: 190,
} as const;

export const HIGHWAY = {
  /** Centre line of the road in Z. */
  z: -26,
  laneOffset: 4.2,
  width: 15,
  /** How far east/west vehicles exist before being recycled. */
  spanX: 130,
  /** Where diverting vehicles leave and rejoin the road. */
  slipInZ: -14,
  entryX: -46,
  exitX: 32,
  /** Lane vehicles use to drive back out to the highway. */
  exitZ: -17,
  /** Seconds between highway spawns, scaled down as the stop grows. */
  spawnInterval: 1.9,
  /**
   * Interactive vehicles are created and destroyed well inside `spanX`: there
   * is no point simulating a truck 130m away that the player cannot see, and a
   * shorter approach means the first customer arrives quickly.
   */
  interactiveSpawnX: -78,
  interactiveDespawnX: 78,
  /** Ambient (instanced, non-interactive) traffic count per quality tier. */
  ambientCount: { low: 14, medium: 26, high: 40 },
} as const;

export type VehicleKind = 'truck' | 'car' | 'van' | 'bus';

export interface VehicleSpec {
  kind: VehicleKind;
  speed: number;
  /** Relative chance of spawning. */
  weight: number;
  /** Multiplies what this vehicle pays for a service. */
  payMultiplier: number;
  /** Multiplies how long a service takes. */
  serviceMultiplier: number;
  /** Only these vehicles ever pull into the stop. */
  customer: boolean;
}

export const VEHICLES: Record<VehicleKind, VehicleSpec> = {
  truck: {
    kind: 'truck',
    speed: 13,
    weight: 4,
    payMultiplier: 1,
    serviceMultiplier: 1,
    customer: true,
  },
  bus: {
    kind: 'bus',
    speed: 15,
    weight: 1.2,
    payMultiplier: 1.5,
    serviceMultiplier: 1.4,
    customer: true,
  },
  van: {
    kind: 'van',
    speed: 17,
    weight: 2,
    payMultiplier: 0.6,
    serviceMultiplier: 0.7,
    customer: true,
  },
  car: {
    kind: 'car',
    speed: 20,
    weight: 3,
    payMultiplier: 0.35,
    serviceMultiplier: 0.5,
    customer: false,
  },
};

export type StationKind = 'fuel' | 'canteen' | 'repair';

export interface BayDef {
  id: string;
  /** Where the vehicle parks. */
  x: number;
  z: number;
  /** Facing in radians; 0 points along +X. */
  heading: number;
}

export interface StationDef {
  id: string;
  kind: StationKind;
  label: string;
  /** Structure position. */
  x: number;
  z: number;
  heading: number;
  bays: BayDef[];
  /** Seconds of work for one vehicle at level 1. */
  serviceTime: number;
  /** Cash paid on completion at level 1. */
  payout: number;
  /** Unlocked from the very start? */
  startUnlocked: boolean;
}

export const STATIONS: StationDef[] = [
  {
    id: 'fuel',
    kind: 'fuel',
    label: 'Fuel Station',
    x: -9,
    z: -1,
    heading: 0,
    serviceTime: 3.2,
    payout: 26,
    startUnlocked: true,
    // The bays sit either side of the pump island, under the canopy.
    bays: [
      { id: 'fuel-1', x: -9, z: -4.5, heading: 0 },
      { id: 'fuel-2', x: -9, z: 4.5, heading: 0 },
    ],
  },
  {
    id: 'canteen',
    kind: 'canteen',
    label: 'Dhaba Canteen',
    x: 13,
    z: 7,
    heading: 0,
    serviceTime: 7.5,
    payout: 88,
    startUnlocked: false,
    bays: [
      { id: 'canteen-1', x: 9, z: -1, heading: 0 },
      { id: 'canteen-2', x: 18, z: -1, heading: 0 },
    ],
  },
  // Extension point: a repair & wash station drops in here with kind:'repair',
  // a slower serviceTime and a much larger payout. RepairWashStation only needs
  // a mesh builder and an upgrade entry to become real.
];

export const SERVICE = {
  /** Seconds of held touch needed to complete one unit of manual work. */
  manualRate: 1,
  /** A hired worker services at this fraction of manual speed, per level. */
  workerRate: [0, 0.55, 0.75, 0.95],
  /** Each speed upgrade level multiplies service time by this. */
  speedStep: 0.82,
  /** Queue slots per level. */
  queueSlots: [3, 5, 7],
  /** Front of the waiting line; the queue extends west from here. */
  queueStart: { x: -18, z: -10 },
  queueSpacing: 7,
  /** A driver who waits this long without being served gives up and leaves. */
  patienceSeconds: 55,
} as const;

export const ECONOMY = {
  startCash: 60,
  /** A dropped cash pile vanishes (auto-banked at a penalty) after this. */
  dropLifetime: 26,
  dropDecayKeep: 0.6,
  /** Offline earnings are capped at this many hours. */
  offlineCapHours: 4,
  /** Offline runs at this fraction of live automated income. */
  offlineRate: 0.5,
  /** Attractiveness -> divert probability curve. */
  baseDivertChance: 0.55,
  queuePenalty: 0.11,
} as const;

export interface UpgradeDef {
  id: string;
  title: string;
  description: string;
  cost: number;
  /** Position of the physical pad in the world. */
  pad: { x: number; z: number };
  /** Shown on the pad and in the panel. */
  short: string;
  /** Ids that must be bought before this pad appears. */
  requires?: string[];
  /** Repeatable upgrades: how many times, and the cost growth per purchase. */
  maxLevel?: number;
  costGrowth?: number;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'pump2',
    title: 'Second Pump',
    description: 'Open a second fuel bay so two vehicles can refuel at once.',
    short: '+1 Fuel Bay',
    cost: 140,
    pad: { x: -9, z: 4.5 },
  },
  {
    id: 'worker',
    title: 'Hire Attendant',
    description:
      'An attendant works the fuel pumps for you. Later hires work faster and cover the canteen.',
    short: 'Automate',
    cost: 260,
    pad: { x: -20, z: 5 },
    maxLevel: 3,
    costGrowth: 2.4,
  },
  {
    id: 'canteen',
    title: 'Dhaba Canteen',
    description: 'Hot food for drivers. Slower to serve, pays far more than fuel.',
    short: 'New Service',
    cost: 520,
    pad: { x: 13, z: 7 },
    requires: ['pump2'],
  },
  {
    id: 'speed',
    title: 'Better Equipment',
    description: 'Faster pumps and a bigger kitchen. Every service completes quicker.',
    short: 'Speed +',
    cost: 380,
    pad: { x: 0, z: 8 },
    maxLevel: 3,
    costGrowth: 2.2,
    requires: ['pump2'],
  },
  {
    id: 'queue',
    title: 'Bigger Forecourt',
    description: 'More room to wait, so fewer drivers pass you by when it is busy.',
    short: 'Queue +',
    cost: 300,
    pad: { x: -30, z: -3 },
    maxLevel: 2,
    costGrowth: 2.6,
  },
];

export const LEVELS: { at: number; name: string }[] = [
  { at: 0, name: 'Roadside Stop' },
  { at: 300, name: 'Fuel Stop' },
  { at: 1200, name: 'Busy Stop' },
  { at: 4000, name: 'Highway Halt' },
  { at: 12000, name: 'Truck Plaza' },
];

export const SAVE = {
  key: 'highway-tycoon:save',
  version: 1,
  /** Autosave interval in seconds. */
  interval: 10,
} as const;

export const CAMERA = {
  pitch: 0.78,
  minZoom: 26,
  maxZoom: 78,
  startZoom: 62,
  startTarget: { x: -6, z: -4 },
  /**
   * A tall phone screen sees far less of the ground at a given distance than a
   * wide one, so the rig pulls back on narrow aspect ratios. Without this the
   * default view on a portrait phone is a close-up of one building.
   */
  portraitPullback: 1.5,
} as const;
