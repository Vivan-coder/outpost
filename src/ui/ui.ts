import { caps, crewOptions, goalProgress, stars, taskSpeed, upgradeCost, type LevelConfig, type ModuleType, type Reward, type SimState, type TaskId, type UpgradeKey } from '../sim/sim.ts';
import factsJson from '../data/facts.json' with { type: 'json' };
import { solarEvent, events } from '../data/moon.ts';
import { apollo, FULL_METER_REM } from '../data/apollo.ts';
import meta from '../data/solar-event.meta.json' with { type: 'json' };
import { t, type TextKey } from '../i18n/en';
import { GAUGE_ZONE, type TaskRunner } from '../game/tasks';
import { TOOLS, type Tool } from '../data/workTasks';
import type { WorkView } from '../game/work';
import { CARD_IDS, cardInfo, issDayHigh, issDayLow, radDay, radUrl, type CardId, type CardInfo } from './cards';
import { drawStormChart, realNow } from './storm';

export interface UiHandlers {
  pickBuild(type: ModuleType): void;
  place(): void;
  cancelPlace(): void;
  actDown(): void; // touch action button pressed
  seqPress(n: number): void;
  assign(crewIndex: number, task: TaskId | null): void;
  upgrade(key: UpgradeKey): void;
  tool(i: number): void;
  leaveWork(): void;
  quality(): 'low' | 'medium' | 'high';
  cycleQuality(): void;
  fps(): boolean;
  toggleFps(): void;
  cardNew(id: CardId): void;
  mc(): void;
  callShelter(): void;
  toggleLanguage(): void;
  restart(): void;
  click(): void;
}

interface Bar { fill: HTMLElement; value: HTMLElement; row: HTMLElement; last: number }
// Set while a VR session is running: screens that would be DOM pop-ups are shown on VR panels instead.
export interface VrHook {
  note(key: TextKey): void;
  crew(only: number | null): void;
  menu(): void;
  card(title: string, lines: string[], button: string, onClose?: () => void): void;
  toast(text: string): void;
  subtitle(name: string, text: string, seconds: number): void;
}
export interface CardOpts { title: string; paragraphs?: string[]; list?: string[]; source?: string; button: string; onClose?: () => void; extra?: { label: string; onClick: () => void }[] }

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const utc = (iso: string) => iso.replace('T', ' ').replace('Z', '');
// Turns "[E]" in a translated string into a key cap. Text is ours, never user input.
const keycaps = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');

// Three big resources: Power, Oxygen and Protection. Food, crew health, parts and research are small.
const BARS: { key: 'power' | 'air' | 'protect'; color: string; icon: string }[] = [
  { key: 'power', color: '#ffd24a', icon: '⚡' },
  { key: 'air', color: '#5ad1ff', icon: '💨' },
  { key: 'protect', color: '#6fd3a8', icon: '🛡' },
];
const UPGRADES: UpgradeKey[] = ['engineering', 'solar', 'lifeSupport', 'greenhouse', 'battery', 'tank', 'station'];
export const factText = (id: string | null): string | null => (id && (factsJson.facts as Record<string, unknown>)[id] ? t(('fact_' + id) as TextKey) : null);

// A record belongs to the storm on screen if it is within a day and a half of the flare.
const near = (iso: string, anchor: string) => Math.abs(Date.parse(iso) - Date.parse(anchor)) < 36 * 3600e3;
const winfoDate = (cfg: LevelConfig, sim: SimState) => cfg.storms[Math.min(sim.stormIndex, cfg.storms.length - 1)].info.flareTimeUtc.slice(0, 10);
const scaled = (r: Reward, k: number): Reward => ({ ...r, power: r.power && Math.round(r.power * k), air: r.air && Math.round(r.air * k), food: r.food && Math.round(r.food * k), health: r.health && Math.round(r.health * k), research: r.research && Math.round(r.research * k) });
function gainText(r: Reward): string {
  const parts: string[] = [];
  const add = (key: TextKey, n: number | undefined) => { if (n) parts.push(t(key, { n })); };
  add('gainPower', r.power); add('gainAir', r.air); add('gainFood', r.food); add('gainHealth', r.health);
  add('gainRadiation', r.radiation); add('gainParts', r.parts); add('gainResearch', r.research);
  return parts.join(' · ');
}

const BUILDABLE: ModuleType[] = ['solar', 'battery', 'lifeSupport', 'tank', 'greenhouse'];

