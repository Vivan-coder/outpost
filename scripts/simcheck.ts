// Balance sanity check, run with: node scripts/simcheck.ts
import { createSim, step, fix, assign, setShelter, build, canPlace, stars, caps } from '../src/sim/sim.ts';
import type { SimState } from '../src/sim/sim.ts';
import { moon } from '../src/data/moon.ts';

type Bot = (s: SimState, brokenSince: Map<number, number>) => void;

function run(name: string, bot: Bot): void {
  const s = createSim(moon);
  const dt = 1 / moon.tickHz;
  const brokenSince = new Map<number, number>();
  while (s.status === 'running') {
    for (const m of s.modules) {
      if (m.broken && !brokenSince.has(m.id)) brokenSince.set(m.id, s.time);
      if (!m.broken) brokenSince.delete(m.id);
    }
    bot(s, brokenSince);
    step(s, moon, dt);
    s.outbox.length = 0;
  }
  const c = caps(s, moon);
  console.log(`${name.padEnd(10)} ${s.status} cause=${s.failCause} t=${s.time.toFixed(0)} power=${s.power.toFixed(0)}/${c.power} air=${s.air.toFixed(0)}/${c.air} food=${s.food.toFixed(0)}/${c.food} rad=${s.radiation.toFixed(0)} parts=${s.parts} stars=${stars(s, moon)}`);
}

const working = (s: SimState) => { for (const c of s.crew) { c.working = !!c.chore && !s.shelterCall; c.sheltered = s.shelterCall; } };

run('idle', () => {});

run('fix-only', (s, b) => { for (const [id, t] of b) if (s.time - t > 10) fix(s, id); });

// Shelters, but late and only the player's own reaction time; crew take 12 s to get inside.
const decent = (fixDelay: number, shelterLag: number): Bot => {
  let callAt = -1;
  return (s, b) => {
    for (const [id, t] of b) if (s.time - t > fixDelay) fix(s, id);
    if (s.time > 15) { assign(s, 0, 'tomatoes'); assign(s, 1, 'filters'); assign(s, 2, 'rocks'); }
    const active = s.storm?.phase === 'active';
    if (s.storm && !s.shelterCall && (s.storm.phase === 'warning' ? shelterLag < 0 : true)) {
      if (callAt < 0) callAt = s.time;
      if (s.time - callAt >= Math.max(0, shelterLag)) { setShelter(s, true); callAt = -1; }
    }
    if (!s.storm && s.shelterCall) setShelter(s, false);
    for (const c of s.crew) { c.working = !!c.chore && !s.shelterCall && s.time > 25; c.sheltered = s.shelterCall; }
    s.playerSheltered = !!active && s.shelterCall;
    if (s.parts >= 2 && s.stats.builds < 3) {
      const type = s.stats.builds === 1 ? 'battery' : 'solar';
      for (let x = -30; x < 30; x += 5) if (canPlace(s, moon, type, x, 20)) { build(s, moon, type, x, 20); break; }
    }
  };
};
run('good', decent(8, -1));
run('slow', decent(25, 12));
void working;
