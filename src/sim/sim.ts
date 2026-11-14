// Pure simulation: no three.js, no DOM, no imports. Advanced only by step() on a fixed tick.

export type ModuleType = 'habitat' | 'shelter' | 'solar' | 'battery' | 'lifeSupport' | 'tank' | 'greenhouse';
export type TaskId = 'o2gen' | 'water' | 'co2' | 'thermal' | 'solar' | 'greenhouse' | 'exercise' | 'medical' | 'radmon' | 'comms' | 'regolith' | 'supplies';
export type MiniType = 'sequence' | 'gauge' | 'wipe';
export type FailCause = 'air' | 'food' | 'radiation';
export type UpgradeKey = 'solar' | 'lifeSupport' | 'greenhouse' | 'battery' | 'tank' | 'station' | 'engineering';
export type GoalKind = 'airStreak' | 'powerStreak' | 'healthStreak' | 'tasks' | 'upgrades' | 'radiationUnder';

export interface Reward { power?: number; air?: number; food?: number; health?: number; radiation?: number; parts?: number; research?: number }

export interface ModuleDef {
  cost: number; // parts; 0 = not buildable
  radius: number;
  power: number; // per second while working (negative = draw)
  air: number;
  food: number;
  powerCap: number; // storage added
  airCap: number;
}

export interface TaskDef {
  id: TaskId;
  at: ModuleType | 'rockPile';
  mini: MiniType;
  seconds: number; // how long a crew member works on it
  reward: Reward;
  why: string | null; // key into facts.json, only where a NASA page was verified
  player: boolean; // appears as a job for the player
}

export interface UpgradeDef { costs: number[]; mult: number[] } // level 2 and 3 costs; value per level 1, 2, 3
export interface GoalDef { id: string; kind: GoalKind; target: number }

export interface StormInfo {
  event: number; // which bundled DONKI event this storm comes from
  kp: number; kpUrl: string; kpId: string; flareUrl: string; cmeUrl: string;
  flareId: string; flareClass: string; flareTimeUtc: string;
  cmeId: string; cmeTimeUtc: string; cmeSpeedKmS: number | null; cmeAt: number;
  sepId: string; sepTimeUtc: string; sepInstrument: string; sepUrl: string;
}

export interface StormDef {
  info: StormInfo;
  warnAt: number;
  startAt: number;
  duration: number;
  radiation: number; // dose per second if the whole team is outside
  solarFactor: number;
  surgeBreaks: number;
}

export interface TimedEvent { at: number; kind: 'failure' | 'meteor'; target?: ModuleType; count?: number }

export interface LevelConfig {
  id: string;
  tickHz: number;
  seed: number;
  crewNames: string[];
  missionLength: number;
  solLength: number;
  start: { power: number; air: number; food: number; parts: number; health: number; research: number };
  baseCap: { power: number; air: number; food: number };
  airPerPerson: number;
  foodPerPerson: number;
  basePowerDraw: number;
  baselineRadiation: number;
  playerDoseWeight: number;
  healthDecay: number; // per second
  jobGap: [number, number]; // min and max seconds between new jobs
  maxJobs: number;
  buildRadius: number;
  wearAfter: number;
  wearPerSecond: number;
  crewRewardShare: number; // crew get this share of a task's reward
  modules: Record<ModuleType, ModuleDef>;
  tasks: TaskDef[];
  upgrades: Record<UpgradeKey, UpgradeDef>;
  autoRepairSeconds: number; // at engineering Mk3
  goals: GoalDef[];
  startModules: { type: ModuleType; x: number; z: number }[];
  rockPile: { x: number; z: number; radius: number };
  storms: StormDef[];
  events: TimedEvent[];
  // Optional: other planets reuse the same engine
  planet?: 'moon' | 'mars';
  dustStorms?: DustStorm[];
  dustRate?: number; // multiplier for how fast dust settles on the panels
  commsDelay?: number; // game seconds for a message to cross the radio link (a game-friendly scaling of a real delay)
  gravity?: number;
}

