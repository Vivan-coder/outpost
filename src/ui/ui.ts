import { caps, stars, type ChoreId, type LevelConfig, type ModuleType, type SimState } from '../sim/sim.ts';
import { nasaRecords, NASA_SOURCE } from '../data/nasaStorm.ts';
import { t, type TextKey } from '../i18n/en';
import type { CrewPhase } from '../game/crew';

export interface UiHandlers {
  pickBuild(type: ModuleType): void;
  place(): void;
  cancelPlace(): void;
  fix(): void;
  assign(crewIndex: number, chore: ChoreId | null): void;
  toggleShelter(): void;
  click(): void;
}

interface Bar { fill: HTMLElement; value: HTMLElement; row: HTMLElement; last: number }

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const utc = (iso: string) => iso.replace('T', ' ').replace('Z', '');

const BARS: { key: 'power' | 'air' | 'food' | 'radiation'; color: string }[] = [
  { key: 'power', color: '#ffd24a' },
  { key: 'air', color: '#5ad1ff' },
  { key: 'food', color: '#7be07b' },
  { key: 'radiation', color: '#ff6b5a' },
];
const BUILDABLE: ModuleType[] = ['solar', 'battery', 'lifeSupport', 'tank', 'greenhouse'];
const PHASE_TEXT: Record<CrewPhase, TextKey> = {
  idle: 'crewIdle', walking: 'crewWalking', working: 'crewIdle', waiting: 'crewWaiting', sheltered: 'crewSheltered', noModule: 'crewIdle',
};

