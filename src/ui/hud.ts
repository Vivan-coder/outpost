import type { LevelConfig, SimState } from '../sim/sim';
import { t, type TextKey } from '../i18n/en';

interface Bar { fill: HTMLElement; value: HTMLElement; row: HTMLElement; last: number }

const ROWS: { key: TextKey; color: string }[] = [
  { key: 'power', color: '#ffd24a' },
  { key: 'air', color: '#5ad1ff' },
  { key: 'food', color: '#7be07b' },
  { key: 'radiation', color: '#ff6b5a' },
];

// Suit HUD: four bars. Updated from the sim tick, not every frame.
export function createHud(cfg: LevelConfig): { update(s: SimState): void } {
  const root = document.getElementById('hud') as HTMLElement;
  const bars = {} as Record<string, Bar>;
  for (const r of ROWS) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="label"></span><span class="track"><i></i></span><span class="value"></span>`;
    (row.querySelector('.label') as HTMLElement).textContent = t(r.key);
    const fill = row.querySelector('i') as HTMLElement;
    fill.style.background = r.color;
    root.appendChild(row);
    bars[r.key] = { fill, value: row.querySelector('.value') as HTMLElement, row, last: -1 };
  }

  const set = (key: string, v: number, cap: number, lowIsBad: boolean) => {
    const b = bars[key];
    const pct = Math.round((v / cap) * 100);
    if (pct === b.last) return;
    b.last = pct;
    b.fill.style.width = pct + '%';
    b.value.textContent = String(pct);
    b.row.classList.toggle('warn', lowIsBad ? pct <= 25 : pct >= 60);
  };

  return {
    update(s) {
      set('power', s.power, cfg.resources.power.cap, true);
      set('air', s.air, cfg.resources.air.cap, true);
      set('food', s.food, cfg.resources.food.cap, true);
      set('radiation', s.radiation, 100, false);
    },
  };
}
