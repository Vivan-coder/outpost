import type { LevelConfig } from '../sim/sim.ts';
import { buildStorms, type SolarEvent } from './stormTimeline.ts';
import { baselineMeterRate } from './apollo.ts';
import { MODULE_POS, ROCK_PILE, SHELTER_AT } from './layout.ts';
import solarEventJson from './solar-event.json' with { type: 'json' };

export const solarEvent = solarEventJson as SolarEvent;

const MISSION_LENGTH = 660;
const SOL_LENGTH = 60;

// The storms (when they are detected, when the protons arrive, how strong, how long) are built from
// the NASA DONKI records in solar-event.json. The rates and rewards below are game balance numbers.
// Tasks are inspired by real space station work and simplified. `why` points into facts.json and is only
// set where the fact was verified on a NASA page.
export const moon: LevelConfig = {
  id: 'moon',
  tickHz: 5,
  seed: 20240510,
  crewNames: ['Zaid', 'Mariam', 'Sam'],
  missionLength: MISSION_LENGTH,
  solLength: SOL_LENGTH,
  start: { power: 40, air: 55, food: 45, parts: 3, health: 90, research: 0 },
  baseCap: { power: 60, air: 80, food: 80 },
  airPerPerson: 0.04,
  foodPerPerson: 0.016,
  basePowerDraw: 0.06,
  playerDoseWeight: 0.6,
  baselineRadiation: baselineMeterRate(MISSION_LENGTH, MISSION_LENGTH / SOL_LENGTH),
  healthDecay: 0.04,
  jobGap: [45, 75],
  maxJobs: 3,
  crewRewardShare: 0.7,
  buildRadius: 45,
  wearAfter: 100,
  wearPerSecond: 0.0016,
  modules: {
    habitat: { cost: 0, radius: 7, power: 0, air: 0, food: 0, powerCap: 0, airCap: 0 },
    shelter: { cost: 0, radius: 4.5, power: 0, air: 0, food: 0, powerCap: 0, airCap: 0 },
    solar: { cost: 2, radius: 1.8, power: 0.3, air: 0, food: 0, powerCap: 0, airCap: 0 },
    battery: { cost: 2, radius: 1.2, power: 0, air: 0, food: 0, powerCap: 50, airCap: 0 },
    lifeSupport: { cost: 3, radius: 1.5, power: -0.09, air: 0.15, food: 0, powerCap: 0, airCap: 0 },
    tank: { cost: 2, radius: 1.6, power: 0, air: 0, food: 0, powerCap: 0, airCap: 50 },
    greenhouse: { cost: 3, radius: 2.6, power: -0.06, air: -0.01, food: 0.03, powerCap: 0, airCap: 0 },
  },
  tasks: [
    { id: 'o2gen', at: 'lifeSupport', mini: 'gauge', seconds: 28, reward: { air: 14, research: 3 }, why: null, player: true },
    { id: 'water', at: 'tank', mini: 'sequence', seconds: 26, reward: { air: 12, research: 3 }, why: 'water90', player: true },
    { id: 'co2', at: 'lifeSupport', mini: 'sequence', seconds: 30, reward: { air: 10, health: 2, research: 3 }, why: null, player: true },
    { id: 'thermal', at: 'battery', mini: 'gauge', seconds: 24, reward: { power: 12, research: 3 }, why: null, player: true },
    { id: 'solar', at: 'solar', mini: 'wipe', seconds: 30, reward: { power: 18, research: 3 }, why: 'dustPanels', player: true },
    { id: 'greenhouse', at: 'greenhouse', mini: 'wipe', seconds: 28, reward: { research: 3 }, why: null, player: true },
    { id: 'exercise', at: 'habitat', mini: 'gauge', seconds: 30, reward: { health: 14, research: 2 }, why: 'exercise2h', player: true },
    { id: 'medical', at: 'habitat', mini: 'sequence', seconds: 25, reward: { health: 12, research: 3 }, why: 'bone1', player: true },
    { id: 'radmon', at: 'shelter', mini: 'gauge', seconds: 24, reward: { radiation: -6, research: 4 }, why: null, player: true },
    { id: 'comms', at: 'habitat', mini: 'sequence', seconds: 30, reward: { research: 5 }, why: null, player: true },
    { id: 'supplies', at: 'shelter', mini: 'sequence', seconds: 22, reward: { food: 6, research: 3 }, why: null, player: true },
    { id: 'regolith', at: 'rockPile', mini: 'wipe', seconds: 30, reward: { parts: 2, research: 1 }, why: null, player: false },
  ],
  upgrades: {
    solar: { costs: [3, 6], mult: [1, 1.4, 1.8] },
    lifeSupport: { costs: [4, 7], mult: [1, 1.4, 1.8] },
    greenhouse: { costs: [4, 7], mult: [1, 1.4, 1.8] },
    battery: { costs: [3, 5], mult: [0, 25, 50] },
    tank: { costs: [3, 5], mult: [0, 25, 50] },
    station: { costs: [4, 8], mult: [0.5, 0.3, 0.15] },
    engineering: { costs: [4, 8], mult: [1, 0.8, 0.6] },
  },
  autoRepairSeconds: 45,
  goals: [
    { id: 'air', kind: 'airStreak', target: 180 },
    { id: 'power', kind: 'powerStreak', target: 300 },
    { id: 'health', kind: 'healthStreak', target: 240 },
    { id: 'tasks', kind: 'tasks', target: 12 },
    { id: 'upgrades', kind: 'upgrades', target: 3 },
    { id: 'radiation', kind: 'radiationUnder', target: 25 },
  ],
  startModules: [
    { type: 'habitat', x: 0, z: 0 },
    { type: 'shelter', ...SHELTER_AT },
    { type: 'solar', ...MODULE_POS.solar },
    { type: 'lifeSupport', ...MODULE_POS.lifeSupport },
    { type: 'greenhouse', ...MODULE_POS.greenhouse },
    { type: 'tank', ...MODULE_POS.tank },
    { type: 'battery', ...MODULE_POS.battery },
  ],
  rockPile: ROCK_PILE,
  storms: buildStorms(solarEvent, {
    windowStart: 240,
    windowEnd: 540,
    minWarning: 60,
    maxWarning: 90,
    minDuration: 40,
    maxDuration: 55,
    secondsPerFlareMinute: 1.9,
    peakRadiation: 1.5,
    solarFactor: 0.1,
    surgeBreaks: 1,
  }),
  // Game events, not NASA data.
  events: [
    { at: 38, kind: 'failure', target: 'solar' },
    { at: 432, kind: 'failure', target: 'lifeSupport' },
    { at: 455, kind: 'meteor', count: 2 },
  ],
};