export function createUi(cfg: LevelConfig, h: UiHandlers) {
  const bars = {} as Record<string, Bar>;
  for (const b of BARS) {
    const row = el('div', 'row');
    const track = el('span', 'track');
    const fill = el('i');
    fill.style.background = b.color;
    track.appendChild(fill);
    const value = el('span', 'value');
    row.append(el('span', 'label', `${b.icon} ${t(b.key)}`), track, value);
    $('bars').appendChild(row);
    bars[b.key] = { fill, value, row, last: -1 };
  }
  $('partsLabel').textContent = t('parts');
  $('resLabel').textContent = t('res_research');
  $('btnFF').textContent = t('btnFF');
  $('btnSkip').textContent = t('btnSkip');
  $('buildBtn').textContent = t('btnBuild');
  $('crewBtn').textContent = t('btnCrew');
  $('jump').textContent = t('btnJump');
  $('placeBtn').textContent = t('btnPlace');
  $('cancelBtn').textContent = t('btnCancel');
  $('dataBtn').textContent = t('btnData');
  $('pauseBtn').textContent = t('btnPause');
  $('shelterBtn').textContent = t('btnShelter');
  $('sourceCard').replaceChildren(el('b', '', t('sourceCardTitle')), el('span', '', t('sourceCardText')));
  $('spTitle').textContent = t('stormPanelTitle');
  $('spNote').textContent = t('stormSimple');

  const menu = $('menu'), menuCard = $('menuCard'), overlay = $('overlay'), overlayCard = $('overlayCard');
  const banner = $('banner'), shelterBtn = $('shelterBtn'), storm = $('storm');
  const actBtn = $('actBtn'), taskBox = $('task'), seq = $('seq'), gauge = $('gauge');
  let flashText = '', flashUntil = 0, lastBanner = '', lastJobs = null as string | null, lastPrompt = '', lastTask = '', lastGoals = '';
  let menuKind: 'build' | 'crew' | 'pause' | 'upgrade' | 'quiz' | null = null;
  let subTimer = 0;
  let goalsOpen = false, lastSim: SimState | null = null, workSig = '';
  const collected = new Set<CardId>();
  const snaps = new Map<CardId, CardInfo>(); // each card keeps the text it had when it was found
  let vrHook: VrHook | null = null;
  const badge = (kind: 'real' | 'game' | 'hist', info?: { source: string; date: string; url: string }): HTMLElement => {
    const b = el('button', `badge ${kind}`, t(kind === 'real' ? 'badgeReal' : kind === 'game' ? 'badgeGame' : 'badgeHist') + (info ? ' ⓘ' : ''));
    if (info) b.addEventListener('click', (e) => { e.stopPropagation(); ui.dataInfo(info); });
    return b;
  };
  const DONKI = { source: 'NASA CCMC DONKI', date: '2024-05-10 to 2024-05-12', url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/' };
  const marks = new Map<string, HTMLElement>();
  let actHeld = false;

  const press = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  press('placeBtn', () => h.place());
  press('cancelBtn', () => h.cancelPlace());
  press('shelterBtn', () => h.callShelter());
  $('workBack').addEventListener('click', () => h.leaveWork());

  // Action button: hold for tasks, so it tracks pointer down and up rather than clicks.
  actBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); actHeld = true; actBtn.classList.add('held'); h.actDown(); });
  const release = () => { actHeld = false; actBtn.classList.remove('held'); };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) actBtn.addEventListener(ev, release);
  actBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  seq.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); h.seqPress(Number(b.dataset.n)); }));
  (gauge.querySelector('.zone') as HTMLElement).style.cssText += `left:${GAUGE_ZONE[0] * 100}%;width:${(GAUGE_ZONE[1] - GAUGE_ZONE[0]) * 100}%`;

  const setBar = (key: string, v: number, cap: number, lowIsBad: boolean) => {
    const b = bars[key];
    const pct = Math.round((v / cap) * 100);
    if (pct === b.last) return;
    b.last = pct;
    b.fill.style.width = pct + '%';
    b.value.textContent = String(pct);
    b.row.classList.toggle('warn', lowIsBad ? pct <= 25 : pct >= 60);
  };

  const focusFirst = (card: HTMLElement) => (card.querySelector('button:not(:disabled)') as HTMLElement | null)?.focus({ preventScroll: true });
  const blur = () => (document.activeElement as HTMLElement | null)?.blur?.();
  const closeMenu = () => { menu.classList.remove('on'); menuKind = null; blur(); };
  const closeOverlay = () => { overlay.classList.remove('on'); blur(); };

  // A numbered menu row. Number keys 1-9 pick it; arrows and Enter work too.
  const option = (n: number, title: string, sub: string, right: string, onPick: () => void, on = false): HTMLButtonElement => {
    const b = el('button', `opt${on ? ' on' : ''}`);
    b.dataset.n = String(n);
    b.append(el('i', '', String(n)), el('b', '', title), el('em', '', right), el('span', '', sub));
    b.addEventListener('click', () => { h.click(); onPick(); });
    return b;
  };
  const closer = (label = t('btnClose'), fn: () => void = closeMenu) => {
    const c = el('button', 'close', label);
    c.addEventListener('click', fn);
    return c;
  };

  const ui = {
    blocking: () => menu.classList.contains('on') || overlay.classList.contains('on'),
    menuOpen: () => menuKind,
    closeMenu,
    actHeld: () => actHeld,

    // Keyboard control of whatever menu or card is open. Returns true if the key was used.
    handleKey(e: KeyboardEvent): boolean {
      const card = overlay.classList.contains('on') ? overlayCard : menu.classList.contains('on') ? menuCard : null;
      if (!card) return false;
      const buttons = Array.from(card.querySelectorAll('button:not(:disabled)')) as HTMLElement[];
      const at = buttons.indexOf(document.activeElement as HTMLElement);
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { buttons[(at + 1) % buttons.length]?.focus(); return true; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { buttons[(at - 1 + buttons.length) % buttons.length]?.focus(); return true; }
      if (/^(Digit|Numpad)[1-9]$/.test(e.code)) {
        (card.querySelector(`button[data-n="${e.code.slice(-1)}"]:not(:disabled)`) as HTMLElement | null)?.click();
        return true;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (at < 0) ((card.querySelector('.main') ?? buttons[0]) as HTMLElement | null)?.click();
        else buttons[at].click();
        return true;
      }
      if (e.code === 'Escape') {
        if (card === menuCard) closeMenu();
        else (card.querySelector('.main') as HTMLElement | null)?.click();
        return true;
      }
      return false;
    },

    // Work mode panel: step hint, progress, gauge, meter and the tool hotbar.
    setWork(v: WorkView | null, touch: boolean): void {
      document.body.classList.toggle('working', !!v);
      if (!v) { workSig = ''; return; }
      if (workSig === '') {
        $('workBack').textContent = t('ws_leave');
        const bar = $('hotbar');
        bar.replaceChildren();
        TOOLS.forEach((tl, i) => {
          const b = el('button', '', tl.icon);
          b.dataset.tool = tl.id; b.title = t(`tool_${tl.id}` as TextKey);
          b.append(el('small', '', String(i + 1)));
          b.addEventListener('pointerdown', (e) => { e.preventDefault(); h.tool(i); });
          bar.appendChild(b);
        });
        ($('workGauge').querySelector('.zone') as HTMLElement).style.cssText += `left:${GAUGE_ZONE[0] * 100}%;width:${(GAUGE_ZONE[1] - GAUGE_ZONE[0]) * 100}%`;
        $('workMeterLabel').textContent = t('ws_power');
        workSig = 'on';
      }
      const kind = v.kind === 'repair' ? t('taskTitle_repair') : t(`task_${v.kind === 'solar' ? 'solar' : v.kind === 'water' ? 'water' : 'greenhouse'}` as TextKey);
      $('workTitle').textContent = kind;
      $('workStep').textContent = t('ws_step', { n: v.stepNo, m: v.stepTotal });
      const toolName = v.needTool ? t(`tool_${v.needTool}` as TextKey) : '';
      const key = v.needTool ? TOOLS.findIndex((x) => x.id === v.needTool) + 1 : 0;
      const hint = v.note ? t(v.note, { tool: toolName }) : t(v.hintKey, { n: v.n, m: v.m, p: v.pct, tool: toolName, key });
      $('workHint').innerHTML = keycaps(touch ? hint.replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ') : hint);
      $('workHint').classList.toggle('warn', !!v.note);
      $('workBar').style.width = `${Math.round(v.progress * 100)}%`;
      const g = $('workGauge');
      g.style.display = v.gauge === null ? 'none' : 'block';
      if (v.gauge !== null) (g.querySelector('.needle') as HTMLElement).style.left = `${v.gauge * 100}%`;
      const mt = $('workMeter');
      mt.style.display = v.meter === null ? 'none' : 'block';
      if (v.meter !== null) $('workMeterFill').style.width = `${Math.round(v.meter * 100)}%`;
      $('hotbar').querySelectorAll('button').forEach((b) => {
        const id = b.dataset.tool as Tool;
        b.classList.toggle('on', v.tool === id);
        b.classList.toggle('need', v.needTool === id && v.tool !== id);
      });
    },

    toggleGoals(): void { goalsOpen = !goalsOpen; lastGoals = ''; if (lastSim) ui.update(lastSim, 0, 0, true); },

    update(sim: SimState, nowS: number, crewSafe: number, _redraw = false): void {
      lastSim = sim;
      const cap = caps(sim, cfg);
      setBar('power', sim.power, cap.power, true);
      setBar('air', sim.air, cap.air, true);
      document.body.classList.toggle('lowsupply', sim.air < cap.air * 0.2 || sim.food < cap.food * 0.2 || sim.power <= 0);
      setBar('protect', 100 - sim.radiation, 100, true);
      $('extras').textContent = t('extras', { f: Math.round((sim.food / cap.food) * 100), h: Math.round(sim.health) });
      $('partsValue').textContent = String(sim.parts);
      $('resValue').textContent = String(sim.research);
      const sig = cfg.goals.map((g) => (sim.goalsDone.includes(g.id) ? '1' : Math.floor(goalProgress(sim, cfg, g) / Math.max(1, g.target / 10)))).join(',');
      if (sig !== lastGoals) {
        lastGoals = sig;
        const box = $('goals');
        const head = el('button', 'goalsHead', `${sim.goalsDone.length > 0 ? '★' : '☆'} ${sim.goalsDone.length}/${cfg.goals.length} ${t('goalsTitle')} ${goalsOpen ? '▴' : '▾'}`);
        head.addEventListener('click', () => ui.toggleGoals());
        box.replaceChildren(head);
        if (goalsOpen) for (const g of cfg.goals) {
          const done = sim.goalsDone.includes(g.id);
          const n = g.kind.endsWith('Streak') ? Math.round(g.target / cfg.solLength) : g.target;
          box.appendChild(el('div', done ? 'done' : '', (done ? '★ ' : '☆ ') + t(('goal_' + g.id) as TextKey, { n })));
        }
      }
      $('sol').textContent = t('sol', { n: Math.floor(sim.time / cfg.solLength) + 1 });
      $('timeLeft').textContent = t('timeLeft', { t: mmss(Math.max(0, cfg.missionLength - sim.time)) });

      let html = '', cls = '';
      if (sim.storm) {
        // Each line of small print is a step of the real record chain: flare, then CME, then protons.
        const d = cfg.storms[sim.storm.index];
        const i = d.info;
        const safe = `<span class="state ${crewSafe === sim.crew.length ? 'good' : 'bad'}">${t('crewSafe', { n: crewSafe, m: sim.crew.length })}</span>`;
        if (sim.storm.phase === 'warning') {
          let stage = t('stageFlare', { cls: i.flareClass, time: utc(i.flareTimeUtc) });
          if (sim.time >= i.cmeAt && i.cmeSpeedKmS) stage += ' ' + t('stageCme', { speed: i.cmeSpeedKmS });
          html = `${t('stormWarn', { s: Math.ceil(d.startAt - sim.time) })}${sim.shelterCall ? safe : ''}<small>${stage}</small>`;
        } else {
          const e = sim.playerExposure;
          const stage = t('stageSep', { time: utc(i.sepTimeUtc), instrument: i.sepInstrument });
          html = `${t('stormActive', { s: Math.ceil(d.startAt + d.duration - sim.time) })}` +
            `<span class="state ${e <= 0 ? 'good' : 'bad'}">${t(e <= 0 ? 'safe' : e < 1 ? 'half' : 'exposed')}</span>${safe}<small>${stage}</small>`;
        }
      } else if (nowS < flashUntil) {
        html = flashText; cls = 'info';
      }
      if (html !== lastBanner) {
        lastBanner = html;
        banner.innerHTML = html;
        banner.className = cls;
        banner.style.display = html ? 'block' : 'none';
      }
      $('hint').style.visibility = html ? 'hidden' : 'visible';

      const showShelter = sim.storm?.phase === 'warning' && !sim.shelterCall;
      shelterBtn.style.display = showShelter ? 'block' : 'none';
      if (showShelter) shelterBtn.style.top = `${banner.offsetHeight + 18}px`;
      $('sourceCard').style.display = sim.storm ? 'block' : 'none';
      const sp = $('stormPanel');
      sp.style.display = sim.storm ? 'block' : 'none';
      document.body.classList.toggle('storming', !!sim.storm);
      if (sim.storm) {
        if (!sp.dataset.ready) { sp.dataset.ready = '1'; $('spBadge').replaceChildren(badge('real', DONKI), badge('game')); }
        const inf = cfg.storms[sim.storm.index].info;
        drawStormChart($('spChart') as HTMLCanvasElement, realNow(sim, cfg), inf.event, inf.flareTimeUtc);
      }
      // Dosimeter: the number is the game's storm dose; the comparison is real ISS data from RadLab
      const dose = $('dose');
      if (!dose.dataset.ready) {
        dose.dataset.ready = '1';
        dose.replaceChildren(el('div', 'doseRow'), el('small', '', t('doseReal', { lo: issDayLow, hi: issDayHigh })), badge('real', { source: 'NASA OSDR RadLab', date: radDay, url: radUrl }), badge('game'));
      }
      (dose.firstElementChild as HTMLElement).textContent = `☢ ${t('doseLabel')}: ${t('doseGame', { n: Math.round(sim.radiation * 10) })}`;
      const active = sim.storm?.phase === 'active';
      storm.className = active ? (sim.playerExposure <= 0 ? 'on' : 'on exposed') : sim.storm ? 'warn' : '';
    },

    setJobs(items: { text: string; urgent: boolean }[]): void {
      const sig = items.map((i) => i.text + i.urgent).join('|');
      if (sig === lastJobs) return;
      lastJobs = sig;
      const box = $('jobs');
      box.replaceChildren(el('b', '', t('jobsTitle')));
      if (items.length === 0) box.appendChild(el('div', '', t('jobsNone')));
      for (const i of items.slice(0, 5)) box.appendChild(el('div', i.urgent ? 'urgent' : '', (i.urgent ? '! ' : '★ ') + i.text));
    },

    // Prompt under the crosshair, plus the touch action button's label.
    setPrompt(text: string | null, button: string | null): void {
      const sig = `${text}|${button}`;
      if (sig !== lastPrompt) {
        lastPrompt = sig;
        const p = $('prompt');
        p.style.display = text ? 'block' : 'none';
        if (text) p.innerHTML = keycaps(text);
        actBtn.classList.toggle('on', !!button);
        if (button) actBtn.textContent = button;
        $('dot').classList.toggle('hot', !!text);
      }
    },

    setRing(p: number): void { $('cross').style.setProperty('--p', String(Math.round(p * 100))); },

    // Mini-step panel. Drawn straight from the task runner's state each frame.
    renderTask(run: TaskRunner, touch: boolean): void {
      const on = run.stage === 'mini';
      const sig = on ? `${run.target!.kind}${touch}` : '';
      if (sig !== lastTask) {
        lastTask = sig;
        taskBox.style.display = on ? 'block' : 'none';
        if (on) {
          const kind = run.target!.kind;
          $('taskTitle').textContent = kind === 'repair' ? t('taskTitle_repair') : t(('task_' + kind) as TextKey);
          const why = kind === 'repair' ? null : factText(cfg.tasks.find((tk) => tk.id === kind)?.why ?? null);
          $('taskWhy').textContent = why ? t('whyTitle') + ': ' + why : '';
          $('taskWhy').style.display = why ? 'block' : 'none';
          const hintKey = run.mini === 'sequence' ? 'miniSeq' : run.mini === 'gauge' ? 'miniGauge' : kind === 'greenhouse' ? 'miniWater' : 'miniWipe';
          $('taskHint').innerHTML = keycaps(t(`${hintKey}${touch ? 'Touch' : ''}` as TextKey));
          seq.style.display = run.mini === 'sequence' ? 'flex' : 'none';
          gauge.style.display = run.mini === 'gauge' ? 'block' : 'none';
        }
      }
      if (!on) return;
      $('taskBar').style.width = `${Math.min(100, run.progress * 100)}%`;
      if (run.mini === 'sequence') {
        const want = run.order[run.index];
        seq.classList.toggle('wrong', run.flash > 0);
        seq.querySelectorAll('button').forEach((b) => b.classList.toggle('lit', run.flash <= 0 && Number(b.dataset.n) === want));
      } else if (run.mini === 'gauge') {
        (gauge.querySelector('.needle') as HTMLElement).style.left = `${run.level * 100}%`;
      }
    },

    flash(text: string, nowS: number, seconds: number): void { flashText = text; flashUntil = nowS + seconds; },

    // Floating objective markers: on screen they sit over the thing, off screen they point the way.
    setMarks(items: { id: string; label: string; color: string; x: number; y: number; dist: number; edge: boolean; angle: number }[]): void {
      const box = $('marks');
      const seen = new Set<string>();
      for (const m of items) {
        seen.add(m.id);
        let n = marks.get(m.id);
        if (!n) { n = el('div', 'mark'); n.append(el('i'), el('span')); box.appendChild(n); marks.set(m.id, n); }
        n.style.transform = `translate(${m.x}px,${m.y}px)`;
        n.style.setProperty('--c', m.color);
        n.classList.toggle('edge', m.edge);
        (n.firstElementChild as HTMLElement).textContent = m.edge ? '▲' : '';
        (n.firstElementChild as HTMLElement).style.transform = m.edge ? `rotate(${m.angle}rad)` : '';
        (n.lastElementChild as HTMLElement).textContent = `${m.label} ${Math.round(m.dist)}m`;
      }
      for (const [id, n] of marks) if (!seen.has(id)) { n.remove(); marks.delete(id); }
    },

    // Subtitle line for what the crew say, so it can be read even when they are far away.
    subtitle(name: string, text: string, seconds: number): void {
      vrHook?.subtitle(name, text, seconds);
      const box = $('subtitle');
      if (name) box.replaceChildren(el('b', '', name), document.createTextNode(': ' + text));
      else box.replaceChildren(document.createTextNode(text));
      box.style.display = 'block';
      clearTimeout(subTimer);
      subTimer = window.setTimeout(() => { box.style.display = 'none'; }, seconds * 1000);
    },

    // One quiz question with numbered answers. onPick gets the chosen index.
    openQuiz(question: string, options: string[], onPick: (i: number) => void): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      menuKind = 'quiz';
      menuCard.replaceChildren(el('h2', '', t('quizTitle')), el('p', '', question));
      options.forEach((o, i) => menuCard.appendChild(option(i + 1, o, '', '', () => { closeMenu(); onPick(i); })));
      menuCard.append(closer(), el('p', 'keys', t('menuKeys')));
      menu.classList.add('on');
      focusFirst(menuCard);
    },

    collect(id: CardId): boolean {
      if (collected.has(id)) return false;
      collected.add(id); snaps.set(id, cardInfo(id));
      h.cardNew(id);
      return true;
    },
    setCollected(ids: string[]): void { ids.forEach((i) => { if (CARD_IDS.includes(i as CardId)) collected.add(i as CardId); }); },
    collectedIds: (): CardId[] => [...collected],
    cardTitle: (id: CardId): string => cardInfo(id).title,

    dataInfo(info: { source: string; date: string; url: string }): void {
      ui.card({ title: t('badgeTitle'), paragraphs: [t('srcName', { s: info.source }), t('srcDate', { d: info.date })], source: t('srcLink', { u: info.url }), button: t('btnClose') });
    },

    // The Space Weather console: the real DONKI sequence for the whole event, with where the game storm is now.
    weatherCard(sim: SimState): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      overlayCard.replaceChildren(el('h2', '', t('weatherTitle')), badge('real', DONKI), el('p', '', t('weatherIntro', { d: winfoDate(cfg, sim) })));
      const winfo = cfg.storms[Math.min(sim.stormIndex, cfg.storms.length - 1)].info;
      const wev = events[winfo.event] ?? solarEvent;
      const c = document.createElement('canvas');
      c.width = 760; c.height = 340;
      drawStormChart(c, realNow(sim, cfg), winfo.event, winfo.flareTimeUtc);
      overlayCard.appendChild(c);
      const ul = el('ul');
      const rows: [string, string][] = [
        ...wev.flares.filter((f) => near(f.beginTime, winfo.flareTimeUtc)).map((f): [string, string] => [f.beginTime, t('dataFlare', { time: utc(f.beginTime), cls: f.classType }) + '  · ' + f.id]),
        ...wev.cmes.filter((m) => near(m.startTime, winfo.flareTimeUtc)).map((m): [string, string] => [m.startTime, t('dataCme', { time: utc(m.startTime), speed: m.speedKmS ?? '?' }) + '  · ' + m.id]),
        ...wev.seps.filter((s) => s.instrument.startsWith('GOES') && near(s.eventTime, winfo.flareTimeUtc)).map((s): [string, string] => [s.eventTime, t('dataSep', { time: utc(s.eventTime), instrument: s.instrument }) + '  · ' + s.id]),
        ...wev.gsts.filter((g) => near(g.startTime, winfo.flareTimeUtc)).slice(0, 1).map((g): [string, string] => [g.startTime, t('dataGst', { time: utc(g.startTime), kp: g.maxKp }) + '  · ' + g.id]),
      ];
      for (const [, text] of rows.sort((a, b) => a[0].localeCompare(b[0]))) ul.appendChild(el('li', '', text));
      overlayCard.appendChild(ul);
      overlayCard.appendChild(el('p', '', t('stormScaleTitle')));
      const sim2 = el('p', '');
      sim2.append(badge('game'), document.createTextNode(' ' + t('stormSimple')));
      overlayCard.appendChild(sim2);
      overlayCard.appendChild(el('p', 'src', t('dataQuality')));
      const b = el('button', 'main', t('btnClose'));
      b.addEventListener('click', closeOverlay);
      overlayCard.appendChild(b);
      overlayCard.scrollTop = 0;
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },

    // One place that lists every real dataset, how the game uses it and where it comes from.
    dataLab(): void {
      if (vrHook) { vrHook.menu(); return; }
      overlayCard.replaceChildren(el('h2', '', t('labTitle')), el('p', '', t('labIntro')));
      const rows: { key: TextKey; kind: 'real' | 'hist'; info: { source: string; date: string; url: string } }[] = [
        { key: 'lab_donki', kind: 'real', info: DONKI },
        { key: 'lab_radlab', kind: 'real', info: { source: 'NASA OSDR RadLab', date: radDay, url: radUrl } },
        { key: 'lab_osdr', kind: 'real', info: { source: 'NASA OSDR', date: '2026-11-14', url: 'https://osdr.nasa.gov/bio/repo/' } },
        { key: 'lab_alsj', kind: 'hist', info: { source: 'Apollo Lunar Surface Journal', date: '1972', url: 'https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html' } },
      ];
      for (const r of rows) { const p = el('p', ''); p.append(badge(r.kind, r.info), document.createTextNode(' ' + t(r.key))); overlayCard.appendChild(p); }
      overlayCard.appendChild(el('p', 'src', t('lab_notused')));
      overlayCard.appendChild(el('p', '', t('logCount', { n: collected.size, m: CARD_IDS.length })));
      const log = el('button', 'close', t('btnLog'));
      log.addEventListener('click', () => ui.missionLog());
      const b = el('button', 'main', t('btnClose'));
      b.addEventListener('click', closeOverlay);
      overlayCard.append(log, b);
      overlayCard.scrollTop = 0;
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },

    // Mission Log: the data cards found so far, each with its source.
    missionLog(): void {
      if (vrHook) { vrHook.menu(); return; }
      overlayCard.replaceChildren(el('h2', '', t('logTitle')), el('p', '', t('logCount', { n: collected.size, m: CARD_IDS.length })));
      for (const id of CARD_IDS) {
        const row = el('div', 'logRow');
        if (collected.has(id)) {
          const c = snaps.get(id) ?? cardInfo(id);
          const head = el('b', '', c.title + ' ');
          head.appendChild(badge(c.kind, { source: c.source, date: c.date, url: c.url }));
          row.append(head, el('div', '', c.line));
        } else row.append(el('b', '', '???'), el('div', '', t('logLocked')));
        overlayCard.appendChild(row);
      }
      const rp = el('button', 'close', t('cine_replay', { title: t('cine_title') }));
      rp.addEventListener('click', () => { closeOverlay(); window.dispatchEvent(new CustomEvent('outpost:cine', { detail: 'stormForming' })); });
      const b = el('button', 'main', t('btnClose'));
      b.addEventListener('click', closeOverlay);
      overlayCard.append(rp, b);
      overlayCard.scrollTop = 0;
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },

    credits(): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      ui.card({ title: t('creditsTitle'), paragraphs: [t('creditsAssets'), t('creditsData'), t('creditsOwn')], button: t('btnClose') });
    },

    popup(text: string): void {
      const p = el('div', 'popup', text);
      $('popups').appendChild(p);
      setTimeout(() => p.remove(), 1600);
    },

    gainText: (r: Reward): string => gainText(r),

    setPlacing(active: boolean, ok: boolean): void {
      document.body.classList.toggle('placing', active);
      if (!active) return;
      $('placeBtn').classList.toggle('bad', !ok);
      $('placeHint').textContent = t(ok ? 'placeHint' : 'placeBad');
    },

    toast(text: string, kind: '' | 'good' | 'bad' | 'bot' = ''): void {
      vrHook?.toast(text);
      const box = $('toasts');
      const n = el('div', `toast ${kind}`, text);
      box.appendChild(n);
      while (box.children.length > 3) box.firstElementChild!.remove();
      setTimeout(() => n.remove(), kind === 'bot' ? 7000 : 4500);
    },

    setVrHook(hk: VrHook | null): void { vrHook = hk; },

    openBuild(sim: SimState): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      menuKind = 'build';
      menuCard.replaceChildren(el('h2', '', t('buildTitle')), el('p', '', `${t('parts')}: ${sim.parts}`));
      let affordable = false;
      BUILDABLE.forEach((type, i) => {
        const def = cfg.modules[type];
        const b = option(i + 1, t(`mod_${type}` as TextKey), t(`modInfo_${type}` as TextKey), t('buildCost', { n: def.cost }), () => { closeMenu(); h.pickBuild(type); });
        b.disabled = sim.parts < def.cost;
        if (!b.disabled) affordable = true;
        menuCard.appendChild(b);
      });
      if (!affordable) menuCard.appendChild(el('p', 'note', t('buildNoParts')));
      menuCard.append(closer(), el('p', 'keys', t('menuKeys')));
      menu.classList.add('on');
      focusFirst(menuCard);
    },

    // Two steps: pick who, then pick what. `only` jumps straight to one crew member.
    openCrew(sim: SimState, activities: string[], only: number | null = null): void {
      if (vrHook) { vrHook.crew(only); return; }
      menuKind = 'crew';
      const who = () => {
        menuCard.replaceChildren(el('h2', '', t('crewPick')));
        sim.crew.forEach((c, i) => {
          const doing = c.chore ? t(`task_${c.chore}` as TextKey) : t(`act_${activities[i]}` as TextKey);
          menuCard.appendChild(option(i + 1, c.name, doing, '', () => what(i), !!c.chore));
        });
        menuCard.append(closer(), el('p', 'keys', t('menuKeys')));
        focusFirst(menuCard);
      };
      const what = (i: number) => {
        const c = sim.crew[i];
        menuCard.replaceChildren(el('h2', '', t('crewDo', { name: c.name })));
        // Tasks that are waiting as jobs come first, then the rest.
        const waiting = new Set(sim.jobs.map((j) => j.task));
        const list = crewOptions(sim, cfg).sort((x, y) => Number(waiting.has(y.id)) - Number(waiting.has(x.id))).slice(0, 5);
        if (list.length === 0) menuCard.appendChild(el('p', 'note', t('crewNoOptions')));
        list.forEach((tk, n) => {
          const secs = Math.round(tk.seconds / taskSpeed(sim, cfg));
          const gain = gainText(scaled(tk.reward, cfg.crewRewardShare));
          menuCard.appendChild(option(n + 1, t(`task_${tk.id}` as TextKey), t('crewTaskInfo', { s: secs, gain }), '', () => { h.assign(i, tk.id); closeMenu(); }, c.chore === tk.id));
        });
        menuCard.appendChild(option(list.length + 1, t('choreRest'), '', '', () => { h.assign(i, null); closeMenu(); }, c.chore === null));
        menuCard.append(closer(t('btnBack'), only === null ? who : closeMenu), el('p', 'keys', t('menuKeys')));
        focusFirst(menuCard);
      };
      if (only === null) who(); else what(only);
      menu.classList.add('on');
    },

    // Engineering console: spend research points on machine levels (Mk1 to Mk3).
    openUpgrades(sim: SimState): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      menuKind = 'upgrade';
      const draw = () => {
        menuCard.replaceChildren(el('h2', '', t('upTitle')), el('p', '', t('upResearch', { n: sim.research })));
        UPGRADES.forEach((key, i) => {
          const lvl = sim.levels[key];
          const cost = upgradeCost(sim, cfg, key);
          const sub = t(`upDesc_${key}_${cost === null ? 3 : lvl + 1}` as TextKey);
          const title = `${t(`up_${key}` as TextKey)} · ${t('upLevel', { n: lvl })}`;
          const b = option(i + 1, title, sub, cost === null ? t('upMax') : t('upCost', { n: cost }), () => { h.upgrade(key); draw(); });
          b.disabled = cost === null || sim.research < cost;
          menuCard.appendChild(b);
        });
        if (UPGRADES.every((k) => { const c = upgradeCost(sim, cfg, k); return c === null || sim.research < c; })) menuCard.appendChild(el('p', 'note', t('upNeed')));
        menuCard.append(closer(), el('p', 'keys', t('menuKeys')));
        focusFirst(menuCard);
      };
      draw();
      menu.classList.add('on');
    },

    openPause(): void {
      if (vrHook) { vrHook.menu(); return; }
      menuKind = 'pause';
      menuCard.replaceChildren(el('h2', '', t('pauseTitle')));
      const resume = el('button', 'main', t('btnResume'));
      resume.addEventListener('click', closeMenu);
      menuCard.appendChild(resume);
      menuCard.appendChild(option(1, t('btnMC'), '', '', () => { closeMenu(); h.mc(); }));
      menuCard.appendChild(option(1, t('btnLab'), t('badgeReal'), '', () => { closeMenu(); ui.dataLab(); }));
      menuCard.appendChild(option(2, t('btnLog'), t('logCount', { n: collected.size, m: CARD_IDS.length }), '', () => { closeMenu(); ui.missionLog(); }));
      menuCard.appendChild(option(3, t('qualityLabel', { q: t(`q_${h.quality()}` as TextKey) }), '', '', () => { h.cycleQuality(); ui.openPause(); }));
      menuCard.appendChild(option(4, t('fpsLabel', { s: t(h.fps() ? 'on' : 'off') }), '', '', () => { h.toggleFps(); ui.openPause(); }));
      menuCard.appendChild(option(5, t('btnLang'), '', '', () => h.toggleLanguage()));
      menuCard.appendChild(option(6, t('btnRestart'), '', '', () => h.restart()));
      menuCard.appendChild(option(7, t('btnCredits'), '', '', () => { closeMenu(); ui.credits(); }));
      menuCard.appendChild(option(8, t('btnMars'), '', '', () => { location.href = location.pathname + '?mars=1'; }));
      menuCard.appendChild(el('p', 'keys', `${t('hintDesktop')} · ${t('menuKeys')}`));
      menu.classList.add('on');
      resume.focus({ preventScroll: true });
    },

    // Menu info screen: what is real NASA data, what is historical context, and what is made up for the game.
    dataCard(): void {
      if (vrHook) { vrHook.note('vrNoDesktop'); return; }
      overlayCard.replaceChildren(el('h2', '', t('dataTitle')));
      overlayCard.appendChild(el('p', '', t('sourceCardText')));
      overlayCard.appendChild(el('p', '', t('dataEvent', { ar: solarEvent.activeRegionNum })));
      const rows: [string, string][] = [
        ...solarEvent.flares.map((f): [string, string] => [f.beginTime, t('dataFlare', { time: utc(f.beginTime), cls: f.classType })]),
        ...solarEvent.cmes.map((c): [string, string] => [c.startTime, t('dataCme', { time: utc(c.startTime), speed: c.speedKmS ?? '?' })]),
        ...solarEvent.seps.filter((s) => s.instrument.startsWith('GOES')).map((s): [string, string] => [s.eventTime, t('dataSep', { time: utc(s.eventTime), instrument: s.instrument })]),
        ...solarEvent.gsts.map((g): [string, string] => [g.startTime, t('dataGst', { time: utc(g.startTime), kp: g.maxKp })]),
      ];
      const ul = el('ul');
      for (const [, text] of rows.sort((a, b) => a[0].localeCompare(b[0]))) ul.appendChild(el('li', '', text));
      overlayCard.appendChild(ul);
      overlayCard.appendChild(el('p', '', t('dataCompress')));
      overlayCard.appendChild(el('p', '', t('dataGame')));
      overlayCard.appendChild(el('p', 'src', `${t('dataQuality')} ${t('dataDownloaded', { date: meta.downloadDate, url: meta.sourcePage })}`));
      overlayCard.appendChild(el('h2', '', t('apolloTitle')));
      const [lo, hi] = apollo.quietDoseRateMradPerHour;
      overlayCard.appendChild(el('p', '', t('apollo1')));
      overlayCard.appendChild(el('p', '', t('apollo2', { skin: apollo.aug1972SkinDoseRem, bfo: apollo.aug1972BloodFormingOrgansRem })));
      overlayCard.appendChild(el('p', '', t('apollo3', { lo, hi, avg: apollo.averageMissionSkinDoseRad })));
      overlayCard.appendChild(el('p', '', t('apollo4')));
      overlayCard.appendChild(el('p', '', t('apolloMeter', { bfo: FULL_METER_REM })));
      overlayCard.appendChild(el('p', 'src', t('apolloSource')));
      const b = el('button', 'main', t('btnClose'));
      b.addEventListener('click', closeOverlay);
      overlayCard.appendChild(b);
      overlayCard.scrollTop = 0;
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },

    card(opts: CardOpts): void {
      if (vrHook) { vrHook.card(opts.title, [...(opts.paragraphs ?? []), ...(opts.list ?? []), ...(opts.source ? [opts.source] : [])], opts.button, opts.onClose); return; }
      overlayCard.replaceChildren(el('h2', '', opts.title));
      for (const p of opts.paragraphs ?? []) overlayCard.appendChild(el('p', '', p));
      if (opts.list) {
        const ul = el('ul');
        for (const li of opts.list) ul.appendChild(el('li', '', li));
        overlayCard.appendChild(ul);
      }
      if (opts.source) overlayCard.appendChild(el('p', 'src', opts.source));
      const b = el('button', 'main', opts.button);
      b.addEventListener('click', () => { closeOverlay(); opts.onClose?.(); });
      overlayCard.appendChild(b);
      for (const x of opts.extra ?? []) overlayCard.appendChild(closer(x.label, x.onClick));
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },

    end(sim: SimState, onAgain: () => void, extra?: { title?: string; label: string; onClick: () => void }): void {
      if (vrHook) { const won = sim.status === 'won'; vrHook.card(t(won ? 'winTitle' : 'loseTitle'), [won ? t('winBody', { rank: t(`rank${stars(sim)}` as TextKey) }) : t(`lose_${sim.failCause}` as TextKey)], t('btnAgain'), onAgain); return; }
      closeMenu();
      const won = sim.status === 'won';
      overlayCard.replaceChildren(el('h2', '', won && extra?.title ? extra.title : t(won ? 'winTitle' : 'retryTitle')));
      if (won) {
        const n = stars(sim);
        overlayCard.appendChild(el('div', 'stars', '★'.repeat(n) + '☆'.repeat(3 - n)));
        overlayCard.appendChild(el('p', '', t('winBody', { rank: t(`rank${n}` as TextKey) })));
      } else {
        const st = sim.stats;
        const cause = sim.failCause!;
        overlayCard.appendChild(el('p', '', t(`lose_${cause}` as TextKey)));
        let why: string;
        if (cause === 'air') {
          why = st.powerOutS > 15 ? t('why_airPower', { s: Math.round(st.powerOutS) })
            : st.lifeSupportDownS > 20 ? t('why_airBroken', { s: Math.round(st.lifeSupportDownS) }) : t('why_airUse');
        } else if (cause === 'food') {
          why = st.greenhouseDownS > 25 ? t('why_foodBroken', { s: Math.round(st.greenhouseDownS) }) : t('why_foodUse');
        } else {
          why = t('why_radiation', { s: Math.round(st.exposedS) });
        }
        overlayCard.appendChild(el('p', 'why', why));
        const hintKey: TextKey = cause === 'radiation' ? (sim.budget.shield < 25 ? 'hint_shield' : 'hint_science') : cause === 'food' ? 'hint_food' : sim.budget.life < 30 ? 'hint_life' : sim.budget.science > 35 ? 'hint_science' : 'hint_life';
        overlayCard.appendChild(el('p', '', t('retryHint', { p: t(hintKey) })));
      }
      overlayCard.appendChild(el('p', '', `${t('reportTitle')}: ${t('reportStats', { t: mmss(sim.time), fixes: sim.stats.fixes + sim.stats.jobs + sim.stats.crewTasks, builds: sim.stats.builds })}`));
      overlayCard.appendChild(drawChart(sim, cfg));
      overlayCard.appendChild(el('h2', '', t('endRealTitle')));
      const rg = el('p', '');
      rg.append(badge('real'), document.createTextNode(' ' + t('endReal')));
      const gm = el('p', '');
      gm.append(badge('game'), document.createTextNode(' ' + t('endGame')));
      overlayCard.append(rg, gm, el('p', '', t('logCount', { n: collected.size, m: CARD_IDS.length })));
      overlayCard.appendChild(el('p', 'src', t('creditsLine')));
      const b = el('button', 'main', t('btnAgain'));
      b.addEventListener('click', onAgain);
      overlayCard.appendChild(b);
      if (extra) { const x = el('button', 'close', extra.label); x.addEventListener('click', extra.onClick); overlayCard.appendChild(x); }
      overlay.classList.add('on');
      b.focus({ preventScroll: true });
    },
  };
  return ui;
}