// Plants in the greenhouse grow through visible stages: 0 empty, 1 seed, 2 sprout, 3 leafy, 4 ripe.
// The crops are a game choice (lettuce and tomato), not a claim about what the station grows.
export interface Plant { stage: 0 | 1 | 2 | 3 | 4; growth: number; water: number; kind: 'lettuce' | 'tomato' }
export const PLANT_AT = [0, 20, 55, 100]; // growth seconds needed to reach stage 2, 3 and 4 (tomato takes 1.5x longer)
export const HARVEST_FOOD = 4;

// Mission Control's daily power budget: shares of the day's power (they always add up to 100, so no choice is free).
// These effects are a game simplification, not a model of a real station.
export interface Budget { life: number; shield: number; comms: number; science: number }
export const BASE_BUDGET: Budget = { life: 35, shield: 25, comms: 15, science: 25 };
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Day 1 is a practice day: nothing in the budget can go badly wrong.
const gentle = (s: { day?: number }, x: number) => (s.day === 0 ? Math.max(x, 0.85) : x);
export const lifeF = (s: { budget: Budget; day?: number }) => gentle(s, clampN(s.budget.life / BASE_BUDGET.life, 0.35, 1.6));
export const shieldF = (s: { budget: Budget; shieldBonus: number; day?: number }) => gentle(s, clampN((s.budget.shield / BASE_BUDGET.shield) * (1 + s.shieldBonus), 0.35, 1.8));
export const commsF = (s: { budget: Budget; day?: number }) => gentle(s, clampN(s.budget.comms / BASE_BUDGET.comms, 0.35, 1.5));
// How much radiation still reaches someone inside the shelter when the shielding systems are underpowered.
export const shelterLeak = (s: { budget: Budget; shieldBonus: number; day?: number }) => Math.max(0, 1 - Math.min(1, 0.45 + 0.55 * shieldF(s)));

export interface DaySnap { time: number; power: number; air: number; food: number; health: number; radiation: number; research: number }
export interface DayReport { day: number; start: DaySnap; end: DaySnap; budget: Budget; storm: boolean; dust: boolean }
export interface Effects { air?: number; power?: number; food?: number; health?: number; radiation?: number; parts?: number; research?: number; dust?: number; shieldBonus?: number }

export interface DustStorm { at: number; duration: number; solarFactor: number }

export interface SimModule { id: number; type: ModuleType; x: number; z: number; broken: boolean; brokenFor: number }
export interface SimJob { id: number; task: TaskId; moduleId: number | null }

export interface SimCrew {
  name: string;
  chore: TaskId | null;
  working: boolean;
  sheltered: boolean;
  choreLeft: number;
}

export type SimEvent =
  | { type: 'broke'; id: number; reason: 'failure' | 'meteor' | 'surge' | 'wear' }
  | { type: 'stormWarn'; index: number }
  | { type: 'stormStart'; index: number }
  | { type: 'stormEnd'; index: number }
  | { type: 'meteor' }
  | { type: 'job'; id: number }
  | { type: 'choreDone'; crew: number; task: TaskId }
  | { type: 'upgrade'; key: UpgradeKey; level: number }
  | { type: 'autoRepair'; id: number }
  | { type: 'goal'; id: string }
  | { type: 'dayStart'; day: number }
  | { type: 'dustStart' }
  | { type: 'dustEnd' }
  | { type: 'end' };

