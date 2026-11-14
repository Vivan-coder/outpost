import type { LevelConfig } from '../sim/sim.ts';

// Storm timing and which storms happen come from the NASA records in nasaStorm.ts.
// Every rate below is a game balance number, simplified for ages 10-14, not a NASA measurement.
export const moon: LevelConfig = {
  id: 'moon',
  tickHz: 5,
  seed: 20240510,
  crewNames: ['Zaid', 'Mariam', 'Sam'],
  missionLength: 300,
  solLength: 60,
  start: { power: 40, air: 55, food: 40, parts: 3 },
  baseCap: { power: 60, air: 80, food: 80 },
  airPerPerson: 0.07,
  foodPerPerson: 0.03,
  basePowerDraw: 0.1,
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
  storms: [
    // 10 May 2024: protons above 10 MeV
    { recordId: 'sepMay10', warnAt: 95, startAt: 120, duration: 40, radiation: 1.5, solarFactor: 0.1, surgeBreaks: 1 },
    // 11 May 2024: protons above 100 MeV, harder to stop, so a faster dose
    { recordId: 'sepMay11', warnAt: 235, startAt: 255, duration: 30, radiation: 2.4, solarFactor: 0.1, surgeBreaks: 1 },
  ],
  events: [
    { at: 40, kind: 'failure', target: 'lifeSupport' },
    { at: 195, kind: 'meteor', count: 2 },
  ],
};
