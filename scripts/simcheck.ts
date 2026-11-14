// Balance sanity check, run with: node scripts/simcheck.ts
import { createSim, step, fix, assign, build, canPlace, completeJob, upgrade, upgradeCost, stars, caps } from '../src/sim/sim.ts';
import type { SimState, TaskId, UpgradeKey } from '../src/sim/sim.ts';
import { moon } from '../src/data/moon.ts';

type Bot = (s: SimState, since: Map<number, number>) => void;

function run(name: string, bot: Bot): void {
  const s = createSim(moon);
  const dt = 1 / moon.tickHz;
  const since = new Map<number, number>();
  while (s.status === 'running') {
    for (const m of s.modules) { if (m.broken && !since.has(m.id)) since.set(m.id, s.time); if (!m.broken) since.delete(m.id); }
    for (const j of s.jobs) if (!since.has(-j.id)) since.set(-j.id, s.time);
    bot(s, since);
    step(s, moon, dt);
    s.outbox.length = 0;
  }
  const c = caps(s, moon);
  console.log(`${name.padEnd(8)} ${s.status} cause=${s.failCause} t=${s.time.toFixed(0)} power=${s.power.toFixed(0)}/${c.power} air=${s.air.toFixed(0)}/${c.air} food=${s.food.toFixed(0)}/${c.food} health=${s.health.toFixed(0)} rad=${s.radiation.toFixed(0)} research=${s.research} tasks=${s.stats.jobs}+${s.stats.crewTasks} upg=${s.stats.upgrades} goals=${s.goalsDone.length} stars=${stars(s)}`);
}

const order: UpgradeKey[] = ['engineering', 'solar', 'lifeSupport', 'station', 'greenhouse', 'battery', 'tank'];
const CREW: TaskId[] = ['exercise', 'o2gen', 'greenhouse', 'solar', 'thermal', 'co2', 'medical', 'water'];

// A player who repairs after fixDelay, finishes a job jobDelay after it appears (one thing at a time),
// hands the crew tasks, spends research, and reaches the shelter shelterLag seconds after impact.
const player = (fixDelay: number, jobDelay: number, shelterLag: number, crewWork: boolean): Bot => {
  let stormStart = -1, busyUntil = 0, pick = 0;
  return (s, since) => {
    for (const m of s.modules) if (m.broken && s.time - since.get(m.id)! > fixDelay && s.time >= busyUntil) { fix(s, m.id); busyUntil = s.time + 4; }
    for (const j of [...s.jobs]) if (s.time - since.get(-j.id)! > jobDelay && s.time >= busyUntil && !s.storm) { completeJob(s, moon, j.id); busyUntil = s.time + jobDelay; }
    if (crewWork && !s.shelterCall) {
      s.crew.forEach((c, i) => { if (!c.chore && s.time > 20) assign(s, moon, i, CREW[pick++ % CREW.length]); });
      for (const k of order) { if (upgradeCost(s, moon, k) !== null && upgrade(s, moon, k)) break; }
    }
    const active = s.storm?.phase === 'active';
    if (active && stormStart < 0) stormStart = s.time;
    if (!active) stormStart = -1;
    for (const c of s.crew) { c.working = !!c.chore && !s.shelterCall; c.sheltered = s.shelterCall && active && s.time - stormStart > 8; }
    s.playerExposure = active && s.time - stormStart > shelterLag ? 0 : 1;
    if (s.parts >= 2 && s.stats.builds < 2 && crewWork) {
      for (let x = -30; x < 30; x += 5) if (canPlace(s, moon, 'solar', x, 25)) { build(s, moon, 'solar', x, 25); break; }
    }
  };
};

console.log(moon.storms.map((s) => `storm ${s.info.flareClass}: warn ${s.warnAt}s, impact ${s.startAt}s, lasts ${s.duration}s, dose ${s.radiation}/s`).join('\n'));
run('idle', () => {});
run('outside', player(10, 15, 9999, true));
run('good', player(8, 12, 4, true));
run('slow', player(30, 40, 25, false));