export function createUi(cfg: LevelConfig, h: UiHandlers) {
  const bars = {} as Record<string, Bar>;
  for (const b of BARS) {
    const row = el('div', 'row');
    const label = el('span', 'label', t(b.key));
    const track = el('span', 'track');
    const fill = el('i');
    fill.style.background = b.color;
    track.appendChild(fill);
    const value = el('span', 'value');
    row.append(label, track, value);
    $('bars').appendChild(row);
    bars[b.key] = { fill, value, row, last: -1 };
  }
  $('partsLabel').textContent = t('parts');
  $('buildBtn').textContent = t('btnBuild');
  $('crewBtn').textContent = t('btnCrew');
  $('fixBtn').textContent = t('btnFix');
  $('jump').textContent = t('btnJump');
  $('placeBtn').textContent = t('btnPlace');
  $('cancelBtn').textContent = t('btnCancel');

  const menu = $('menu'), menuCard = $('menuCard'), overlay = $('overlay'), overlayCard = $('overlayCard');
  const banner = $('banner'), shelterBtn = $('shelterBtn'), storm = $('storm');
  let flashText = '', flashUntil = 0, lastBanner = '';
  let menuKind: 'build' | 'crew' | null = null;

  const press = (id: string, fn: () => void) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  press('fixBtn', () => h.fix());
  press('placeBtn', () => h.place());
  press('cancelBtn', () => h.cancelPlace());
  press('shelterBtn', () => h.toggleShelter());

  const setBar = (key: string, v: number, cap: number, lowIsBad: boolean) => {
    const b = bars[key];
    const pct = Math.round((v / cap) * 100);
    if (pct === b.last) return;
    b.last = pct;
    b.fill.style.width = pct + '%';
    b.value.textContent = String(pct);
    b.row.classList.toggle('warn', lowIsBad ? pct <= 25 : pct >= 60);
  };

  const closeMenu = () => { menu.classList.remove('on'); menuKind = null; };

  const ui = {
    blocking: () => menu.classList.contains('on') || overlay.classList.contains('on'),
    menuOpen: () => menuKind,
    closeMenu,

    update(sim: SimState, nowS: number): void {
      const cap = caps(sim, cfg);
      setBar('power', sim.power, cap.power, true);
      setBar('air', sim.air, cap.air, true);
      setBar('food', sim.food, cap.food, true);
      setBar('radiation', sim.radiation, 100, false);
      $('partsValue').textContent = String(sim.parts);
      $('sol').textContent = t('sol', { n: Math.floor(sim.time / cfg.solLength) + 1 });
      $('timeLeft').textContent = t('timeLeft', { t: mmss(Math.max(0, cfg.missionLength - sim.time)) });

      // Banner: a storm always wins over a temporary message.
      let html = '', cls = '';
      if (sim.storm) {
        const d = cfg.storms[sim.storm.index];
        const rec = nasaRecords[d.recordId];
        const src = t('stormSource', { date: utc(rec.timeUtc), instrument: rec.instrument, source: NASA_SOURCE });
        if (sim.storm.phase === 'warning') {
          html = `${t('stormWarn', { s: Math.ceil(d.startAt - sim.time) })}<small>${src}</small>`;
        } else {
          const safe = sim.playerSheltered;
          html = `${t('stormActive', { s: Math.ceil(d.startAt + d.duration - sim.time) })}` +
            `<span class="state ${safe ? 'good' : 'bad'}">${t(safe ? 'safe' : 'exposed')}</span><small>${src}</small>`;
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

      const showShelter = !!sim.storm || sim.shelterCall;
      shelterBtn.style.display = showShelter ? 'block' : 'none';
      if (showShelter) {
        shelterBtn.textContent = t(sim.shelterCall ? 'btnAllClear' : 'btnShelter');
        shelterBtn.classList.toggle('clear', sim.shelterCall);
        shelterBtn.style.top = `${banner.offsetHeight + 18}px`;
      }
      const active = sim.storm?.phase === 'active';
      storm.className = active ? (sim.playerSheltered ? 'on' : 'on exposed') : '';
    },

    flash(text: string, nowS: number, seconds: number): void { flashText = text; flashUntil = nowS + seconds; },

    setFix(on: boolean): void { $('fixBtn').classList.toggle('on', on); },

    setPlacing(active: boolean, ok: boolean): void {
      document.body.classList.toggle('placing', active);
      if (!active) return;
      $('placeBtn').classList.toggle('bad', !ok);
      $('placeHint').textContent = t(ok ? 'placeHint' : 'placeBad');
    },

    toast(text: string, kind: '' | 'good' | 'bad' = ''): void {
      const box = $('toasts');
      const n = el('div', `toast ${kind}`, text);
      box.appendChild(n);
      while (box.children.length > 3) box.firstElementChild!.remove();
      setTimeout(() => n.remove(), 4500);
    },

    openBuild(sim: SimState): void {
      menuKind = 'build';
      menuCard.replaceChildren(el('h2', '', t('buildTitle')));
      const info = el('p', '', `${t('parts')}: ${sim.parts}`);
      menuCard.appendChild(info);
      let affordable = false;
      for (const type of BUILDABLE) {
        const def = cfg.modules[type];
        const b = el('button', 'opt');
        b.append(el('b', '', t(`mod_${type}` as TextKey)), el('em', '', t('buildCost', { n: def.cost })), el('span', '', t(`modInfo_${type}` as TextKey)));
        b.disabled = sim.parts < def.cost;
        if (!b.disabled) affordable = true;
        b.addEventListener('click', () => { h.click(); closeMenu(); h.pickBuild(type); });
        menuCard.appendChild(b);
      }
      if (!affordable) menuCard.appendChild(el('p', 'note', t('buildNoParts')));
      const close = el('button', 'close', t('btnClose'));
      close.addEventListener('click', closeMenu);
      menuCard.appendChild(close);
      menu.classList.add('on');
    },

    openCrew(sim: SimState, phases: CrewPhase[]): void {
      menuKind = 'crew';
      const render = () => {
        menuCard.replaceChildren(el('h2', '', t('crewTitle')));
        sim.crew.forEach((c, i) => {
          const row = el('div', 'crewRow');
          const head = el('h3', '', c.name);
          const status = sim.shelterCall ? t('crewSheltered') : c.chore ? t(`chore_${c.chore}` as TextKey) : t(PHASE_TEXT[phases[i]]);
          head.appendChild(el('small', '', status));
          row.appendChild(head);
          const chips = el('div', 'chips');
          for (const ch of cfg.chores) {
            const b = el('button', `chip${c.chore === ch.id ? ' on' : ''}`, t(`chore_${ch.id}` as TextKey));
            b.appendChild(el('small', '', t(`choreGain_${ch.id}` as TextKey)));
            b.addEventListener('click', () => { h.click(); h.assign(i, ch.id); render(); });
            chips.appendChild(b);
          }
          const rest = el('button', `chip${c.chore === null ? ' on' : ''}`, t('choreRest'));
          rest.addEventListener('click', () => { h.click(); h.assign(i, null); render(); });
          chips.appendChild(rest);
          row.appendChild(chips);
          menuCard.appendChild(row);
        });
        const close = el('button', 'close', t('btnClose'));
        close.addEventListener('click', closeMenu);
        menuCard.appendChild(close);
      };
      render();
      menu.classList.add('on');
    },

    card(opts: { title: string; paragraphs?: string[]; list?: string[]; source?: string; button: string; onClose?: () => void }): void {
      overlayCard.replaceChildren(el('h2', '', opts.title));
      for (const p of opts.paragraphs ?? []) overlayCard.appendChild(el('p', '', p));
      if (opts.list) {
        const ul = el('ul');
        for (const li of opts.list) ul.appendChild(el('li', '', li));
        overlayCard.appendChild(ul);
      }
      if (opts.source) overlayCard.appendChild(el('p', 'src', opts.source));
      const b = el('button', 'main', opts.button);
      b.addEventListener('click', () => { overlay.classList.remove('on'); opts.onClose?.(); });
      overlayCard.appendChild(b);
      overlay.classList.add('on');
    },

    end(sim: SimState, onAgain: () => void): void {
      closeMenu();
      const won = sim.status === 'won';
      overlayCard.replaceChildren(el('h2', '', t(won ? 'winTitle' : 'loseTitle')));
      if (won) {
        const n = stars(sim, cfg);
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
      overlayCard.appendChild(el('p', '', `${t('reportTitle')}: ${t('reportStats', { t: mmss(sim.time), fixes: sim.stats.fixes, builds: sim.stats.builds })}`));
      overlayCard.appendChild(drawChart(sim, cfg));
      overlayCard.appendChild(el('p', 'src', t('creditsLine')));
      const b = el('button', 'main', t('btnAgain'));
      b.addEventListener('click', onAgain);
      overlayCard.appendChild(b);
      overlay.classList.add('on');
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
    sim.history.forEach((row, n) => { const px = x(row[0]), py = y(row[i + 1]); if (n) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
    g.fillStyle = b.color;
    g.fillText(t(b.key), L + i * 150, 14);
  });
  return c;
}
