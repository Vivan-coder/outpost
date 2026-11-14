// Where things stand inside the station and the shelter, relative to the building centre (+z is the door side).
// Shared by the building models, the crew routines and the player's interaction targets.
export const STATION = {
  control: { x: -1.9, z: -4.2 }, // comms
  engineering: { x: 1.9, z: -4.2 }, // upgrade console
  o2: { x: -4.0, z: -1.5 },
  water: { x: 4.0, z: -1.5 },
  canteen: { x: -3.0, z: 1.5 },
  bunks: { x: 3.6, z: 2.4 },
  exercise: { x: 2.6, z: 0.0 },
  medical: { x: 0.0, z: -1.5 },
  window: { x: 0.0, z: -3.4 },
};
export const SHELTER = { radmon: { x: 0, z: -3.0 } };

// Standing spots a person uses at each station task (in front of the equipment).
export const TASK_SPOT: Record<string, { x: number; z: number }> = {
  exercise: { x: 2.6, z: 0.9 },
  medical: { x: 0.0, z: -0.5 },
  comms: { x: -1.9, z: -3.0 },
  radmon: { x: 0, z: -1.8 },
};
