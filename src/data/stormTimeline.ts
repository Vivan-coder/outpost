import type { StormDef } from '../sim/sim.ts';

// Shape of src/data/solar-event.json (trimmed NASA CCMC DONKI records).
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
  minWarning: number; // shortest warning the game allows, so a child can still react
  secondsPerFlareMinute: number; // storm length in game seconds per minute of flare (records have no proton end time)
  peakRadiation: number; // dose per second for the strongest flare in the event
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

// One storm per proton event measured near Earth (GOES), each traced back to its linked flare and CME.
// Real time is compressed linearly, so the order and the relative gaps between records are kept.
export function buildStorms(ev: SolarEvent, tn: StormTuning): StormDef[] {
  const chains = ev.seps
    .filter((s) => s.instrument.startsWith('GOES'))
    .sort((a, b) => ms(a.eventTime) - ms(b.eventTime))
    .map((sep) => {
      const flare = ev.flares
        .filter((f) => sep.linkedEvents.includes(f.id) && ms(f.beginTime) < ms(sep.eventTime))
        .sort((a, b) => ms(b.beginTime) - ms(a.beginTime))[0];
      const cme = ev.cmes.find((c) => c.linkedEvents.includes(flare.id) && c.linkedEvents.includes(sep.id));
      if (!flare || !cme) throw new Error(`solar-event.json: no linked flare and CME for ${sep.id}`);
      return { sep, flare, cme };
    });

  const t0 = Math.min(...chains.map((c) => ms(c.flare.beginTime)));
  const t1 = Math.max(...chains.map((c) => ms(c.sep.eventTime)));
  const toGame = (real: number) => tn.windowStart + ((real - t0) / (t1 - t0)) * (tn.windowEnd - tn.windowStart);
  const maxFlux = Math.max(...chains.map((c) => flareFlux(c.flare.classType)));

  return chains.map(({ sep, flare, cme }) => {
    const startAt = round1(toGame(ms(sep.eventTime)));
    const warnAt = round1(Math.min(toGame(ms(flare.beginTime)), startAt - tn.minWarning));
    const flareMinutes = (ms(flare.endTime) - ms(flare.beginTime)) / 60000;
    return {
      warnAt,
      startAt,
      duration: Math.round(flareMinutes * tn.secondsPerFlareMinute),
      radiation: round1(tn.peakRadiation * (flareFlux(flare.classType) / maxFlux)),
      solarFactor: tn.solarFactor,
      surgeBreaks: tn.surgeBreaks,
      info: {
        flareId: flare.id, flareClass: flare.classType, flareTimeUtc: flare.beginTime,
        cmeId: cme.id, cmeTimeUtc: cme.startTime, cmeSpeedKmS: cme.speedKmS,
        cmeAt: round1(Math.max(warnAt, Math.min(startAt, toGame(ms(cme.startTime))))),
        sepId: sep.id, sepTimeUtc: sep.eventTime, sepInstrument: sep.instrument, sepUrl: sep.link,
      },
    };
  });
}
