import type { StormDef } from '../sim/sim.ts';
import { seeded } from './decisions.ts';

// Shape of the bundled DONKI event files (trimmed NASA CCMC DONKI records).
export interface SolarEvent {
  name: string;
  activeRegionNum: number;
  flares: { id: string; beginTime: string; peakTime: string; endTime: string; classType: string; sourceLocation: string; activeRegionNum: number; instrument: string; link: string; linkedEvents: string[] }[];
  cmes: { id: string; startTime: string; speedKmS: number | null; type: string | null; halfAngleDeg: number | null; link: string; linkedEvents: string[] }[];
  seps: { id: string; eventTime: string; instrument: string; link: string; linkedEvents: string[] }[];
  gsts: { id: string; startTime: string; maxKp: number; kp: { time: string; kp: number; source: string }[]; link: string; linkedEvents: string[] }[];
}

// Game-side choices. Everything not listed here comes from the records.
export interface StormTuning {
  windowStart: number; // game second the first flare is detected
  windowEnd: number; // game second the last proton event begins
  minWarning: number;
  maxWarning: number;
  minDuration: number;
  maxDuration: number;
  secondsPerFlareMinute: number; // storm length in game seconds per minute of flare (records have no proton end time)
  peakRadiation: number; // dose per second for a storm as strong as the reference flare
  fluxRef: number; // reference flare flux, so storms from different events share one scale
  solarFactor: number;
  surgeBreaks: number;
}

const ms = (iso: string) => Date.parse(iso);
const round1 = (n: number) => Math.round(n * 10) / 10;

// GOES X-ray class to peak flux in W/m^2: the letter is the decade, the number the multiplier.
export function flareFlux(cls: string): number {
  const decade: Record<string, number> = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 };
  return (decade[cls[0]] ?? 0) * parseFloat(cls.slice(1));
}

// One storm per flare that has a proton event measured near Earth (GOES), traced back to its linked CME.
// Real time is compressed linearly, so the order and the relative gaps between records are kept.
export function buildStorms(ev: SolarEvent, tn: StormTuning, eventIndex = 0): StormDef[] {
  const sepsSorted = ev.seps.filter((s) => s.instrument.startsWith('GOES')).sort((a, b) => ms(a.eventTime) - ms(b.eventTime));
  const seen = new Set<string>();
  const chains = [] as { sep: SolarEvent['seps'][number]; flare: SolarEvent['flares'][number]; cme: SolarEvent['cmes'][number] }[];
  for (const sep of sepsSorted) {
    const flare = ev.flares
      .filter((f) => sep.linkedEvents.includes(f.id) && ms(f.beginTime) < ms(sep.eventTime))
      .sort((a, b) => ms(b.beginTime) - ms(a.beginTime))[0];
    if (!flare || seen.has(flare.id)) continue; // one storm per flare, using the earliest proton record
    const cme = ev.cmes.find((c) => c.linkedEvents.includes(flare.id) && c.linkedEvents.includes(sep.id));
    if (!cme) continue;
    seen.add(flare.id);
    chains.push({ sep, flare, cme });
  }
  if (chains.length === 0) throw new Error('solar event has no complete flare, CME and proton chain');

  const t0 = Math.min(...chains.map((c) => ms(c.flare.beginTime)));
  const t1 = Math.max(...chains.map((c) => ms(c.sep.eventTime)));
  const span = Math.max(1, t1 - t0);
  const toGame = (real: number) => tn.windowStart + ((real - t0) / span) * (tn.windowEnd - tn.windowStart);

  return chains.map(({ sep, flare, cme }) => {
    const startAt = round1(chains.length === 1 ? (tn.windowStart + tn.windowEnd) / 2 : toGame(ms(sep.eventTime)));
    const warnAt = round1(Math.max(startAt - tn.maxWarning, Math.min(chains.length === 1 ? startAt - tn.maxWarning : toGame(ms(flare.beginTime)), startAt - tn.minWarning)));
    const flareMinutes = (ms(flare.endTime) - ms(flare.beginTime)) / 60000;
    // The Kp storm at Earth that follows this flare: the first one that starts after it
    const gst = ev.gsts.filter((g) => ms(g.startTime) >= ms(flare.beginTime)).sort((a, b) => ms(a.startTime) - ms(b.startTime))[0] ?? ev.gsts[0];
    return {
      warnAt,
      startAt,
      duration: Math.max(tn.minDuration, Math.min(tn.maxDuration, Math.round(flareMinutes * tn.secondsPerFlareMinute))),
      radiation: round1(tn.peakRadiation * (flareFlux(flare.classType) / tn.fluxRef)),
      solarFactor: tn.solarFactor,
      surgeBreaks: tn.surgeBreaks,
      info: {
        event: eventIndex,
        flareId: flare.id, flareClass: flare.classType, flareTimeUtc: flare.beginTime, flareUrl: flare.link,
        cmeId: cme.id, cmeTimeUtc: cme.startTime, cmeSpeedKmS: cme.speedKmS, cmeUrl: cme.link,
        cmeAt: round1(Math.max(warnAt, Math.min(startAt, warnAt + 0.18 * (startAt - warnAt)))),
        sepId: sep.id, sepTimeUtc: sep.eventTime, sepInstrument: sep.instrument, sepUrl: sep.link,
        kp: gst ? gst.maxKp : 0, kpUrl: gst ? gst.link : '', kpId: gst ? gst.id : '',
      },
    };
  });
}

// Each run uses two real storms. Seed 0 is the classic order (the May 2024 pair); other seeds mix real storms
// from the bundled events in a different order. The game times of the two slots stay the same.
export function pickStorms(cands: StormDef[], seed: number): StormDef[] {
  if (seed === 0 || cands.length < 3) return cands.slice(0, 2);
  const rnd = seeded(seed ^ 0x51ed270b);
  const pool = [...cands];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const [a, b] = pool;
  const retime = (d: StormDef, startAt: number, lead: number): StormDef => {
    const warnAt = round1(startAt - lead);
    return { ...d, startAt, warnAt, info: { ...d.info, cmeAt: round1(warnAt + 0.18 * lead) } };
  };
  return [retime(a, 348.5, 90), retime(b, 540, 60)];
}
