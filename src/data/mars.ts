import type { Effects, LevelConfig } from '../sim/sim.ts';
import { moon } from './moon.ts';

// Mars preview: the same engine, a short mission, and one new idea: radio messages to Earth are slow.
// Verified facts (src/data/facts.json): Mars gravity is 0.38 of Earth's (3.73 m/s2); a message between Earth and Mars
// takes about 4 to 24 minutes one way; dust storms cut the sunlight that solar panels need.
// Game simplification: the delay is shrunk to seconds, and all effects below are game numbers.
export const MARS_GRAVITY = 3.73;
export const mars: LevelConfig = {
  ...moon,
  id: 'mars',
  planet: 'mars',
  missionLength: 240, // four sols of 60 s
  solLength: 60,
  start: { power: 55, air: 70, food: 60, parts: 3, health: 92, research: 0 },
  storms: [],
  events: [],
  wearAfter: 90,
  dustRate: 2.2, // dust settles faster on Mars
  dustStorms: [{ at: 95, duration: 65, solarFactor: 0.25 }], // a dust storm hides the Sun
  commsDelay: 20, // game seconds each way
  gravity: MARS_GRAVITY,
  goals: [
    { id: 'air', kind: 'airStreak', target: 120 },
    { id: 'power', kind: 'powerStreak', target: 180 },
    { id: 'tasks', kind: 'tasks', target: 6 },
  ],
};

// Questions that Mission Control can answer, but only after the radio delay. Each one has:
//  a: decide now (you act on your own guess), wait: the cost of waiting for Earth, best: what Earth's advice gives.
export interface MarsDecision { id: string; at: number; a: Effects; wait: Effects; best: Effects }
export const MARS_DECISIONS: MarsDecision[] = [
  { id: 'dust', at: 70, a: { power: 3, research: -2 }, wait: { power: -3 }, best: { power: 9, research: -1 } },
  { id: 'air', at: 130, a: { air: 4, power: -3 }, wait: { air: -4 }, best: { air: 10, power: -2 } },
  { id: 'walk', at: 185, a: { research: 3, radiation: 3, air: -4 }, wait: { air: -2 }, best: { research: 4, parts: 1 } },
];
