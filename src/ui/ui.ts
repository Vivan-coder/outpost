import { caps, crewOptions, goalProgress, stars, taskSpeed, upgradeCost, type LevelConfig, type ModuleType, type Reward, type SimState, type TaskId, type UpgradeKey } from '../sim/sim.ts';
import factsJson from '../data/facts.json' with { type: 'json' };
import { solarEvent } from '../data/moon.ts';
import { apollo, FULL_METER_REM } from '../data/apollo.ts';
import meta from '../data/solar-event.meta.json' with { type: 'json' };
import { t, type TextKey } from '../i18n/en';
import { GAUGE_ZONE, type TaskRunner } from '../game/tasks';

export interface UiHandlers {
  pickBuild(type: ModuleType): void;
  place(): void;
  cancelPlace(): void;
  actDown(): void; // touch action button pressed
  seqPress(n: number): void;
  assign(crewIndex: number, task: TaskId | null): void;
  upgrade(key: UpgradeKey): void;
  callShelter(): void;
  toggleLanguage(): void;
  restart(): void;
  click(): void;
}

interface Bar { fill: HTMLElement; value: HTMLElement; row: HTMLElement; last: number }
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

const BARS: { key: 'power' | 'air' | 'food' | 'radiation' | 'health'; color: string; icon: string }[] = [
  { key: 'power', color: '#ffd24a', icon: '⚡' },
  { key: 'air', color: '#5ad1ff', icon: '💧' },
  { key: 'food', color: '#7be07b', icon: '🌱' },
  { key: 'health', color: '#c77dff', icon: '❤' },
  { key: 'radiation', color: '#ff6b5a', icon: '☢' },
];
const UPGRADES: UpgradeKey[] = ['engineering', 'solar', 'lifeSupport', 'greenhouse', 'battery', 'tank', 'station'];
export const factText = (id: string | null): string | null => (id && (factsJson.facts as Record<string, unknown>)[id] ? t(('fact_' + id) as TextKey) : null);

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
    row.append(el('span', 'label', `${b.icon} ${t(b.key === 'health' ? 'res_health' : b.key)}`), track, value);
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

  const menu = $('menu'), menuCard = $('menuCard'), overlay = $('overlay'), overlayCard = $('overlayCard');
  const banner = $('banner'), shelterBtn = $('shelterBtn'), storm = $('storm');
  const actBtn = $('actBtn'), taskBox = $('task'), seq = $('seq'), gauge = $('gauge');
  let flashText = '', flashUntil = 0, lastBanner = '', lastJobs = null as string | null, lastPrompt = '', lastTask = '', lastGoals = '';
  let menuKind: 'build' | 'crew' | 'pause' | 'upgrade' | null = null;
  let goalsOpen = false, lastSim: SimState | null = null;
  const marks = new Map<string, HTMLElement>();
  let actHeld = false;

  const press = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  press('placeBtn', () => h.place());
  press('cancelBtn', () => h.cancelPlace());
  press('shelterBtn', () => h.callShelter());

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

    toggleGoals(): void { goalsOpen = !goalsOpen; lastGoals = ''; if (lastSim) ui.update(lastSim, 0, 0, true); },

    update(sim: SimState, nowS: number, crewSafe: number, _redraw = false): void {
      lastSim = sim;
      const cap = caps(sim, cfg);
      setBar('power', sim.power, cap.power, true);
      setBar('air', sim.air, cap.air, true);
      setBar('food', sim.food, cap.food, true);
      document.body.classList.toggle('lowsupply', sim.air < cap.air * 0.2 || sim.food < cap.food * 0.2 || sim.power <= 0);
      setBar('health', sim.health, 100, true);
      setBar('radiation', sim.radiation, 100, false);
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
      const box = $('toasts');
      const n = el('div', `toast ${kind}`, text);
      box.appendChild(n);
      while (box.children.length > 3) box.firstElementChild!.remove();
      setTimeout(() => n.remove(), kind === 'bot' ? 7000 : 4500);
    },

    openBuild(sim: SimState): void {
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
      menuKind = 'pause';
      menuCard.replaceChildren(el('h2', '', t('pauseTitle')));
      const resume = el('button', 'main', t('btnResume'));
      resume.addEventListener('click', closeMenu);
      menuCard.appendChild(resume);
      menuCard.appendChild(option(1, t('btnData'), t('sourceCardTitle'), '', () => { closeMenu(); ui.dataCard(); }));
      menuCard.appendChild(option(2, t('btnLang'), '', '', () => h.toggleLanguage()));
      menuCard.appendChild(option(3, t('btnRestart'), '', '', () => h.restart()));
      menuCard.appendChild(el('p', 'keys', `${t('hintDesktop')} · ${t('menuKeys')}`));
      menu.classList.add('on');
      resume.focus({ preventScroll: true });
    },

    // Menu info screen: what is real NASA data, what is historical context, and what is made up for the game.
    dataCard(): void {
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

    end(sim: SimState, onAgain: () => void): void {
      closeMenu();
      const won = sim.status === 'won';
      overlayCard.replaceChildren(el('h2', '', t(won ? 'winTitle' : 'loseTitle')));
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
      }
      overlayCard.appendChild(el('p', '', `${t('reportTitle')}: ${t('reportStats', { t: mmss(sim.time), fixes: sim.stats.fixes + sim.stats.jobs + sim.stats.crewTasks, builds: sim.stats.builds })}`));
      overlayCard.appendChild(drawChart(sim, cfg));
      overlayCard.appendChild(el('p', 'src', t('creditsLine')));
      const b = el('button', 'main', t('btnAgain'));
      b.addEventListener('click', onAgain);
      overlayCard.appendChild(b);
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
  BARS.filter((x) => x.key !== 'health').forEach((b, i) => {
    g.strokeStyle = b.color; g.lineWidth = 2.5; g.beginPath();
    sim.history.forEach((row, n) => { const px = x(row[0]), py = y(row[i + 1]); if (n) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
    g.fillStyle = b.color;
    g.fillText(t(b.key === 'health' ? 'res_health' : b.key), L + i * 140, 14);
  });
  return c;
}
