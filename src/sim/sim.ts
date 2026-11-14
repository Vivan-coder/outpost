// Pure simulation: no three.js, no DOM, no imports. Advanced only by step() on a fixed tick.

export type ModuleType = 'habitat' | 'shelter' | 'solar' | 'battery' | 'lifeSupport' | 'tank' | 'greenhouse';
export type ChoreId = 'tomatoes' | 'panels' | 'rocks' | 'filters';
export type FailCause = 'air' | 'food' | 'radiation';
export type JobKind = 'clean' | 'water' | 'refill';
export interface SimJob { id: number; kind: JobKind; moduleId: number }

export interface ModuleDef {
  cost: number; // parts; 0 = not buildable
  radius: number;
  power: number; // per second while working (negative = draw)
  air: number;
  food: number;
  powerCap: number; // storage added
  airCap: number;
}

export interface ChoreDef {
  id: ChoreId;
  at: ModuleType | 'rockPile';
  power: number;
  air: number;
  food: number;
  partsEvery: number; // seconds per part, 0 = none
}

// Real-record labels carried along for the HUD and info cards. The sim itself never reads them.
export interface StormInfo {
  flareId: string; flareClass: string; flareTimeUtc: string;
  cmeId: string; cmeTimeUtc: string; cmeSpeedKmS: number | null; cmeAt: number; // cmeAt is game time
  sepId: string; sepTimeUtc: string; sepInstrument: string; sepUrl: string;
}

export interface StormDef {
  info: StormInfo;
  warnAt: number;
  startAt: number;
  duration: number;
  radiation: number; // dose per second if the whole team is outside
  solarFactor: number; // solar output multiplier during the storm
  surgeBreaks: number; // modules knocked out when it ends
}

export interface TimedEvent { at: number; kind: 'failure' | 'meteor'; target?: ModuleType; count?: number }

export interface LevelConfig {
  id: string;
  tickHz: number;
  seed: number;
  crewNames: string[];
  missionLength: number; // seconds
  solLength: number; // seconds per in-game "sol" shown on the HUD
  start: { power: number; air: number; food: number; parts: number };
  baseCap: { power: number; air: number; food: number };
  airPerPerson: number;
  foodPerPerson: number;
  basePowerDraw: number;
  baselineRadiation: number; // dose per second outside on a quiet day
  playerDoseWeight: number; // share of the team dose that is the player's own suit
  choreDuration: number; // seconds of work before a crew member goes back to their routine
  jobEvery: number; // seconds between new hands-on jobs for the player
  maxJobs: number;
  jobRewards: Record<JobKind, { power: number; air: number; food: number }>;
  buildRadius: number;
  wearAfter: number; // no random breakdowns before this time
  wearPerSecond: number; // chance per module per second
  modules: Record<ModuleType, ModuleDef>;
  chores: ChoreDef[];
  startModules: { type: ModuleType; x: number; z: number }[];
  rockPile: { x: number; z: number; radius: number };
  storms: StormDef[];
  events: TimedEvent[];
}

export interface SimModule { id: number; type: ModuleType; x: number; z: number; broken: boolean }

export interface SimCrew {
  name: string;
  chore: ChoreId | null;
  working: boolean; // set by the game layer once the crew member is at the work spot
  sheltered: boolean; // set by the game layer once inside the shelter
  choreLeft: number; // seconds of work left on the current chore
}

export type SimEvent =
  | { type: 'broke'; id: number; reason: 'failure' | 'meteor' | 'surge' | 'wear' }
  | { type: 'stormWarn'; index: number }
  | { type: 'stormStart'; index: number }
  | { type: 'stormEnd'; index: number }
  | { type: 'meteor' }
  | { type: 'part' }
  | { type: 'job'; id: number }
  | { type: 'choreDone'; crew: number; chore: ChoreId }
  | { type: 'end' };

export interface SimState {
  time: number;
  power: number;
  air: number;
  food: number;
  parts: number;
  radiation: number; // 0..100 team dose, never goes down during a mission
  modules: SimModule[];
  crew: SimCrew[];
  shelterCall: boolean;
  playerExposure: number; // 1 outside, 0 inside the shelter, in between for thin walls
  jobs: SimJob[];
  nextJobAt: number;
  storm: { index: number; phase: 'warning' | 'active' } | null;
  stormIndex: number;
  eventIndex: number;
  status: 'running' | 'won' | 'lost';
  failCause: FailCause | null;
  stats: { lifeSupportDownS: number; greenhouseDownS: number; powerOutS: number; exposedS: number; fixes: number; builds: number; jobs: number };
  history: number[][]; // [time, power%, air%, food%, radiation]
  outbox: SimEvent[];
  nextId: number;
  rng: number;
  rockProgress: number;
  sampleAt: number;
}

