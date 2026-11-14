// Pure simulation: no three.js, no DOM. Advanced only by step() on a fixed tick.

export type ResourceId = 'power' | 'air' | 'food';

export interface LevelConfig {
  id: string;
  tickHz: number;
  crew: number;
  resources: Record<ResourceId, { start: number; cap: number }>;
  solarPower: number;
  basePowerDraw: number;
  lifeSupportPower: number;
  lifeSupportAir: number;
  airPerCrew: number;
  foodPerCrew: number;
  radiationDecay: number;
}

export interface SimState {
  time: number; // seconds of sim time
  power: number;
  air: number;
  food: number;
  radiation: number; // 0..100 crew dose, raised by events
  radiationRate: number; // set by events (solar storm), 0 normally
}

export function createSim(cfg: LevelConfig): SimState {
  return {
    time: 0,
    power: cfg.resources.power.start,
    air: cfg.resources.air.start,
    food: cfg.resources.food.start,
    radiation: 0,
    radiationRate: 0,
  };
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

export function step(s: SimState, cfg: LevelConfig, dt: number): void {
  s.time += dt;
  const r = cfg.resources;

  // Life support only runs while there is power, so a power loss turns into an air problem.
  const lifeSupportOn = s.power > 0;
  const powerDelta = cfg.solarPower - cfg.basePowerDraw - (lifeSupportOn ? cfg.lifeSupportPower : 0);
  s.power = clamp(s.power + powerDelta * dt, r.power.cap);

  const airDelta = (lifeSupportOn ? cfg.lifeSupportAir : 0) - cfg.airPerCrew * cfg.crew;
  s.air = clamp(s.air + airDelta * dt, r.air.cap);

  s.food = clamp(s.food - cfg.foodPerCrew * cfg.crew * dt, r.food.cap);

  const radDelta = s.radiationRate > 0 ? s.radiationRate : -cfg.radiationDecay;
  s.radiation = clamp(s.radiation + radDelta * dt, 100);
}
