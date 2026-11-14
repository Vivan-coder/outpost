import type { Effects } from '../sim/sim.ts';

// Decision cards. Every option costs something and gives something: there is no free choice.
// The numbers are game design (a simplification), not real measurements.
export interface Decision { id: string; a: Effects; b: Effects }

export const DECISIONS: Decision[] = [
  { id: 'walk', a: { research: 4, air: -8, radiation: 4 }, b: { air: 3, health: -4 } },
  { id: 'regolith', a: { parts: -2, power: -3, shieldBonus: 0.18 }, b: { parts: -2, food: 8 } },
  { id: 'dust', a: { dust: -0.6, air: -4 }, b: { dust: 0.15 } },
  { id: 'workout', a: { health: 10, power: -4 }, b: { power: 2, health: -6 } },
  { id: 'sample', a: { parts: 2, research: 2, air: -7, radiation: 3 }, b: { parts: -1, power: 4 } },
  { id: 'data', a: { research: 3, power: -6 }, b: { power: 3, research: -1 } },
  { id: 'sleep', a: { health: 8, research: -1 }, b: { research: 2, health: -5 } },
];

// Small seeded random numbers so each run mixes the cards differently but a seed repeats.
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The first day is a gentle practice day with no cards. Later days get one or two, never repeating a card.
export function planDecisions(days: number, seed: number): string[][] {
  const rnd = seeded(seed ^ 0x9e3779b9);
  const deck = DECISIONS.map((d) => d.id);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const plan: string[][] = [];
  let n = 0;
  for (let day = 1; day <= days; day++) {
    const count = day === 1 ? 0 : rnd() < 0.4 ? 2 : 1;
    const today: string[] = [];
    for (let k = 0; k < count; k++) today.push(deck[n++ % deck.length]);
    plan.push(today);
  }
  return plan;
}