export function createSim(cfg: LevelConfig): SimState {
  const s: SimState = {
    time: 0,
    power: cfg.start.power, air: cfg.start.air, food: cfg.start.food, parts: cfg.start.parts,
    radiation: 0,
    modules: [],
    crew: cfg.crewNames.map((name) => ({ name, chore: null, working: false, sheltered: false, choreLeft: 0 })),
    shelterCall: false, playerExposure: 1, jobs: [], nextJobAt: cfg.jobEvery,
    storm: null, stormIndex: 0, eventIndex: 0,
    status: 'running', failCause: null,
    stats: { lifeSupportDownS: 0, greenhouseDownS: 0, powerOutS: 0, exposedS: 0, fixes: 0, builds: 0, jobs: 0 },
    history: [], outbox: [], nextId: 1, rng: cfg.seed >>> 0, rockProgress: 0, sampleAt: 0,
  };
  for (const m of cfg.startModules) s.modules.push({ id: s.nextId++, type: m.type, x: m.x, z: m.z, broken: false });
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

export function caps(s: SimState, cfg: LevelConfig): { power: number; air: number; food: number } {
  let power = cfg.baseCap.power, air = cfg.baseCap.air;
  for (const m of s.modules) { power += cfg.modules[m.type].powerCap; air += cfg.modules[m.type].airCap; }
  return { power, air, food: cfg.baseCap.food };
}

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
  const m: SimModule = { id: s.nextId++, type, x, z, broken: false };
  s.modules.push(m);
  return m;
}

export function fix(s: SimState, id: number): boolean {
  const m = s.modules.find((mod) => mod.id === id);
  if (!m || !m.broken) return false;
  m.broken = false;
  s.stats.fixes++;
  return true;
}

export function completeJob(s: SimState, cfg: LevelConfig, jobId: number): boolean {
  const i = s.jobs.findIndex((j) => j.id === jobId);
  if (i < 0) return false;
  const r = cfg.jobRewards[s.jobs[i].kind];
  const cap = caps(s, cfg);
  s.power = Math.min(cap.power, s.power + r.power);
  s.air = Math.min(cap.air, s.air + r.air);
  s.food = Math.min(cap.food, s.food + r.food);
  s.jobs.splice(i, 1);
  s.stats.jobs++;
  return true;
}

export function assign(s: SimState, crewIndex: number, chore: ChoreId | null): void {
  const c = s.crew[crewIndex];
  if (!c) return;
  c.chore = chore; c.working = false; c.choreLeft = chore ? Infinity : 0;
}

export function setShelter(s: SimState, on: boolean): void {
  s.shelterCall = on;
  if (!on) for (const c of s.crew) c.sheltered = false;
}

function breakModule(s: SimState, m: SimModule, reason: 'failure' | 'meteor' | 'surge' | 'wear'): void {
  if (m.broken) return;
  m.broken = true;
  s.outbox.push({ type: 'broke', id: m.id, reason });
}

function breakRandom(s: SimState, count: number, reason: 'meteor' | 'surge', prefer?: ModuleType): void {
  for (let i = 0; i < count; i++) {
    let pool = s.modules.filter((m) => !m.broken && m.type !== 'habitat' && m.type !== 'shelter' && (!prefer || m.type === prefer));
    if (pool.length === 0) pool = s.modules.filter((m) => !m.broken && m.type !== 'habitat' && m.type !== 'shelter');
    if (pool.length === 0) return;
    breakModule(s, pool[Math.floor(rand(s) * pool.length)], reason);
  }
}

