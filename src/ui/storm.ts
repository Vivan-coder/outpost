import { solarEvent } from '../data/moon.ts';
import { flareFlux } from '../data/stormTimeline.ts';
import type { LevelConfig, SimState } from '../sim/sim.ts';
import { t } from '../i18n/en';

// Chart of the real May 2024 DONKI sequence: flares, CMEs, proton onsets and the Kp storm at Earth,
// with a "now" marker that moves as the game storm plays out.
const T0 = Date.parse('2024-05-10T00:00Z');
const T1 = Date.parse('2024-05-12T00:00Z');
const ms = (iso: string) => Date.parse(iso);

// Where the game storm is on the real timeline. The game squeezes about 20 real hours into a few minutes.
export function realNow(sim: SimState, cfg: LevelConfig): number | null {
  if (!sim.storm) return null;
  const d = cfg.storms[sim.storm.index];
  const flare = ms(d.info.flareTimeUtc), sep = ms(d.info.sepTimeUtc);
  if (sim.storm.phase === 'warning') return flare + ((sim.time - d.warnAt) / Math.max(1, d.startAt - d.warnAt)) * (sep - flare);
  return sep + Math.min(1, (sim.time - d.startAt) / d.duration) * 3 * 3600e3;
}

export function fmtUtc(msv: number): string {
  const d = new Date(msv);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function drawStormChart(c: HTMLCanvasElement, now: number | null): void {
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const L = 14, R = W - 14, top = 30, plotB = H - 62;
  const x = (tm: number) => L + ((tm - T0) / (T1 - T0)) * (R - L);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#070c16'; g.fillRect(0, 0, W, H);
  g.font = `bold ${Math.round(H / 16)}px system-ui, sans-serif`;

  // day grid and labels
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.fillStyle = '#ffffffaa'; g.textAlign = 'left';
  for (let h = 0; h <= 48; h += 6) {
    const xx = x(T0 + h * 3600e3);
    g.beginPath(); g.moveTo(xx, top - 6); g.lineTo(xx, plotB); g.stroke();
  }
  g.fillText('10 May', L + 2, 14); g.fillText('11 May', x(T0 + 24 * 3600e3) + 2, 14);

  // Kp at Earth: bars along the bottom of the plot
  const gst = solarEvent.gsts[0];
  for (const k of gst.kp) {
    const xx = x(ms(k.time)); const h = (k.kp / 9) * 34;
    g.fillStyle = k.kp >= 7 ? '#c77dff' : '#7a5aa8';
    g.fillRect(xx - 6, plotB - h, 12, h);
  }
  g.fillStyle = '#c77dff'; g.textAlign = 'left'; g.fillText(`${t('stormLegendKp')} (${gst.maxKp})`, x(ms(gst.kp[0].time)) - 10, plotB - 40);

  // proton onsets measured near Earth (GOES)
  g.setLineDash([5, 4]); g.lineWidth = 2;
  for (const s of solarEvent.seps.filter((v) => v.instrument.startsWith('GOES'))) {
    const xx = x(ms(s.eventTime));
    g.strokeStyle = '#ff9a3c'; g.beginPath(); g.moveTo(xx, top); g.lineTo(xx, plotB); g.stroke();
    g.fillStyle = '#ff9a3c'; g.textAlign = 'center'; g.fillText(t('stormLegendSep'), xx, top - 8);
  }
  g.setLineDash([]);

  // flares: bar height follows the log of the X-ray flux, so each step up the letter scale is one step up
  const hOf = (cls: string) => Math.max(8, ((Math.log10(flareFlux(cls)) + 6.2) / 3.2) * (plotB - top - 24));
  for (const f of solarEvent.flares) {
    const xx = x(ms(f.peakTime)), h = hOf(f.classType);
    g.fillStyle = '#ffd24a'; g.fillRect(xx - 7, plotB - h, 14, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(f.classType, xx, plotB - h - 5);
  }
  // CMEs: triangles with speed
  for (const cme of solarEvent.cmes) {
    const xx = x(ms(cme.startTime));
    g.fillStyle = '#5ad1ff'; g.beginPath(); g.moveTo(xx - 7, top + 22); g.lineTo(xx + 7, top + 22); g.lineTo(xx, top + 8); g.closePath(); g.fill();
    g.fillStyle = '#5ad1ff'; g.textAlign = 'left'; g.fillText(`CME ${cme.speedKmS}`, xx + 9, top + 20);
  }

  // flare class scale: C, M and X on a log axis, with this event's flares marked
  const sy = H - 30, sx0 = L + 6, sx1 = R - 6;
  const lx = (flux: number) => sx0 + ((Math.log10(flux) + 6) / 3) * (sx1 - sx0);
  g.strokeStyle = '#ffffff55'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx0, sy); g.lineTo(sx1, sy); g.stroke();
  g.fillStyle = '#ffffffcc'; g.textAlign = 'center';
  for (const [lab, flux] of [['C1', 1e-6], ['M1', 1e-5], ['X1', 1e-4], ['X10', 1e-3]] as [string, number][]) {
    g.beginPath(); g.moveTo(lx(flux), sy - 6); g.lineTo(lx(flux), sy + 6); g.stroke(); g.fillText(lab, lx(flux), sy + 20);
  }
  for (const f of solarEvent.flares) { g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(lx(flareFlux(f.classType)), sy, 6, 0, 7); g.fill(); }

  // now marker
  if (now !== null) {
    const xx = x(Math.max(T0, Math.min(T1, now)));
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.moveTo(xx, top - 4); g.lineTo(xx, plotB + 4); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = xx > W * 0.7 ? 'right' : 'left';
    g.fillText(fmtUtc(now), xx + (xx > W * 0.7 ? -6 : 6), plotB + 18);
  }
}