export type Ui = ReturnType<typeof createUi>;

// Resource history over the run, with the storm windows shaded.
function drawChart(sim: SimState, cfg: LevelConfig): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 220;
  const g = c.getContext('2d')!;
  const L = 34, R = 630, T = 26, B = 200;
  const x = (time: number) => L + (time / cfg.missionLength) * (R - L);
  const y = (pct: number) => B - (pct / 100) * (B - T);
  g.fillStyle = '#ff6b5a2e';
  for (const d of cfg.storms) g.fillRect(x(d.startAt), T, x(d.startAt + d.duration) - x(d.startAt), B - T);
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1;
  g.fillStyle = '#ffffff99'; g.font = '11px system-ui, sans-serif'; g.textAlign = 'right';
  for (const p of [0, 50, 100]) {
    g.beginPath(); g.moveTo(L, y(p)); g.lineTo(R, y(p)); g.stroke();
    g.fillText(String(p), L - 5, y(p) + 4);
  }
  g.textAlign = 'left';
  BARS.forEach((b, i) => {
    g.strokeStyle = b.color; g.lineWidth = 2.5; g.beginPath();
    sim.history.forEach((row, n) => { const v = b.key === 'protect' ? 100 - row[4] : row[i + 1]; const px = x(row[0]), py = y(v); if (n) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
    g.fillStyle = b.color;
    g.fillText(t(b.key), L + i * 140, 14);
  });
  return c;
}
