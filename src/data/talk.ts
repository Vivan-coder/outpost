import type { StormDef } from '../sim/sim.ts';
import type { TextKey } from '../i18n/en';
import { apollo } from './apollo.ts';

// Crew chatter during a solar storm. Every number comes from the bundled NASA DONKI records, the Apollo
// Lunar Surface Journal figures or facts.json, so the talk teaches the real event. who: 0 Zaid, 1 Mariam, 2 Sam.
export interface Line { who: number; key: TextKey; vars: Record<string, string | number> }

const date = (iso: string) => iso.slice(0, 10);

// When the warning starts: what was detected, and where to go.
export function warnLines(d: StormDef): Line[] {
  const i = d.info;
  return [
    { who: 0, key: 'talk_w1', vars: { cls: i.flareClass } },
    { who: 1, key: 'talk_w2', vars: { speed: i.cmeSpeedKmS ?? '?' } },
    { who: 2, key: 'talk_w3', vars: {} },
  ];
}

// While everyone waits in the shelter.
export function stormLines(d: StormDef, kp: number, fact: (id: string) => string | null): Line[] {
  const i = d.info;
  const [lo, hi] = apollo.quietDoseRateMradPerHour;
  const lines: Line[] = [
    { who: 1, key: 'talk_s1', vars: { cls: i.flareClass, date: date(i.flareTimeUtc) } },
    { who: 0, key: 'talk_s2', vars: { instrument: i.sepInstrument } },
    { who: 2, key: 'talk_s3', vars: { bfo: apollo.aug1972BloodFormingOrgansRem } },
    { who: 1, key: 'talk_s4', vars: { lo, hi } },
    { who: 0, key: 'talk_s5', vars: {} },
    { who: 2, key: 'talk_s6', vars: { kp } },
    { who: 1, key: 'talk_s7', vars: {} },
    { who: 0, key: 'talk_s8', vars: {} },
  ];
  ['water90', 'exercise2h', 'bone1'].forEach((id, n) => {
    const f = fact(id);
    if (f) lines.push({ who: (2 + n) % 3, key: 'talk_fact', vars: { fact: f } });
  });
  lines.push({ who: 2, key: 'talk_s9', vars: {} });
  return lines;
}
