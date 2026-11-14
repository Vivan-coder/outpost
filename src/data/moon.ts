import type { LevelConfig } from '../sim/sim';

// All balance numbers are placeholders until the NASA dataset is chosen; real values get a source id here.
export const moon: LevelConfig = {
  id: 'moon',
  tickHz: 5,
  crew: 4, // player + Zaid, Mariam, Sam
  resources: {
    power: { start: 60, cap: 100 },
    air: { start: 80, cap: 100 }, // oxygen and water
    food: { start: 70, cap: 100 },
  },
  // Units per second.
  solarPower: 0.55,
  basePowerDraw: 0.35,
  lifeSupportPower: 0.15, // extra draw while life support runs
  lifeSupportAir: 0.2, // air made while life support has power
  airPerCrew: 0.055,
  foodPerCrew: 0.012,
  radiationDecay: 0.5,
};