export interface SimState {
  time: number;
  power: number;
  air: number;
  food: number;
  parts: number;
  health: number; // team health 0..100
  research: number;
  radiation: number;
  modules: SimModule[];
  crew: SimCrew[];
  shelterCall: boolean;
  playerExposure: number; // 1 outside, 0 inside the shelter, in between for thin walls
  jobs: SimJob[];
  nextJobAt: number;
  levels: Record<UpgradeKey, number>;
  dust: number; // 0..1 dust on the solar panels: cuts their output until someone cleans them
  budget: Budget;
  shieldBonus: number; // extra shielding earned from decisions
  day: number; // 0-based game day
  dayStart: DaySnap;
  lastDay: DayReport | null;
  stormToday: boolean;
  dustToday: boolean;
  dustActive: boolean;
  lampOn: boolean; // greenhouse grow lamp
  plants: Plant[];
  storm: { index: number; phase: 'warning' | 'active' } | null;
  stormIndex: number;
  eventIndex: number;
  status: 'running' | 'won' | 'lost';
  failCause: FailCause | null;
  streak: { air: number; power: number; health: number };
  best: { air: number; power: number; health: number };
  goalsDone: string[];
  stats: { lifeSupportDownS: number; greenhouseDownS: number; powerOutS: number; exposedS: number; fixes: number; builds: number; jobs: number; crewTasks: number; upgrades: number };
  history: number[][];
  outbox: SimEvent[];
  nextId: number;
  rng: number;
  sampleAt: number;
}

export function createSim(cfg: LevelConfig): SimState {
  const s: SimState = {
    time: 0,
    power: cfg.start.power, air: cfg.start.air, food: cfg.start.food, parts: cfg.start.parts,
    health: cfg.start.health, research: cfg.start.research, radiation: 0,
    modules: [],
    crew: cfg.crewNames.map((name) => ({ name, chore: null, working: false, sheltered: false, choreLeft: 0 })),
    shelterCall: false, playerExposure: 1, jobs: [], nextJobAt: 0,
    dust: 0.1, lampOn: true,
    budget: { ...BASE_BUDGET }, shieldBonus: 0, day: 0, lastDay: null, stormToday: false, dustToday: false, dustActive: false,
    dayStart: { time: 0, power: cfg.start.power, air: cfg.start.air, food: cfg.start.food, health: cfg.start.health, radiation: 0, research: cfg.start.research },
    plants: [{ stage: 2, growth: 30, water: 0.6, kind: 'lettuce' }, { stage: 0, growth: 0, water: 0, kind: 'tomato' }, { stage: 0, growth: 0, water: 0, kind: 'lettuce' }],
    levels: { solar: 1, lifeSupport: 1, greenhouse: 1, battery: 1, tank: 1, station: 1, engineering: 1 },
    storm: null, stormIndex: 0, eventIndex: 0,
    status: 'running', failCause: null,
    streak: { air: 0, power: 0, health: 0 }, best: { air: 0, power: 0, health: 0 }, goalsDone: [],
    stats: { lifeSupportDownS: 0, greenhouseDownS: 0, powerOutS: 0, exposedS: 0, fixes: 0, builds: 0, jobs: 0, crewTasks: 0, upgrades: 0 },
    history: [], outbox: [], nextId: 1, rng: cfg.seed >>> 0, sampleAt: 0,
  };
  for (const m of cfg.startModules) s.modules.push({ id: s.nextId++, type: m.type, x: m.x, z: m.z, broken: false, brokenFor: 0 });
  s.nextJobAt = 6; // something to do almost immediately
  return s;
}

