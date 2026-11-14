import type { LevelConfig } from '../sim/sim.ts';
import { buildStorms, type SolarEvent } from './stormTimeline.ts';
import { baselineMeterRate } from './apollo.ts';
import solarEventJson from './solar-event.json' with { type: 'json' };

export const solarEvent = solarEventJson as SolarEvent;

const MISSION_LENGTH = 660;
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
  start: { power: 40, air: 55, food: 45, parts: 3 },
  baseCap: { power: 60, air: 80, food: 80 },
  airPerPerson: 0.04,
  foodPerPerson: 0.016,
  basePowerDraw: 0.06,
  playerDoseWeight: 0.6,
  choreDuration: 60,
  jobEvery: 30,
  maxJobs: 3,
  jobRewards: {
    clean: { power: 14, air: 0, food: 0 },
    water: { power: 0, air: 0, food: 10 },
    refill: { power: 0, air: 12, food: 0 },
  },
  baselineRadiation: baselineMeterRate(MISSION_LENGTH, MISSION_LENGTH / SOL_LENGTH),
  buildRadius: 45,
  wearAfter: 100,
  wearPerSecond: 0.0016,
  modules: {
    habitat: { cost: 0, radius: 5.5, power: 0, air: 0, food: 0, powerCap: 0, airCap: 0 },
    shelter: { cost: 0, radius: 4.5, power: 0, air: 0, food: 0, powerCap: 0, airCap: 0 },
    solar: { cost: 2, radius: 1.8, power: 0.3, air: 0, food: 0, powerCap: 0, airCap: 0 },
    battery: { cost: 2, radius: 1.2, power: 0, air: 0, food: 0, powerCap: 50, airCap: 0 },
    lifeSupport: { cost: 3, radius: 1.5, power: -0.09, air: 0.15, food: 0, powerCap: 0, airCap: 0 },
    tank: { cost: 2, radius: 1.6, power: 0, air: 0, food: 0, powerCap: 0, airCap: 50 },
    greenhouse: { cost: 3, radius: 2.6, power: -0.06, air: -0.01, food: 0.035, powerCap: 0, airCap: 0 },
  },
  chores: [
    { id: 'tomatoes', at: 'greenhouse', power: 0, air: 0, food: 0.04, partsEvery: 0 },
    { id: 'panels', at: 'solar', power: 0.14, air: 0, food: 0, partsEvery: 0 },
    { id: 'filters', at: 'lifeSupport', power: 0, air: 0.06, food: 0, partsEvery: 0 },
    { id: 'rocks', at: 'rockPile', power: 0, air: 0, food: 0, partsEvery: 20 },
  ],
  startModules: [
    { type: 'habitat', x: 0, z: 0 },
    { type: 'shelter', x: 15, z: 11 },
    { type: 'solar', x: -14, z: 6 },
    { type: 'lifeSupport', x: 12, z: -3 },
    { type: 'greenhouse', x: -12, z: -9 },
  ],
  rockPile: { x: 3, z: -14, radius: 1.6 },
  storms: buildStorms(solarEvent, {
    windowStart: 240,
    windowEnd: 540,
    minWarning: 60,
    maxWarning: 90,
    minDuration: 60,
    maxDuration: 90,
    secondsPerFlareMinute: 1.9,
    peakRadiation: 1.5,
    solarFactor: 0.1,
    surgeBreaks: 1,
  }),
  // Game events, not NASA data.
  events: [
    { at: 50, kind: 'failure', target: 'solar' },
    { at: 432, kind: 'failure', target: 'lifeSupport' },
    { at: 455, kind: 'meteor', count: 2 },
  ],
};
