import * as THREE from 'three';
import timeline from './trailer.timeline.json';
import { t } from '../i18n/en';
import type { LevelConfig, SimState } from '../sim/sim.ts';
import type { Player } from '../game/player';
import type { Crew } from '../game/crew';
import type { WorkSession } from '../game/work';

// Trailer director. Only loaded with ?trailer=1. It does not change game rules: it calls the game's own
// functions (intro, cutscene, Mission Control, hands-on task, crew order, shelter, evening report) at the times in
// trailer.timeline.json, glides the camera between planned positions, and draws the captions as an HTML overlay.
// The recorder calls window.__trailerStart(); the page shows a magenta frame for 0.3 s first so the video can be trimmed exactly.
export interface DirectorApi {
  sim: SimState; level: LevelConfig; player: Player; crew: Crew; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement;
  input: { state: unknown };
  ctrl: {
    warm(): void; intro(on: boolean): void; title(on: boolean, tag?: string): void; introActive(): boolean;
    storm(speed: number, after?: () => void): void; cine(): boolean;
    briefing(): void; startSolar(): void; work(): WorkSession | null;
    openCrew(i: number): void; closeMenus(): void; key(code: string): void; callShelter(): void; blocking(): boolean;
    shelterAt(): { x: number; z: number; r: number };
  };
}

type Ev = { t: number; do: string; [k: string]: unknown };
const ease = (u: number) => u * u * (3 - 2 * u);
const catmull = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

