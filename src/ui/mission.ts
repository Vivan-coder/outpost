import { BASE_BUDGET, caps, commsF, lifeF, powerToday, shieldF, warnTime, type Budget, type DayReport, type Effects, type LevelConfig, type SimState } from '../sim/sim.ts';
import { t, type TextKey } from '../i18n/en';
import factsJson from '../data/facts.json' with { type: 'json' };

// Mission Control: the daily power plan, the decision cards, the day summary and the space weather forecast.
// Everything here is plain words for ages 7 to 12. The effects are a game simplification and say so.

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const KEYS = ['life', 'shield', 'comms', 'science'] as const;
const ICON: Record<string, string> = { life: '💨', shield: '🛡', comms: '📡', science: '🔬' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A dotted word you can tap to learn what it means (works on touch, no hover needed).
export function tip(key: TextKey, label: string): HTMLElement {
  const s = el('span', 'tip', label);
  s.addEventListener('click', (e) => {
    e.stopPropagation();
    let pop = document.getElementById('tipPop');
    if (!pop) { pop = el('div'); pop.id = 'tipPop'; document.body.appendChild(pop); }
    pop.textContent = t(key); pop.style.display = 'block';
    clearTimeout((pop as unknown as { _t?: number })._t);
    (pop as unknown as { _t?: number })._t = window.setTimeout(() => { pop!.style.display = 'none'; }, 6000);
  });
  return s;
}

export function badge(kind: 'real' | 'game' | 'arch' | 'live', text: string, onClick?: () => void): HTMLElement {
  const b = el('button', `badge ${kind}`, text);
  if (onClick) b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

const CHIP: Record<string, [string, TextKey | null]> = {
  air: ['💧', 'air'], power: ['⚡', 'power'], food: ['🌱', 'food'], health: ['❤', 'res_health'], radiation: ['☢', 'radiation'],
  parts: ['🔩', 'parts'], research: ['🔬', 'res_research'], dust: ['🧹', null], shieldBonus: ['🛡', 'protect'],
};
// What an option costs and gives, in icons with signs. Green is a gain, red is a cost (radiation and dust are bad when they go up).
export function effectChips(e: Effects): HTMLElement {
  const box = el('div', 'chips2');
  for (const [k, v] of Object.entries(e)) {
    if (!v) continue;
    const [icon, key] = CHIP[k] ?? ['•', null];
    const bad = k === 'radiation' || k === 'dust' ? v > 0 : v < 0;
    const shown = k === 'dust' ? Math.round(v * 100) : k === 'shieldBonus' ? Math.round(v * 100) : v;
    const name = key ? t(key) : t('bud_life').slice(0, 0) + '';
    box.appendChild(el('span', `chip2 ${bad ? 'bad' : 'good'}`, `${icon} ${v > 0 ? '+' : '−'}${Math.abs(shown)}${k === 'dust' || k === 'shieldBonus' ? '%' : ''} ${name}`));
  }
  return box;
}

const pct = (v: number, m: number) => Math.round(Math.max(0, Math.min(100, (v / m) * 100)));
const fx = (f: number) => { const p = Math.round((f - 1) * 100); return Math.abs(p) < 5 ? t('fxSame') : p > 0 ? t('fxMore', { p }) : t('fxLess', { p: -p }); };

// ---- forecast: the real DONKI chain in order ----
type Stage = 'quiet' | 'watch' | 'flare' | 'cme' | 'protons' | 'over';
export function forecastStage(sim: SimState, cfg: LevelConfig): Stage {
  if (sim.storm) {
    const d = cfg.storms[sim.storm.index];
    if (sim.storm.phase === 'active') return 'protons';
    return sim.time >= d.info.cmeAt ? 'cme' : 'flare';
  }
  if (sim.stormIndex >= cfg.storms.length) return 'over';
  return sim.time >= warnTime(sim, cfg, sim.stormIndex) - 70 ? 'watch' : 'quiet';
}

export function forecastBlock(sim: SimState, cfg: LevelConfig, openSource: (info: { source: string; date: string; url: string }) => void): HTMLElement {
  const box = el('div', 'forecast');
  const head = el('div', 'fcHead');
  head.appendChild(el('b', '', t('fcTitle')));
  const idx = Math.min(sim.stormIndex, cfg.storms.length - 1);
  const info = cfg.storms[idx]?.info;
  const stage = forecastStage(sim, cfg);
  if (info) head.appendChild(badge('arch', t('badgeArchived', { d: info.flareTimeUtc.slice(0, 7) }), () => openSource({ source: 'NASA CCMC DONKI', date: info.flareTimeUtc, url: info.sepUrl })));
  box.appendChild(head);
  const order: Stage[] = ['flare', 'cme', 'protons'];
  const reached = (s: Stage) => stage === 'protons' || (stage === 'cme' && s !== 'protons') || (stage === 'flare' && s === 'flare');
  const rows: [Stage, string, HTMLElement | null][] = [
    ['flare', info ? t('fcFlare', { cls: info.flareClass, time: info.flareTimeUtc.slice(11, 16) }) : '', tip('gl_flare', t('fcStep1'))],
    ['cme', info ? t('fcCme', { speed: info.cmeSpeedKmS ?? '?' }) : '', tip('gl_cme', t('fcStep2'))],
    ['protons', t('fcProtons'), tip('gl_particles', t('fcStep3'))],
  ];
  if (stage === 'quiet' || stage === 'over' || stage === 'watch') {
    box.appendChild(el('p', 'fcLine', t(stage === 'quiet' ? 'fcQuiet' : stage === 'over' ? 'fcOver' : 'fcWatch')));
  } else {
    for (const [s, text, label] of rows) {
      const row = el('div', `fcRow ${reached(s) ? 'on' : 'off'}`);
      const left = el('span', 'fcStep'); left.append(el('i', '', reached(s) ? '✔' : '⏳'), label!);
      row.append(left, el('span', '', reached(s) ? text : '…'));
      box.appendChild(row);
    }
    if (info) box.appendChild(el('small', '', t('fcIds', { id: info.flareId })));
  }
  void order;
  return box;
}

// ---- the full-screen flow: summary → decisions → power plan ----
export interface McContext {
  day: number; // 1-based day that is about to start
  report: DayReport | null;
  choices: string[]; // what the player chose yesterday (already worded)
  decisions: string[]; // decision card ids for today
  gentle: boolean;
  applyDecision(id: string, option: 'a' | 'b'): void;
  openSource(info: { source: string; date: string; url: string }): void;
  onDone(budget: Budget): void;
  dayNote: string | null; // key into facts for the real-world note
}

export function runMissionControl(sim: SimState, cfg: LevelConfig, ctx: McContext, options: { decisionEffects: (id: string, o: 'a' | 'b') => Effects }): void {
  const overlay = $('overlay'), card = $('overlayCard');
  const done = () => { overlay.classList.remove('on'); (document.activeElement as HTMLElement | null)?.blur?.(); ctx.onDone({ ...vals }); };
  const vals: Budget = { ...sim.budget };
  const stages: (() => void)[] = [];
  let at = 0;
  const next = () => { at++; stages[at](); };
  const show = (...nodes: (Node | string)[]) => { card.replaceChildren(...nodes); card.scrollTop = 0; overlay.classList.add('on'); const b = card.querySelector('.main') as HTMLElement | null; b?.focus({ preventScroll: true }); };
  const button = (label: string, fn: () => void, cls = 'main') => { const b = el('button', cls, label); b.addEventListener('click', fn); return b; };

  // 1. what happened yesterday
  if (ctx.report) {
    const r = ctx.report;
    stages.push(() => {
      const cp = caps(sim, cfg);
      const rows: [string, number, number][] = [
        [t('power'), pct(r.start.power, cp.power), pct(r.end.power, cp.power)],
        [t('air'), pct(r.start.air, cp.air), pct(r.end.air, cp.air)],
        [t('protect'), 100 - Math.round(r.start.radiation), 100 - Math.round(r.end.radiation)],
      ];
      const bars = el('div', 'sumBars');
      for (const [label, a, b] of rows) {
        const row = el('div', 'sumRow');
        const track = el('span', 'sumTrack');
        const fillA = el('i', 'before'); fillA.style.width = a + '%';
        const fillB = el('i', b >= a ? 'after up' : 'after down'); fillB.style.width = b + '%';
        track.append(fillA, fillB);
        row.append(el('span', 'sumLabel', label), track, el('span', 'sumVal', `${a} → ${b}`));
        bars.appendChild(row);
      }
      const ul = el('ul', 'sumList');
      const d = (x: number) => (x > 0 ? '+' : '') + Math.round(x);
      const dAir = rows[1][2] - rows[1][1], dPow = rows[0][2] - rows[0][1], dProt = rows[2][2] - rows[2][1];
      ul.appendChild(el('li', '', t('sum_air', { d: d(dAir), p: r.budget.life })));
      if (r.storm || dProt !== 0) ul.appendChild(el('li', '', t(r.storm ? 'sum_storm' : 'sum_prot', { p: r.budget.shield, d: d(dProt) })));
      ul.appendChild(el('li', '', t('sum_pow', { d: d(dPow) })));
      ul.appendChild(el('li', '', t('sum_sci', { p: r.budget.science, n: Math.round(r.budget.science / 10) })));
      for (const c of ctx.choices) ul.appendChild(el('li', '', t('sum_choice', { c })));
      const trade = el('p', 'sumTrade', t('sum_trade'));
      const kids: (Node | string)[] = [el('h2', '', t('sumTitle', { n: r.day })), bars, ul, trade];
      if (ctx.dayNote && (factsJson.facts as Record<string, { source_url: string }>)[ctx.dayNote]) {
        const f = (factsJson.facts as Record<string, { source_url: string }>)[ctx.dayNote];
        const note = el('div', 'realNote');
        note.append(el('b', '', t('sum_real') + ' '), badge('real', t('badgeReal') + ' ⓘ', () => ctx.openSource({ source: 'NASA', date: '2026-11-14', url: f.source_url })), el('div', '', t(`fact_${ctx.dayNote}` as TextKey)));
        kids.push(note);
      }
      kids.push(button(t('mcNext'), next));
      show(...kids);
    });
  }

  // 2. decision cards (every option costs something)
  for (const id of ctx.decisions) {
    stages.push(() => {
      const opts: ('a' | 'b')[] = ['a', 'b'];
      const kids: (Node | string)[] = [el('h2', '', `${t('decTitle')}: ${t(`dec_${id}_t` as TextKey)}`), el('p', '', t(`dec_${id}_d` as TextKey)), el('small', '', t('decGives'))];
      for (const o of opts) {
        const eff = options.decisionEffects(id, o);
        const b = el('button', 'opt decOpt');
        b.append(el('b', '', t(`dec_${id}_${o}` as TextKey)), effectChips(eff));
        b.addEventListener('click', () => { ctx.applyDecision(id, o); next(); });
        kids.push(b);
      }
      show(...kids);
    });
  }

  // 3. the power plan
  stages.push(() => {
    const total = powerToday(sim, cfg);
    const bars: Record<string, { pct: HTMLElement; units: HTMLElement; eff: HTMLElement; input: HTMLInputElement }> = {};
    const kids: (Node | string)[] = [el('h2', '', `${t('mcTitle')} · ${t('mcDay', { n: ctx.day })}`), el('h3', '', t('mcBudgetTitle')), el('p', '', t('mcBudgetHelp', { p: total.toFixed(1) }))];
    if (ctx.gentle) kids.push(el('p', 'gentle', t('mcGentle')));
    const refresh = () => {
      const tmp = { budget: vals, shieldBonus: sim.shieldBonus, day: 99 };
      for (const k of KEYS) {
        const b = bars[k];
        b.input.value = String(vals[k]);
        b.pct.textContent = `${vals[k]}%`;
        b.units.textContent = `≈ ${((vals[k] / 100) * total).toFixed(1)} ⚡`;
        b.eff.textContent = k === 'life' ? t('eff_life', { v: fx(lifeF(tmp)) }) : k === 'shield' ? t('eff_shield', { v: fx(shieldF(tmp)) }) : k === 'comms' ? t('eff_comms', { v: fx(commsF(tmp)) }) : t('eff_science', { n: Math.round(vals.science / 10) });
      }
    };
    const set = (k: (typeof KEYS)[number], v: number) => {
      v = clamp(Math.round(v / 5) * 5, 5, 70);
      const others = KEYS.filter((x) => x !== k);
      const rest = 100 - v;
      const sum = others.reduce((a, x) => a + vals[x], 0) || 1;
      let used = 0;
      others.forEach((x, i) => {
        const nv = i === others.length - 1 ? rest - used : clamp(Math.round(((vals[x] / sum) * rest) / 5) * 5, 5, 70);
        vals[x] = nv; used += nv;
      });
      // keep every share at least 5 and the total exactly 100
      const low = others.find((x) => vals[x] < 5);
      if (low) { const big = others.reduce((a, x) => (vals[x] > vals[a] ? x : a), others[0]); const need = 5 - vals[low]; vals[low] = 5; vals[big] -= need; }
      vals[k] = v;
      refresh();
    };
    for (const k of KEYS) {
      const row = el('div', 'budRow');
      const head = el('div', 'budHead');
      head.append(el('b', '', `${ICON[k]} ${t(`bud_${k}` as TextKey)}`), (() => { const p = el('span', 'budPct'); return p; })());
      const input = el('input') as HTMLInputElement;
      input.type = 'range'; input.min = '5'; input.max = '70'; input.step = '5'; input.value = String(vals[k]);
      input.addEventListener('input', () => set(k, Number(input.value)));
      const units = el('small', 'budUnits'), eff = el('small', 'budEff');
      row.append(head, el('small', '', t(`bud_${k}_d` as TextKey)), input, units, eff);
      bars[k] = { pct: head.lastElementChild as HTMLElement, units, eff, input };
      kids.push(row);
    }
    const g = el('p', ''); g.append(badge('game', t('badgeGame')), document.createTextNode(' ' + t('mcGameSimple')));
    kids.push(forecastBlock(sim, cfg, ctx.openSource), g, el('small', 'tipHint', t('tipHint')));
    const row2 = el('div', 'btnRow');
    row2.append(button(t('mcReset'), () => { Object.assign(vals, BASE_BUDGET); refresh(); }, 'close'), button(t('mcStartDay'), done));
    kids.push(row2);
    show(...kids);
    refresh();
  });

  at = 0;
  stages[0]();
}

// Read-only view for the control-room console and the pause menu
export function controlRoom(sim: SimState, cfg: LevelConfig, openSource: (info: { source: string; date: string; url: string }) => void, openChart: () => void): void {
  const overlay = $('overlay'), card = $('overlayCard');
  const total = powerToday(sim, cfg);
  const kids: (Node | string)[] = [el('h2', '', `${t('mcTitle')} · ${t('mcDay', { n: sim.day + 1 })}`), el('p', '', t('mcBudgetHelp', { p: total.toFixed(1) }))];
  const bars = el('div', 'sumBars');
  for (const k of KEYS) {
    const row = el('div', 'sumRow');
    const track = el('span', 'sumTrack'); const f = el('i', 'after up'); f.style.width = sim.budget[k] + '%'; track.appendChild(f);
    row.append(el('span', 'sumLabel', `${ICON[k]} ${t(`bud_${k}` as TextKey)}`), track, el('span', 'sumVal', `${sim.budget[k]}%`));
    bars.appendChild(row);
  }
  kids.push(bars, forecastBlock(sim, cfg, openSource), el('small', 'tipHint', t('tipHint')));
  const b = el('button', 'main', t('btnClose'));
  b.addEventListener('click', () => { overlay.classList.remove('on'); });
  const chart = el('button', 'close', t('weatherTitle'));
  chart.addEventListener('click', openChart);
  kids.push(chart, b);
  card.replaceChildren(...kids); card.scrollTop = 0; overlay.classList.add('on'); b.focus({ preventScroll: true });
}
