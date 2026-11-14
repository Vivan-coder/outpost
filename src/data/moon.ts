import type { LevelConfig } from '../sim/sim.ts';
import { buildStorms, type SolarEvent } from './stormTimeline.ts';
import { baselineMeterRate } from './apollo.ts';
import solarEventJson from './solar-event.json' with { type: 'json' };

export const solarEvent = solarEventJson as SolarEvent;

const MISSION_LENGTH = 300;
const SOL_LENGTH = 60;

// The storms (when they are detected, when the protons arrive, how strong, how long) are built from
// the NASA DONKI records in solar-event.json. The rates below are game balance numbers for ages 10-14.
export const moon: LevelConfig = {
  id: 'moon',
  tickHz: 5,
  seed: 20240510,
  crewNames: ['Zaid', 'Mariam', 'Sam'],
  missionLength: MISSION_LENGTH,
  solLength: SOL_LENGTH,
  start: { power: 40, air: 55, food: 40, parts: 3 },
  baseCap: { power: 60, air: 80, food: 80 },
  airPerPerson: 0.07,
  foodPerPerson: 0.03,
  basePowerDraw: 0.1,
  baselineRadiation: baselineMeterRate(MISSION_LENGTH, MISSION_LENGTH / SOL_LENGTH),
  buildRadius: 45,
  wearAfter: 70,
  wearPerSecond: 0.0035,
  modules: {
    habitat: { cost: 0, radius: 4, power: 0, air: 0, food: 0, powerCap: 0, airCap: 0 },
    solar: { cost: 2, radius: 1.8, power: 0.5, air: 0, food: 0, powerCap: 0, airCap: 0 },
    battery: { cost: 2, radius: 1.2, power: 0, air: 0, food: 0, powerCap: 50, airCap: 0 },
    lifeSupport: { cost: 3, radius: 1.5, power: -0.15, air: 0.32, food: 0, powerCap: 0, airCap: 0 },
    tank: { cost: 2, radius: 1.6, power: 0, air: 0, food: 0, powerCap: 0, airCap: 50 },
    greenhouse: { cost: 3, radius: 2.6, power: -0.1, air: -0.02, food: 0.08, powerCap: 0, airCap: 0 },
  },
  chores: [
    { id: 'tomatoes', at: 'greenhouse', power: 0, air: 0, food: 0.07, partsEvery: 0 },
    { id: 'panels', at: 'solar', power: 0.22, air: 0, food: 0, partsEvery: 0 },
    { id: 'filters', at: 'lifeSupport', power: 0, air: 0.09, food: 0, partsEvery: 0 },
    { id: 'rocks', at: 'rockPile', power: 0, air: 0, food: 0, partsEvery: 22 },
  ],
  startModules: [
    { type: 'habitat', x: 0, z: 0 },
    { type: 'solar', x: -11, z: 3 },
    { type: 'lifeSupport', x: 10, z: 2 },
    { type: 'greenhouse', x: -9, z: -10 },
  ],
  rockPile: { x: 14, z: -9, radius: 1.6 },
  storms: buildStorms(solarEvent, {
    windowStart: 95,
    windowEnd: 255,
    minWarning: 15,
    secondsPerFlareMinute: 1.03,
    peakRadiation: 2.4,
    solarFactor: 0.1,
    surgeBreaks: 1,
  }),
  // Game events, not NASA data.
  events: [
    { at: 40, kind: 'failure', target: 'lifeSupport' },
    { at: 212, kind: 'meteor', count: 2 },
  ],
};