function rand(s: SimState): number {
  // mulberry32
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const taskDef = (cfg: LevelConfig, id: TaskId): TaskDef => cfg.tasks.find((t) => t.id === id)!;

// Upgrade effect for a key at the current level.
export const upgradeValue = (s: SimState, cfg: LevelConfig, key: UpgradeKey): number => cfg.upgrades[key].mult[s.levels[key] - 1];

export function caps(s: SimState, cfg: LevelConfig): { power: number; air: number; food: number } {
  let power = cfg.baseCap.power, air = cfg.baseCap.air;
  for (const m of s.modules) {
    power += cfg.modules[m.type].powerCap + (m.type === 'battery' ? upgradeValue(s, cfg, 'battery') : 0);
    air += cfg.modules[m.type].airCap + (m.type === 'tank' ? upgradeValue(s, cfg, 'tank') : 0);
  }
  return { power, air, food: cfg.baseCap.food };
}

// How long hands-on tasks take, as a multiplier (engineering upgrades make them faster).
export const taskSpeed = (s: SimState, cfg: LevelConfig): number => upgradeValue(s, cfg, 'engineering');
// Share of a storm's radiation that reaches someone inside the station (the shelter always blocks it all).
export const stationExposure = (s: SimState, cfg: LevelConfig): number => upgradeValue(s, cfg, 'station');

export function canPlace(s: SimState, cfg: LevelConfig, type: ModuleType, x: number, z: number): boolean {
  if (Math.hypot(x, z) > cfg.buildRadius) return false;
  const r = cfg.modules[type].radius;
  if (Math.hypot(x - cfg.rockPile.x, z - cfg.rockPile.z) < r + cfg.rockPile.radius + 1) return false;
  for (const m of s.modules) {
    if (Math.hypot(x - m.x, z - m.z) < r + cfg.modules[m.type].radius + 1) return false;
  }
  return true;
}

export function build(s: SimState, cfg: LevelConfig, type: ModuleType, x: number, z: number): SimModule | null {
  const def = cfg.modules[type];
  if (def.cost <= 0 || s.parts < def.cost || !canPlace(s, cfg, type, x, z)) return null;
  s.parts -= def.cost;
  s.stats.builds++;
  const m: SimModule = { id: s.nextId++, type, x, z, broken: false, brokenFor: 0 };
  s.modules.push(m);
  return m;
}

export function fix(s: SimState, id: number): boolean {
  const m = s.modules.find((mod) => mod.id === id);
  if (!m || !m.broken) return false;
  m.broken = false; m.brokenFor = 0;
  s.stats.fixes++;
  return true;
}

function applyReward(s: SimState, cfg: LevelConfig, r: Reward, k: number): void {
  const cap = caps(s, cfg);
  s.power = Math.min(cap.power, s.power + (r.power ?? 0) * k);
  s.air = Math.min(cap.air, s.air + (r.air ?? 0) * k);
  s.food = Math.min(cap.food, s.food + (r.food ?? 0) * k);
  s.health = Math.max(0, Math.min(100, s.health + (r.health ?? 0) * k));
  s.radiation = Math.max(0, s.radiation + (r.radiation ?? 0) * k);
  s.parts += Math.round((r.parts ?? 0) * k);
  s.research += Math.round((r.research ?? 0) * k);
}

// Something in the greenhouse needs the player: an empty pot, a thirsty plant, a ripe one or a dead lamp.
export function needsGreenhouse(s: SimState): boolean {
  return !s.lampOn || s.plants.some((p) => p.stage === 0 || p.stage === 4 || (p.stage > 0 && p.water < 0.35));
}

export function harvestPlant(s: SimState, cfg: LevelConfig, i: number): boolean {
  const p = s.plants[i];
  if (!p || p.stage !== 4) return false;
  s.food = Math.min(caps(s, cfg).food, s.food + HARVEST_FOOD);
  s.research += 1;
  p.stage = 0; p.growth = 0; p.water = 0;
  return true;
}

// A crew member tending the greenhouse: lamp on, water everything, harvest ripe plants, plant empty pots.
export function tendGreenhouse(s: SimState, cfg: LevelConfig): void {
  s.lampOn = true;
  s.plants.forEach((p, i) => {
    if (p.stage === 4) harvestPlant(s, cfg, i);
    if (p.stage === 0) { p.stage = 1; p.growth = 0; p.water = 0.9; } else p.water = Math.min(1, p.water + 0.6);
  });
}

export function completeJob(s: SimState, cfg: LevelConfig, jobId: number): boolean {
  const i = s.jobs.findIndex((j) => j.id === jobId);
  if (i < 0) return false;
  applyReward(s, cfg, taskDef(cfg, s.jobs[i].task).reward, 1);
  if (s.jobs[i].task === 'solar') s.dust = 0;
  s.jobs.splice(i, 1);
  s.stats.jobs++;
  return true;
}

// Tasks a crew member can be given right now (the machine for it exists).
export function crewOptions(s: SimState, cfg: LevelConfig): TaskDef[] {
  return cfg.tasks.filter((t) => t.at === 'rockPile' || s.modules.some((m) => m.type === t.at && !m.broken));
}

export function assign(s: SimState, cfg: LevelConfig, crewIndex: number, task: TaskId | null): void {
  const c = s.crew[crewIndex];
  if (!c) return;
  c.chore = task; c.working = false;
  c.choreLeft = task ? taskDef(cfg, task).seconds / taskSpeed(s, cfg) : 0;
}

export function upgradeCost(s: SimState, cfg: LevelConfig, key: UpgradeKey): number | null {
  const lvl = s.levels[key];
  return lvl >= 3 ? null : cfg.upgrades[key].costs[lvl - 1];
}

export function upgrade(s: SimState, cfg: LevelConfig, key: UpgradeKey): boolean {
  const cost = upgradeCost(s, cfg, key);
  if (cost === null || s.research < cost) return false;
  s.research -= cost;
  s.levels[key]++;
  s.stats.upgrades++;
  s.outbox.push({ type: 'upgrade', key, level: s.levels[key] });
  return true;
}

export function setShelter(s: SimState, on: boolean): void {
  s.shelterCall = on;
  if (!on) for (const c of s.crew) c.sheltered = false;
}

function breakModule(s: SimState, m: SimModule, reason: 'failure' | 'meteor' | 'surge' | 'wear'): void {
  if (m.broken) return;
  m.broken = true; m.brokenFor = 0;
  s.outbox.push({ type: 'broke', id: m.id, reason });
}

const isBuilding = (m: SimModule) => m.type === 'habitat' || m.type === 'shelter';

function breakRandom(s: SimState, count: number, reason: 'meteor' | 'surge', prefer?: ModuleType): void {
  for (let i = 0; i < count; i++) {
    let pool = s.modules.filter((m) => !m.broken && !isBuilding(m) && (!prefer || m.type === prefer));
    if (pool.length === 0) pool = s.modules.filter((m) => !m.broken && !isBuilding(m));
    if (pool.length === 0) return;
    breakModule(s, pool[Math.floor(rand(s) * pool.length)], reason);
  }
}

export function goalProgress(s: SimState, _cfg: LevelConfig, g: GoalDef): number {
  switch (g.kind) {
    case 'airStreak': return Math.max(s.best.air, s.streak.air);
    case 'powerStreak': return Math.max(s.best.power, s.streak.power);
    case 'healthStreak': return Math.max(s.best.health, s.streak.health);
    case 'tasks': return s.stats.jobs + s.stats.crewTasks;
    case 'upgrades': return s.stats.upgrades;
    case 'radiationUnder': return s.status === 'won' && s.radiation < g.target ? g.target : 0;
  }
}

// When Mission Control tells the crew about a storm: less power for communications means a later warning (a shorter countdown).
export function warnTime(s: SimState, cfg: LevelConfig, i: number): number {
  const d = cfg.storms[i];
  const lead = Math.max(20, (d.startAt - d.warnAt) * commsF(s));
  return d.startAt - lead;
}

const snap = (s: SimState): DaySnap => ({ time: s.time, power: s.power, air: s.air, food: s.food, health: s.health, radiation: s.radiation, research: s.research });

// Applies the effects of a decision card. Both options always cost something.
export function applyEffects(s: SimState, cfg: LevelConfig, e: Effects): void {
  applyReward(s, cfg, { air: e.air, power: e.power, food: e.food, health: e.health, radiation: e.radiation, parts: e.parts, research: e.research }, 1);
  if (e.dust !== undefined) s.dust = clampN(s.dust + e.dust, 0, 1);
  if (e.shieldBonus) s.shieldBonus += e.shieldBonus;
}

// How much power the sun is giving right now, in the units shown on the dashboard.
export function powerToday(s: SimState, cfg: LevelConfig): number {
  let p = 0;
  for (const m of s.modules) if (m.type === 'solar' && !m.broken) p += cfg.modules.solar.power * upgradeValue(s, cfg, 'solar') * (1 - 0.4 * s.dust);
  const ds = cfg.dustStorms?.find((d) => s.time >= d.at && s.time < d.at + d.duration);
  return Math.round(p * (ds ? ds.solarFactor : 1) * 100) / 10;
}

function endDay(s: SimState, cfg: LevelConfig): void {
  s.research += Math.round(s.budget.science / 10); // science share turns into research points
  s.lastDay = { day: s.day + 1, start: s.dayStart, end: snap(s), budget: { ...s.budget }, storm: s.stormToday, dust: s.dustToday };
  s.dayStart = snap(s); s.stormToday = false; s.dustToday = false;
  void cfg;
}

export function step(s: SimState, cfg: LevelConfig, dt: number): void {
  if (s.status !== 'running') return;
  s.time += dt;
  const dayNow = Math.floor(s.time / cfg.solLength);
  if (dayNow > s.day) { endDay(s, cfg); s.day = dayNow; s.outbox.push({ type: 'dayStart', day: dayNow }); }
  if (s.storm) s.stormToday = true;
  // Dust storms (Mars): the sun is dimmer and dust piles up faster
  const ds = cfg.dustStorms?.find((d) => s.time >= d.at && s.time < d.at + d.duration);
  if (ds && !s.dustActive) { s.dustActive = true; s.outbox.push({ type: 'dustStart' }); }
  if (!ds && s.dustActive) { s.dustActive = false; s.outbox.push({ type: 'dustEnd' }); }
  if (ds) s.dustToday = true;

  // Storm schedule
  if (!s.storm && s.stormIndex < cfg.storms.length && s.time >= warnTime(s, cfg, s.stormIndex)) {
    s.storm = { index: s.stormIndex, phase: 'warning' };
    s.outbox.push({ type: 'stormWarn', index: s.stormIndex });
  }
  if (s.storm) {
    const d = cfg.storms[s.storm.index];
    if (s.storm.phase === 'warning' && s.time >= d.startAt) {
      s.storm.phase = 'active';
      s.shelterCall = true; // anyone still outside runs for the shelter
      s.outbox.push({ type: 'stormStart', index: s.storm.index });
      // Something useful to do while waiting inside the shelter
      if (s.modules.some((m) => m.type === 'shelter')) {
        for (const id of ['radmon', 'supplies'] as TaskId[]) {
          const m = s.modules.find((mod) => mod.type === 'shelter')!;
          if (!s.jobs.some((j) => j.task === id)) { const job: SimJob = { id: s.nextId++, task: id, moduleId: m.id }; s.jobs.push(job); s.outbox.push({ type: 'job', id: job.id }); }
        }
      }
    } else if (s.storm.phase === 'active' && s.time >= d.startAt + d.duration) {
      breakRandom(s, d.surgeBreaks, 'surge', 'solar');
      s.outbox.push({ type: 'stormEnd', index: s.storm.index });
      setShelter(s, false); // all clear
      s.storm = null;
      s.stormIndex++;
    }
  }

  // Scripted game events (not NASA data)
  while (s.eventIndex < cfg.events.length && s.time >= cfg.events[s.eventIndex].at) {
    const e = cfg.events[s.eventIndex++];
    if (e.kind === 'failure') {
      const m = s.modules.find((mod) => mod.type === e.target && !mod.broken);
      if (m) breakModule(s, m, 'failure');
    } else {
      s.outbox.push({ type: 'meteor' });
      breakRandom(s, e.count ?? 1, 'meteor');
    }
  }

  // Random wear, capped so the player is never swamped
  if (s.time > cfg.wearAfter && !s.storm && s.modules.filter((m) => m.broken).length < 2) {
    for (const m of s.modules) {
      if (!isBuilding(m) && !m.broken && rand(s) < cfg.wearPerSecond * dt) { breakModule(s, m, 'wear'); break; }
    }
  }

  // Engineering Mk3: machines repair themselves if the player is slow
  for (const m of s.modules) {
    if (!m.broken) continue;
    m.brokenFor += dt;
    if (s.levels.engineering >= 3 && m.brokenFor >= cfg.autoRepairSeconds) {
      m.broken = false; m.brokenFor = 0;
      s.outbox.push({ type: 'autoRepair', id: m.id });
    }
  }

  // New hands-on jobs for the player, one every 45-75 s, never during a storm
  if (s.time >= s.nextJobAt) {
    s.nextJobAt = s.time + cfg.jobGap[0] + rand(s) * (cfg.jobGap[1] - cfg.jobGap[0]);
    const pool = cfg.tasks.filter((t) => t.player && t.at !== 'rockPile'
      && (t.id !== 'solar' || s.dust > 0.25) && (t.id !== 'greenhouse' || needsGreenhouse(s))
      && s.modules.some((m) => m.type === t.at && !m.broken) && !s.jobs.some((j) => j.task === t.id));
    if (!s.storm && s.jobs.length < cfg.maxJobs && pool.length > 0) {
      const def = pool[Math.floor(rand(s) * pool.length)];
      const m = s.modules.find((mod) => mod.type === def.at && !mod.broken)!;
      const job: SimJob = { id: s.nextId++, task: def.id, moduleId: m.id };
      s.jobs.push(job);
      s.outbox.push({ type: 'job', id: job.id });
    }
  }

  // Dust settles on the panels; plants grow when the greenhouse has power, a working lamp and water
  s.dust = Math.min(1, s.dust + 0.0012 * (cfg.dustRate ?? 1) * (ds ? 3 : 1) * dt);
  const gh = s.modules.some((m) => m.type === 'greenhouse' && !m.broken);
  if (gh && s.lampOn && s.power > 0) {
    for (const p of s.plants) {
      if (p.stage < 1 || p.stage > 3) continue;
      p.water = Math.max(0, p.water - 0.004 * dt);
      if (p.water < 0.12) continue; // thirsty plants stop growing
      p.growth += dt / (p.kind === 'tomato' ? 1.5 : 1);
      p.stage = (p.growth >= PLANT_AT[3] ? 4 : p.growth >= PLANT_AT[2] ? 3 : p.growth >= PLANT_AT[1] ? 2 : 1) as Plant['stage'];
    }
  }
  if (s.lampOn && s.time > cfg.wearAfter && !s.storm && rand(s) < 0.0006 * dt) s.lampOn = false;

  // Production
  const stormActive = s.storm?.phase === 'active';
  const solarFactor = (stormActive ? cfg.storms[s.storm!.index].solarFactor : 1) * (ds ? ds.solarFactor : 1);
  const hasPower = s.power > 0;
  let dPower = -cfg.basePowerDraw, dAir = 0, dFood = 0;
  let lifeSupportUp = false, greenhouseUp = false;
  for (const m of s.modules) {
    if (m.broken) continue;
    const def = cfg.modules[m.type];
    if (m.type === 'solar') { dPower += def.power * upgradeValue(s, cfg, 'solar') * solarFactor * (1 - 0.4 * s.dust); continue; }
    if (def.power < 0 && !hasPower) continue; // powered modules stop when the batteries are empty
    dPower += def.power;
    if (m.type === 'lifeSupport') { dAir += def.air * upgradeValue(s, cfg, 'lifeSupport') * lifeF(s); lifeSupportUp = true; }
    else if (m.type === 'greenhouse') { dAir += def.air; dFood += def.food * upgradeValue(s, cfg, 'greenhouse'); greenhouseUp = true; }
    else { dAir += def.air; dFood += def.food; }
  }

  // Crew tasks: crew work for the task's full time (stretched when the team is unwell), then the reward lands
  const tired = s.health < 40 ? 1.4 : 1;
  s.crew.forEach((c, crewIndex) => {
    if (!c.chore || !c.working || c.sheltered) return;
    c.choreLeft -= dt / tired;
    if (c.choreLeft > 0) return;
    const def = taskDef(cfg, c.chore);
    applyReward(s, cfg, def.reward, cfg.crewRewardShare);
    if (def.id === 'solar') s.dust = 0;
    if (def.id === 'greenhouse') tendGreenhouse(s, cfg);
    s.stats.crewTasks++;
    s.outbox.push({ type: 'choreDone', crew: crewIndex, task: def.id });
    c.chore = null; c.working = false; c.choreLeft = 0;
  });

  const people = 1 + s.crew.length;
  dAir -= cfg.airPerPerson * people;
  dFood -= cfg.foodPerPerson * people;

  const cap = caps(s, cfg);
  s.power = Math.max(0, Math.min(cap.power, s.power + dPower * dt));
  s.air = Math.max(0, Math.min(cap.air, s.air + dAir * dt));
  s.food = Math.max(0, Math.min(cap.food, s.food + dFood * dt));
  s.health = Math.max(0, s.health - cfg.healthDecay * dt);

  if (!lifeSupportUp) s.stats.lifeSupportDownS += dt;
  if (!greenhouseUp) s.stats.greenhouseDownS += dt;
  if (s.power <= 0) s.stats.powerOutS += dt;

  // Streaks for the mission goals
  const keep = (key: 'air' | 'power' | 'health', ok: boolean) => {
    if (ok) s.streak[key] += dt;
    else { s.best[key] = Math.max(s.best[key], s.streak[key]); s.streak[key] = 0; }
  };
  keep('air', s.air >= cap.air * 0.5);
  keep('power', s.power > 0);
  keep('health', s.health >= 50);

  // Radiation reaches people who are outside: a tiny everyday dose, and a large one during a storm
  const crewOutside = s.crew.length ? s.crew.filter((c) => !c.sheltered).length / s.crew.length : 0;
  const crewInside = s.crew.length ? 1 - crewOutside : 0;
  const share = cfg.playerDoseWeight * s.playerExposure + (1 - cfg.playerDoseWeight) * (crewOutside + crewInside * shelterLeak(s));
  const rate = cfg.baselineRadiation + (stormActive ? cfg.storms[s.storm!.index].radiation : 0);
  s.radiation = Math.min(100, s.radiation + rate * share * dt);
  if (stormActive) s.stats.exposedS += share * dt;

  if (s.time >= s.sampleAt) {
    s.sampleAt += 2;
    s.history.push([s.time, (s.power / cap.power) * 100, (s.air / cap.air) * 100, (s.food / cap.food) * 100, s.radiation]);
  }

  if (s.air <= 0) end(s, 'air');
  else if (s.food <= 0) end(s, 'food');
  else if (s.radiation >= 100) end(s, 'radiation');
  else if (s.time >= cfg.missionLength) end(s, null);

  for (const g of cfg.goals) {
    if (!s.goalsDone.includes(g.id) && goalProgress(s, cfg, g) >= g.target) { s.goalsDone.push(g.id); s.outbox.push({ type: 'goal', id: g.id }); }
  }
}

function end(s: SimState, cause: FailCause | null): void {
  s.status = cause ? 'lost' : 'won';
  s.failCause = cause;
  s.outbox.push({ type: 'end' });
}

// 1 star for surviving, plus one for each two mission goals completed (up to 3 stars).
export function stars(s: SimState): number {
  if (s.status !== 'won') return 0;
  return Math.min(3, 1 + Math.floor(s.goalsDone.length / 2));
}