export function createDirector(api: DirectorApi): void {
  const { sim, player, camera, canvas, ctrl } = api;
  const log: string[] = [];
  const w = window as unknown as Record<string, unknown>;
  w.__trailerLog = log;
  ctrl.warm();
  w.__trailerReady = true;

  // ---- captions: big, high contrast, on the page (no video filters, no fonts to install) ----
  const cap = document.createElement('div');
  cap.id = 'trCaption';
  document.body.appendChild(cap);
  const sync = document.createElement('div');
  sync.id = 'trSync';

  const caps = timeline.captions;
  const events: Ev[] = (timeline.events as Ev[]).map((e) => ({ ...e }));
  const fired = new Set<Ev>();
  const keys = timeline.camera;
  let t0 = 0, running = false, tween: { el: HTMLInputElement; from: number; to: number; t: number; dur: number } | null = null;
  let solar: { phase: string; t: number; s: number; pass: number; sampleI: number } | null = null;

  const camAt = (time: number): { pos: THREE.Vector3; yaw: number; pitch: number } | null => {
    if (time < keys[0].t) return null;
    let i = 0;
    while (i < keys.length - 2 && time >= keys[i + 1].t) i++;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[Math.min(keys.length - 1, i + 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = Math.max(0, Math.min(1, (time - k1.t) / Math.max(0.001, k2.t - k1.t)));
    const e = ease(u) * 0.6 + u * 0.4; // gentle ease, keeps moving between keys
    const c = (a: number, b: number, d: number, f: number) => catmull(a, b, d, f, e);
    return {
      pos: new THREE.Vector3(c(k0.pos[0], k1.pos[0], k2.pos[0], k3.pos[0]), c(k0.pos[1], k1.pos[1], k2.pos[1], k3.pos[1]), c(k0.pos[2], k1.pos[2], k2.pos[2], k3.pos[2])),
      yaw: c(k0.yaw, k1.yaw, k2.yaw, k3.yaw), pitch: c(k0.pitch, k1.pitch, k2.pitch, k3.pitch),
    };
  };

  // ---- hands-on solar cleaning: drive the real work session like a hand would ----
  const ndcOf = (local: THREE.Vector3, work: WorkSession): THREE.Vector2 => {
    const p = local.clone(); work.group.localToWorld(p); p.project(camera);
    return new THREE.Vector2(p.x, p.y);
  };
  const ROWS = 9, SAMPLES = 700;
  const sweepPoint = (s: number, pass: number): THREE.Vector3 => {
    const row = Math.min(ROWS - 1, Math.floor(s * ROWS));
    const within = s * ROWS - row;
    const x = (row % 2 === 0 ? -1 + 2 * within : 1 - 2 * within) * 2.55;
    const y = 0.3 + 0.5 - (row + (pass % 2) * 0.5) * (1.0 / (ROWS - 1)) ;
    return new THREE.Vector3(x, y, 0.09);
  };
  const stepSolar = (dt: number, time: number): void => {
    if (!solar) return;
    const work = ctrl.work();
    if (solar.phase === 'start') { if (work) { solar.phase = 'fade'; solar.t = 0; } return; }
    if (!work) { if (solar.phase !== 'start') { log.push(`solar finished at ${time.toFixed(2)}`); solar = null; } return; }
    solar.t += dt;
    if (solar.phase === 'fade' && solar.t > 0.3) { work.selectIndex(4); solar.phase = 'tool'; solar.t = 0; return; } // brush
    if (solar.phase === 'tool' && solar.t > 0.2) { solar.phase = 'sweep'; solar.t = 0; solar.s = 0; solar.sampleI = 0; work.pointerDown(ndcOf(sweepPoint(0, solar.pass), work), camera); return; }
    if (solar.phase === 'sweep') {
      const dur = solar.pass === 0 ? 1.4 : 0.8;
      const target = Math.min(SAMPLES, Math.round((solar.t / dur) * SAMPLES));
      while (solar.sampleI < target) { solar.sampleI++; work.pointerMove(ndcOf(sweepPoint(solar.sampleI / SAMPLES, solar.pass), work), camera); work.update(0.0001); }
      if (solar.sampleI >= SAMPLES) { work.pointerUp(); solar.phase = 'check'; solar.t = 0; }
    } else if (solar.phase === 'check' && solar.t > 0.05) {
      if (work.view().pct >= 95) { solar.phase = 'test'; solar.t = 0; } else { solar.pass++; solar.phase = 'tool'; solar.t = 0.2; log.push('extra pass'); }
    } else if (solar.phase === 'test' && solar.t > 0.15) {
      const p = ndcOf(new THREE.Vector3(0, -0.8, 0.2), work);
      work.pointerMove(p, camera); work.pointerDown(p, camera); work.pointerUp(); solar.phase = 'tested'; solar.t = 0;
    }
  };

  const doEvent = (e: Ev, time: number): boolean => {
    switch (e.do) {
      case 'intro': ctrl.intro(true); return true;
      case 'title': ctrl.title(!!e.on, e.tag as string | undefined); return true;
      case 'introEnd': ctrl.intro(false); return true;
      case 'storm': {
        const total = 14.5; // seconds of the full cutscene at normal speed
        ctrl.storm(total / (e.seconds as number)); return true;
      }
      case 'briefing': ctrl.briefing(); return true;
      case 'slider': {
        const el = document.querySelectorAll<HTMLInputElement>('#overlayCard input[type=range]')[['life', 'shield', 'comms', 'science'].indexOf(e.key as string)];
        if (el) tween = { el, from: Number(el.value), to: e.to as number, t: 0, dur: e.dur as number };
        else log.push(`slider ${e.key} not found at ${time.toFixed(2)}`);
        return true;
      }
      case 'startDay': {
        const b = [...document.querySelectorAll<HTMLButtonElement>('#overlayCard button')].find((x) => x.textContent === t('mcStartDay'));
        if (b) b.click(); else log.push('start button not found');
        return true;
      }
      case 'solar': ctrl.startSolar(); solar = { phase: 'start', t: 0, s: 0, pass: 0, sampleI: 0 }; return true;
      case 'openCrew': if (e.requires === 'noWork' && (ctrl.work() || solar)) return false; ctrl.openCrew(e.i as number); return true;
      case 'key': ctrl.key(e.code as string); return true;
      case 'closeMenus': ctrl.closeMenus(); return true;
      case 'sim': {
        if (e.day !== undefined) sim.day = e.day as number;
        if (e.time !== undefined) sim.time = e.time as number;
        return true;
      }
      case 'done': w.__trailerDone = true; running = false; cap.style.opacity = '0'; return true;
    }
    return true;
  };

  let last = 0;
  const tick = (now: number): void => {
    requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const time = (performance.now() - t0) / 1000;
    for (const e of events) if (!fired.has(e) && time >= e.t) { const p0 = performance.now(); if (doEvent(e, time)) fired.add(e); const ms = performance.now() - p0; if (ms > 15) log.push(`event ${e.do} took ${ms.toFixed(0)} ms at ${time.toFixed(2)}`); }
    if (tween) {
      tween.t += dt;
      const u = Math.min(1, tween.t / tween.dur);
      const v = Math.round((tween.from + (tween.to - tween.from) * ease(u)) / 5) * 5;
      if (Number(tween.el.value) !== v) { tween.el.value = String(v); tween.el.dispatchEvent(new Event('input', { bubbles: true })); }
      if (u >= 1) tween = null;
    }
    if (black.isConnected && time >= 0.35) { black.style.opacity = '0'; if (time >= 0.9) black.remove(); }
    const p1 = performance.now(); stepSolar(dt, time); const ms1 = performance.now() - p1; if (ms1 > 15) log.push(`solar step ${solar?.phase} took ${ms1.toFixed(0)} ms at ${time.toFixed(2)}`);
    const shot = timeline.shots.find((x) => time >= x.start && time < x.end);
    if (shot && document.body.dataset.shot !== shot.id) document.body.dataset.shot = shot.id;
    const c = caps.find((x) => time >= x.start && time < x.end);
    if (c) { if (cap.textContent !== c.text) cap.textContent = c.text; cap.style.opacity = String(Math.min(1, (time - c.start) / 0.25, (c.end - time) / 0.25)); } else cap.style.opacity = '0';
    // The game owns the camera during the opening, the cutscene and hands-on work; otherwise glide along the planned path.
    if (!ctrl.introActive() && !ctrl.cine() && !ctrl.work()) {
      const cam = camAt(time);
      if (cam) {
        player.pos.set(cam.pos.x, 0, cam.pos.z); player.yaw = cam.yaw; player.pitch = cam.pitch;
        player.update(0, api.input.state as never);
        camera.position.y = cam.pos.y; // free height for the planned path
      }
    }
  };

  // Black cover under the magenta sync frame: the first moment of the video is black, then it fades up on the title
  const black = document.createElement('div');
  black.style.cssText = 'position:fixed;inset:0;background:#000;z-index:150;transition:opacity .45s';
  w.__trailerStart = () => {
    document.body.appendChild(black);
    document.body.appendChild(sync);
    // The screen capture shows the page about 0.2 s earlier than the page clock says, so the director clock starts 0.2 s late.
    setTimeout(() => { sync.remove(); t0 = performance.now() + 200; last = performance.now(); running = true; log.push('started'); }, 300);
  };
  requestAnimationFrame(tick);
  // Manual recording (OBS): open the page with &autostart=1 and the director starts 4 s after the page is ready
  if (new URLSearchParams(location.search).has('autostart')) setTimeout(() => (w.__trailerStart as () => void)(), 4000);
  void canvas;
}