export function step(s: SimState, cfg: LevelConfig, dt: number): void {
  if (s.status !== 'running') return;
  s.time += dt;

  // Storm schedule
  if (!s.storm && s.stormIndex < cfg.storms.length && s.time >= cfg.storms[s.stormIndex].warnAt) {
    s.storm = { index: s.stormIndex, phase: 'warning' };
    s.outbox.push({ type: 'stormWarn', index: s.stormIndex });
  }
  if (s.storm) {
    const d = cfg.storms[s.storm.index];
    if (s.storm.phase === 'warning' && s.time >= d.startAt) {
      s.storm.phase = 'active';
      s.shelterCall = true; // anyone still outside runs for the shelter
      s.outbox.push({ type: 'stormStart', index: s.storm.index });
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
  const fixed = (m: SimModule) => m.type === 'habitat' || m.type === 'shelter';
  if (s.time > cfg.wearAfter && !s.storm && s.modules.filter((m) => m.broken).length < 2) {
    for (const m of s.modules) {
      if (!fixed(m) && !m.broken && rand(s) < cfg.wearPerSecond * dt) { breakModule(s, m, 'wear'); break; }
    }
  }

  // Production
  const stormActive = s.storm?.phase === 'active';
  const solarFactor = stormActive ? cfg.storms[s.storm!.index].solarFactor : 1;
  const hasPower = s.power > 0;
  let dPower = -cfg.basePowerDraw, dAir = 0, dFood = 0;
  let lifeSupportUp = false, greenhouseUp = false;
  for (const m of s.modules) {
    if (m.broken) continue;
    const def = cfg.modules[m.type];
    if (m.type === 'solar') { dPower += def.power * solarFactor; continue; }
    if (def.power < 0 && !hasPower) continue; // powered modules stop when the batteries are empty
    dPower += def.power; dAir += def.air; dFood += def.food;
    if (m.type === 'lifeSupport') lifeSupportUp = true;
    if (m.type === 'greenhouse') greenhouseUp = true;
  }

  // New hands-on jobs for the player
  if (s.time >= s.nextJobAt) {
    s.nextJobAt += cfg.jobEvery;
    const kindOf: Partial<Record<ModuleType, JobKind>> = { solar: 'clean', greenhouse: 'water', lifeSupport: 'refill' };
    const pool = s.modules.filter((m) => kindOf[m.type] && !m.broken && !s.jobs.some((j) => j.moduleId === m.id));
    if (!s.storm && s.jobs.length < cfg.maxJobs && pool.length > 0) {
      const m = pool[Math.floor(rand(s) * pool.length)];
      const job: SimJob = { id: s.nextId++, kind: kindOf[m.type]!, moduleId: m.id };
      s.jobs.push(job);
      s.outbox.push({ type: 'job', id: job.id });
    }
  }

  // Crew chores: they pay out while the crew member is at the work spot, for a fixed stretch of work
  s.crew.forEach((c, crewIndex) => {
    if (!c.chore || !c.working || c.sheltered) return;
    const def = cfg.chores.find((ch) => ch.id === c.chore)!;
    if (c.choreLeft === Infinity) c.choreLeft = cfg.choreDuration;
    c.choreLeft -= dt;
    dPower += def.power * (def.id === 'panels' ? solarFactor : 1);
    dAir += def.air; dFood += def.food;
    if (def.partsEvery > 0) {
      s.rockProgress += dt / def.partsEvery;
      if (s.rockProgress >= 1) { s.rockProgress -= 1; s.parts++; s.outbox.push({ type: 'part' }); }
    }
    if (c.choreLeft <= 0) {
      s.outbox.push({ type: 'choreDone', crew: crewIndex, chore: c.chore });
      c.chore = null; c.working = false; c.choreLeft = 0;
    }
  });

  const people = 1 + s.crew.length;
  dAir -= cfg.airPerPerson * people;
  dFood -= cfg.foodPerPerson * people;

  const cap = caps(s, cfg);
  s.power = Math.max(0, Math.min(cap.power, s.power + dPower * dt));
  s.air = Math.max(0, Math.min(cap.air, s.air + dAir * dt));
  s.food = Math.max(0, Math.min(cap.food, s.food + dFood * dt));

  if (!lifeSupportUp) s.stats.lifeSupportDownS += dt;
  if (!greenhouseUp) s.stats.greenhouseDownS += dt;
  if (s.power <= 0) s.stats.powerOutS += dt;

  // Radiation reaches people who are outside: a tiny everyday dose, and a large one during a storm
  const crewOutside = s.crew.length ? s.crew.filter((c) => !c.sheltered).length / s.crew.length : 0;
  const share = cfg.playerDoseWeight * s.playerExposure + (1 - cfg.playerDoseWeight) * crewOutside;
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
}

function end(s: SimState, cause: FailCause | null): void {
  s.status = cause ? 'lost' : 'won';
  s.failCause = cause;
  s.outbox.push({ type: 'end' });
}

// 1 star for surviving, +1 for low radiation, +1 for healthy stores.
export function stars(s: SimState, cfg: LevelConfig): number {
  if (s.status !== 'won') return 0;
  const cap = caps(s, cfg);
  const lowest = Math.min(s.power / cap.power, s.air / cap.air, s.food / cap.food);
  return 1 + (s.radiation < 35 ? 1 : 0) + (lowest >= 0.4 ? 1 : 0);
}
