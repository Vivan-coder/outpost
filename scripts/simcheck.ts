// Balance sanity check, run with: node scripts/simcheck.ts
import { createSim, step, fix, assign, build, canPlace, completeJob, stars, caps } from '../src/sim/sim.ts';
import type { SimState } from '../src/sim/sim.ts';
import { moon } from '../src/data/moon.ts';

type Bot = (s: SimState, since: Map<number, number>) => void;

function run(name: string, bot: Bot): void {
  const s = createSim(moon);
  const dt = 1 / moon.tickHz;
  const since = new Map<number, number>(); // when each broken module or job first appeared
  while (s.status === 'running') {
    for (const m of s.modules) { if (m.broken && !since.has(m.id)) since.set(m.id, s.time); if (!m.broken) since.delete(m.id); }
    for (const j of s.jobs) if (!since.has(-j.id)) since.set(-j.id, s.time);
    bot(s, since);
    step(s, moon, dt);
    s.outbox.length = 0;
  }
  const c = caps(s, moon);
  console.log(`${name.padEnd(9)} ${s.status} cause=${s.failCause} t=${s.time.toFixed(0)} power=${s.power.toFixed(0)}/${c.power} air=${s.air.toFixed(0)}/${c.air} food=${s.food.toFixed(0)}/${c.food} rad=${s.radiation.toFixed(0)} parts=${s.parts} jobs=${s.stats.jobs} fixes=${s.stats.fixes} stars=${stars(s, moon)}`);
}

// A player who repairs after fixDelay, finishes a job jobDelay after it appears (one thing at a time),
// re-assigns chores, and reaches the shelter shelterLag seconds after impact (crew take 8 s).
const player = (fixDelay: number, jobDelay: number, shelterLag: number, chores: boolean): Bot => {
  let stormStart = -1, busyUntil = 0;
  return (s, since) => {
    for (const m of s.modules) if (m.broken && s.time - since.get(m.id)! > fixDelay && s.time >= busyUntil) { fix(s, m.id); busyUntil = s.time + 4; }
    for (const j of [...s.jobs]) if (s.time - since.get(-j.id)! > jobDelay && s.time >= busyUntil && !s.storm) { completeJob(s, moon, j.id); busyUntil = s.time + jobDelay; }
    if (chores && s.time > 20 && !s.shelterCall) {
      const want = ['tomatoes', 'filters', 'rocks'] as const;
      s.crew.forEach((c, i) => { if (!c.chore) assign(s, i, want[i]); });
    }
    const active = s.storm?.phase === 'active';
    if (active && stormStart < 0) stormStart = s.time;
    if (!active) stormStart = -1;
    for (const c of s.crew) { c.working = !!c.chore && !s.shelterCall; c.sheltered = s.shelterCall && active && s.time - stormStart > 8; }
    s.playerExposure = active && s.time - stormStart > shelterLag ? 0 : 1;
    if (s.parts >= 2 && s.stats.builds < 3 && chores) {
      const type = s.stats.builds === 1 ? 'battery' : 'solar';
      for (let x = -30; x < 30; x += 5) if (canPlace(s, moon, type, x, 25)) { build(s, moon, type, x, 25); break; }
    }
  };
};

console.log(moon.storms.map((s) => `storm ${s.info.flareClass}: warn ${s.warnAt}s, impact ${s.startAt}s, lasts ${s.duration}s, dose ${s.radiation}/s`).join('\n'));
run('idle', () => {});
run('outside', player(10, 15, 9999, true));
run('good', player(8, 12, 4, true));
run('slow', player(30, 40, 25, false));
