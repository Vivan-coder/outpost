// Checks the base layout: nothing overlaps, everything stays inside its building, clear walkways (about 1.5 m),
// every place a person stands is reachable, and crew relax spots never block the player's spots.
// Run with: npm run validate-layout
import {
  STATION_R, SHELTER_R, STATION_PROPS, STATION_SPOTS, CREW_SPOTS, SHELTER_PROPS, SHELTER_SPOTS, SHELTER_AT,
  LANDER_PAD, MODULE_POS, ROCK_PILE, CONTAINERS, OUTDOOR_RADII, TASK_SPOT,
} from '../src/data/layout.ts';
import type { Footprint, Spot } from '../src/data/layout.ts';

const errors: string[] = [];
const notes: string[] = [];
const WALK = 0.75; // half of a 1.5 m walkway
const gap = (a: Footprint, b: Footprint) => Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;

// Grid search: can an agent of this radius walk from `from` to `to` without touching any footprint?
function reachable(from: Spot, to: Spot, blocks: Footprint[], inside: ((x: number, z: number) => boolean) | null, agent: number, cell = 0.25): boolean {
  const lim = 60;
  const key = (i: number, j: number) => i * 4096 + j;
  const free = (x: number, z: number) => {
    if (inside && !inside(x, z)) return false;
    for (const b of blocks) if (b.r > 0 && Math.hypot(x - b.x, z - b.z) < b.r + agent) return false;
    return true;
  };
  const si = Math.round(from.x / cell), sj = Math.round(from.z / cell);
  if (!free(si * cell, sj * cell)) return false;
  const seen = new Set<number>([key(si + 2048, sj + 2048)]);
  const q: [number, number][] = [[si, sj]];
  while (q.length) {
    const [i, j] = q.shift()!;
    // close enough to stand and use the thing (within about 1.3 m of the spot)
    if (Math.hypot(i * cell - to.x, j * cell - to.z) <= 1.3) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (Math.abs(ni * cell) > lim || Math.abs(nj * cell) > lim) continue;
      const k = key(ni + 2048, nj + 2048);
      if (seen.has(k) || !free(ni * cell, nj * cell)) continue;
      seen.add(k); q.push([ni, nj]);
    }
  }
  return false;
}

// ---- Station interior ----
const inner = STATION_R - 0.4;
for (const p of STATION_PROPS) if (Math.hypot(p.x, p.z) + p.r > inner) errors.push(`station: ${p.id} sticks out of the wall`);
for (let i = 0; i < STATION_PROPS.length; i++) for (let j = i + 1; j < STATION_PROPS.length; j++) {
  const g = gap(STATION_PROPS[i], STATION_PROPS[j]);
  if (g < 0.2) errors.push(`station: ${STATION_PROPS[i].id} and ${STATION_PROPS[j].id} overlap or touch (gap ${g.toFixed(2)} m)`);
}
for (const p of STATION_PROPS) if (Math.abs(p.x) < 1.3 + p.r && p.z > STATION_R - 2.4) errors.push(`station: ${p.id} blocks the door`);
const door: Spot = { x: 0, z: STATION_R - 1.6 };
const inStation = (x: number, z: number) => Math.hypot(x, z) < STATION_R - 0.5;
for (const [name, s] of Object.entries({ ...STATION_SPOTS, ...CREW_SPOTS })) {
  if (!reachable(door, s, STATION_PROPS, inStation, WALK)) errors.push(`station: ${name} is not reachable along a 1.5 m walkway`);
}
for (const [name, s] of Object.entries(CREW_SPOTS)) {
  for (const [pn, ps] of Object.entries(STATION_SPOTS)) if (Math.hypot(s.x - ps.x, s.z - ps.z) < 1.0) errors.push(`station: crew spot ${name} blocks the player's spot for ${pn}`);
  for (const p of STATION_PROPS) if (Math.hypot(s.x - p.x, s.z - p.z) < p.r + 0.3) errors.push(`station: crew spot ${name} is inside ${p.id}`);
}
for (const [name, s] of Object.entries(TASK_SPOT)) {
  if (name === 'radmon' || name === 'supplies') continue;
  for (const p of STATION_PROPS) if (Math.hypot(s.x - p.x, s.z - p.z) < p.r + 0.2 && p.id !== name) errors.push(`station: task spot ${name} is inside ${p.id}`);
}

// ---- Shelter ----
const shDoor: Spot = { x: 0, z: SHELTER_R - 1.5 };
const inShelter = (x: number, z: number) => Math.hypot(x, z) < SHELTER_R - 0.5;
for (const [name, s] of Object.entries(SHELTER_SPOTS)) if (!reachable(shDoor, s, SHELTER_PROPS, inShelter, 0.45)) errors.push(`shelter: ${name} is not reachable`);
for (const p of SHELTER_PROPS) if (Math.hypot(p.x, p.z) + p.r > SHELTER_R - 0.4) errors.push(`shelter: ${p.id} sticks out of the wall`);

// ---- Outdoors ----
const out: Footprint[] = [
  { id: 'station', x: 0, z: 0, r: STATION_R },
  { id: 'shelter', ...SHELTER_AT, r: SHELTER_R },
  { id: 'pad', x: LANDER_PAD.x, z: LANDER_PAD.z, r: LANDER_PAD.r },
  { id: 'rocks', x: ROCK_PILE.x, z: ROCK_PILE.z, r: ROCK_PILE.radius },
  ...CONTAINERS,
  ...(Object.keys(MODULE_POS) as (keyof typeof MODULE_POS)[]).map((k) => ({ id: k, ...MODULE_POS[k], r: OUTDOOR_RADII[k] })),
];
for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
  const g = gap(out[i], out[j]);
  if (g < 1.5) errors.push(`outdoors: ${out[i].id} and ${out[j].id} are only ${g.toFixed(2)} m apart (need 1.5 m for a walkway)`);
}
const start: Spot = { x: 0, z: STATION_R + 1.6 };
for (const o of out) {
  if (o.id === 'station') continue;
  // stand on the side facing the station, one body-width from the edge
  const d = Math.hypot(o.x, o.z) || 1;
  const spot: Spot = { x: o.x - (o.x / d) * (o.r + 1.1), z: o.z - (o.z / d) * (o.r + 1.1) };
  if (!reachable(start, spot, out.filter((b) => b.id !== o.id && b.id !== 'station' ? true : b.id === 'station'), null, WALK, 0.5)) errors.push(`outdoors: ${o.id} cannot be reached on a 1.5 m path from the station door`);
}
for (const o of out) if (Math.hypot(o.x, o.z) > 45) errors.push(`outdoors: ${o.id} is outside the build radius`);
notes.push(`${STATION_PROPS.length} station props, ${Object.keys(STATION_SPOTS).length + Object.keys(CREW_SPOTS).length} spots, ${out.length} outdoor footprints checked`);

if (errors.length) {
  console.error('LAYOUT PROBLEMS:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}
console.log('layout ok: ' + notes.join('; '));
