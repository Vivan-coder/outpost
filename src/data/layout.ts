// The base layout: one source of truth for the station interior, the shelter, the outdoor area and the crew spots.
// Used by the building models, the crew routines, the interaction targets and scripts/validate-layout.ts.
// Interior coordinates are relative to the building centre. +z is the door side.
// docs/layout.md explains the zones.

export interface Footprint { id: string; x: number; z: number; r: number }
export interface Spot { x: number; z: number }

export const STATION_R = 7;
export const SHELTER_R = 4.5;

// ---- Station interior: zones around the ring, a clear walkway through the middle ----
// Airlock (front, by the door) · Control room (back left) · Engineering (back right) ·
// Life support (left) · Galley (front left) · Medical, exercise and bunks (right)
export const STATION = {
  lockers: { x: 0, z: 5.1 }, // placeholder centre for the airlock zone label
  control: { x: -2.2, z: -4.8 }, // comms desk
  weather: { x: -4.2, z: -3.6 }, // space weather console
  engineering: { x: 2.2, z: -4.8 }, // upgrade console
  tools: { x: 4.2, z: -3.6 }, // tool rack
  spares: { x: 5.2, z: -1.6 }, // spare-parts shelf with labelled bins
  o2: { x: -5.0, z: -0.9 }, // oxygen unit and tank rack
  water: { x: -5.0, z: 1.4 }, // water recovery and tank
  canteen: { x: -2.6, z: 2.4 }, // galley table
  foodLocker: { x: -4.1, z: 3.6 }, // food storage lockers
  medical: { x: 2.0, z: -0.7 },
  exercise: { x: 4.5, z: 0.4 },
  bunks: { x: 3.9, z: 3.0 },
  window: { x: 0.0, z: -6.0 },
};

export const STATION_PROPS: Footprint[] = [
  { id: 'suitLockerL', x: -2.9, z: 5.1, r: 0.6 },
  { id: 'suitLockerR', x: 2.9, z: 5.1, r: 0.6 },
  { id: 'control', ...STATION.control, r: 0.9 },
  { id: 'weather', ...STATION.weather, r: 0.7 },
  { id: 'engineering', ...STATION.engineering, r: 0.9 },
  { id: 'tools', ...STATION.tools, r: 0.7 },
  { id: 'spares', ...STATION.spares, r: 0.7 },
  { id: 'o2', ...STATION.o2, r: 0.9 },
  { id: 'water', ...STATION.water, r: 0.9 },
  { id: 'canteen', ...STATION.canteen, r: 1.0 },
  { id: 'foodLocker', ...STATION.foodLocker, r: 0.6 },
  { id: 'medical', ...STATION.medical, r: 1.0 },
  { id: 'exercise', ...STATION.exercise, r: 1.0 },
  { id: 'bunks', ...STATION.bunks, r: 1.0 },
];

// Where a person stands to use each thing (in front of it, on the walkway side).
export const STATION_SPOTS: Record<string, Spot> = {
  comms: { x: -2.2, z: -3.6 },
  weather: { x: -3.3, z: -2.5 },
  engineering: { x: 2.2, z: -3.6 },
  tools: { x: 3.4, z: -2.6 },
  exercise: { x: 3.0, z: 0.4 },
  medical: { x: 0.8, z: -0.7 },
};

// Crew relax spots (they must not block anything the player uses)
export const CREW_SPOTS: Record<string, Spot> = {
  galley1: { x: -2.6, z: 1.0 },
  galley2: { x: -1.3, z: 3.3 },
  window1: { x: -0.5, z: -5.3 },
  window2: { x: 0.7, z: -5.3 },
  tablet: { x: -0.4, z: -3.4 },
};

export const TASK_SPOT: Record<string, Spot> = {
  exercise: STATION_SPOTS.exercise,
  medical: STATION_SPOTS.medical,
  comms: STATION_SPOTS.comms,
  radmon: { x: 0, z: -1.8 },
  supplies: { x: 1.8, z: 0.6 },
};
export const SHELTER = { radmon: { x: 0, z: -3.0 } };
export const SHELTER_PROPS: Footprint[] = [
  { id: 'radmon', x: 0, z: -3.2, r: 0.6 },
  { id: 'crates', x: 2.8, z: 1.0, r: 0.8 },
  { id: 'bunkL', x: -2.2, z: -2.2, r: 0.8 },
  { id: 'bunkM', x: 0, z: -2.9, r: 0.0 },
  { id: 'bunkR', x: 2.2, z: -2.2, r: 0.8 },
];
export const SHELTER_SPOTS: Record<string, Spot> = { radmon: { x: 0, z: -1.8 }, supplies: { x: 1.8, z: 0.6 } };

// ---- Outdoors (world coordinates; the station is at 0,0) ----
export const SHELTER_AT = { x: 17, z: 11 };
export const LANDER_PAD = { x: 16, z: 28, r: 3.5 };
export const MODULE_POS = {
  solar: { x: -17, z: -2 }, // solar field, with a cleaning path along its south side
  battery: { x: -14, z: 12 }, // power building
  lifeSupport: { x: 13, z: -4 },
  greenhouse: { x: -15, z: -13 },
  tank: { x: 9, z: -11 },
};
export const ROCK_PILE = { x: 4, z: -18, radius: 1.6 };
// Storage containers: crates and racks outside, each labelled
export const CONTAINERS: Footprint[] = [
  { id: 'storageA', x: 21, z: -2, r: 1.4 },
  { id: 'storageB', x: 21, z: -7, r: 1.4 },
];
export const OUTDOOR_RADII = { solar: 1.8, battery: 1.2, lifeSupport: 1.5, greenhouse: 2.6, tank: 1.6 };
