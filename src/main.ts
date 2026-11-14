import * as THREE from 'three';
import { createTerrain } from './render/terrain';
import { createStars, createEarth } from './render/sky';
import { createInput } from './game/input';
import { Player, type Blocker } from './game/player';
import { World, type BuildingView } from './game/world';
import { Crew } from './game/crew';
import { TaskRunner, type TaskKind, type TaskResult, type TaskTarget } from './game/tasks';
import { assign, build, canPlace, completeJob, createSim, fix, setShelter, stationExposure, step, taskSpeed, upgrade, type ModuleType, type SimState } from './sim/sim.ts';
import { STATION, TASK_SPOT } from './game/layout';
import { moon, solarEvent } from './data/moon.ts';
import { createUi } from './ui/ui';
import { stars as starsOf } from './sim/sim.ts';
import { sfx, unlockAudio } from './audio/sfx';
import { t, setLanguage, type TextKey } from './i18n/en';
import { ar } from './i18n/ar';

const SAVE_KEY = 'outpost.save';
// Language is chosen before any text is read. Switching reloads the page.
let lang = 'en';
try { lang = localStorage.getItem('outpost.lang') ?? 'en'; } catch { /* storage blocked: stay in English */ }
if (lang === 'ar') { setLanguage(ar); document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; }

const canvas = document.getElementById('c') as HTMLCanvasElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color(0x000000);
scene.background = sky;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

// Harsh single sun, almost no fill: there is no atmosphere to scatter light on the Moon.
const sun = new THREE.DirectionalLight(0xfff4e0, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x223355, 0x111111, 0.45));
scene.add(createTerrain(), createStars(), createEarth());
const SUN_CALM = new THREE.Color(0xfff4e0), SUN_STORM = new THREE.Color(0xff8a4a);

const level = moon;
const sim = createSim(level);
// Testing aid: ?skip=150 starts the mission that many seconds in (nobody acts during the skipped time).
const skipTo = Number(new URLSearchParams(location.search).get('skip')) || 0;
while (sim.time < skipTo && sim.status === 'running') step(sim, level, 1 / level.tickHz);
sim.outbox.length = 0;
// Testing aids: ?fast=8 runs the game 8 times faster; ?debug exposes the game state on window.
const params = new URLSearchParams(location.search);
let ffMul = Math.max(1, Math.min(40, Number(params.get('fast')) || 1));

const saved = loadSave();
const legacyResearch = Math.min(3, saved.goals.length);
sim.research += legacyResearch;
const blockers: Blocker[] = [];
const world = new World(scene, blockers, level);
world.sync(sim);
const crew = new Crew(scene, sim, level, blockers, world);
const input = createInput(canvas);
const player = new Player(camera, blockers);
const runner = new TaskRunner();
const keys = new Set<string>();
if (params.has('debug')) Object.assign(window, { outpost: { sim, player, crew, world, runner, keys } });

type Target =
  | { type: 'task'; task: TaskTarget; name: string }
  | { type: 'door'; view: BuildingView }
  | { type: 'console' }
  | { type: 'crew'; index: number };

let placing: ModuleType | null = null;
let placeX = 0, placeZ = 0, placeOk = false;
let target: Target | null = null;
let clock = 0; // seconds of unpaused play, for banners and animation
let skyMix = 0, sirenAt = 0, holdTick = 0, lastBot = '';

// Saved progress: past goals give a few bonus research points at the start of the next mission.
interface Save { plays: number; bestStars: number; goals: string[] }
function loadSave(): Save {
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (v && Array.isArray(v.goals)) return v as Save; } catch { /* storage blocked or corrupt */ }
  return { plays: 0, bestStars: 0, goals: [] };
}
function saveProgress(sim: SimState): void {
  const old = loadSave();
  const next: Save = { plays: old.plays + 1, bestStars: Math.max(old.bestStars, starsOf(sim)), goals: Array.from(new Set([...old.goals, ...sim.goalsDone])) };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
}

const modName = (type: ModuleType) => t(`mod_${type}` as TextKey);
const isTouch = () => input.state.isTouch;
const unlockPointer = () => { if (document.pointerLockElement) document.exitPointerLock(); };
const bot = (key: TextKey) => { lastBot = t(key); ui.toast(lastBot, 'bot'); };

function switchLanguage(): void {
  try { localStorage.setItem('outpost.lang', lang === 'ar' ? 'en' : 'ar'); } catch { /* storage blocked */ }
  location.reload();
}

const ui = createUi(level, {
  click: () => sfx.click(),
  pickBuild(type) { placing = type; },
  place() {
    if (!placing) return;
    if (!placeOk) { ui.toast(t('placeBad'), 'bad'); return; }
    const m = build(sim, level, placing, placeX, placeZ);
    if (!m) return;
    world.sync(sim);
    sfx.build();
    ui.toast(t('built', { name: modName(m.type) }), 'good');
    placing = null;
  },
  cancelPlace() { placing = null; },
  actDown: () => actTap(),
  seqPress: (n) => seqPress(n),
  assign(i, task) {
    assign(sim, level, i, task);
    if (task) ui.toast(t('assigned', { name: sim.crew[i].name, chore: t(`task_${task}` as TextKey) }), 'good');
  },
  upgrade(key) {
    if (!upgrade(sim, level, key)) { ui.toast(t('upNeed'), 'bad'); return; }
    sfx.build();
    world.pulseType(sim, key === 'station' ? 'habitat' : key);
    ui.toast(t('upDone', { name: t(`up_${key}` as TextKey), n: sim.levels[key] }), 'good');
  },
  callShelter() { if (!sim.shelterCall) { setShelter(sim, true); sfx.alarm(); } },
  toggleLanguage: switchLanguage,
  restart: () => location.reload(),
});

const activities = () => crew.members.map((m) => m.activity);
const openBuild = () => { unlockPointer(); placing = null; sfx.click(); ui.openBuild(sim); };
const openCrew = (only: number | null = null) => { unlockPointer(); sfx.click(); ui.openCrew(sim, activities(), only); };
const openPause = () => { unlockPointer(); ui.openPause(); };
const byId = (id: string) => document.getElementById(id)!;
byId('buildBtn').addEventListener('click', () => openBuild());
byId('crewBtn').addEventListener('click', () => openCrew());
byId('pauseBtn').addEventListener('click', () => openPause());
byId('dataBtn').addEventListener('click', () => { unlockPointer(); sfx.click(); ui.dataCard(); });
// A clicked HUD button must not keep keyboard focus, or Space and Enter would press it again.
document.addEventListener('click', () => { if (!ui.blocking()) (document.activeElement as HTMLElement | null)?.blur?.(); });

// What the player is aiming at: a task on a module, a door, or a crew member.
function pickTarget(): Target | null {
  const px = player.pos.x, pz = player.pos.z;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best: Target | null = null, bestScore = Infinity;
  const consider = (x: number, z: number, reach: number, close: number, bias: number, make: () => Target) => {
    const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if (d > reach) return;
    if ((dx * fx + dz * fz) / (d || 1) < 0.2 && d > close) return;
    if (d + bias < bestScore) { bestScore = d + bias; best = make(); }
  };
  const mk = (kind: TaskKind, mini: TaskTarget['mini'], moduleId: number, jobId: number | null, x: number, z: number, reach: number): TaskTarget => ({ kind, mini, moduleId, jobId, x, z, reach });
  for (const m of sim.modules) {
    if (m.type === 'habitat' || m.type === 'shelter') continue;
    const r = level.modules[m.type].radius;
    const job = sim.jobs.find((j) => j.moduleId === m.id);
    if (!m.broken && !job) continue;
    const def = job ? level.tasks.find((tk) => tk.id === job.task)! : null;
    consider(m.x, m.z, r + 3.2, r + 1.5, m.broken ? -1 : 0, () => ({
      type: 'task', name: modName(m.type),
      task: m.broken ? mk('repair', 'sequence', m.id, null, m.x, m.z, r + 3.2) : mk(def!.id, def!.mini, m.id, job!.id, m.x, m.z, r + 3.2),
    }));
  }
  // Jobs inside the station and the shelter stand at fixed spots in front of the equipment.
  for (const job of sim.jobs) {
    const m = sim.modules.find((mod) => mod.id === job.moduleId);
    if (!m || (m.type !== 'habitat' && m.type !== 'shelter')) continue;
    const spot = TASK_SPOT[job.task];
    const def = level.tasks.find((tk) => tk.id === job.task)!;
    consider(m.x + spot.x, m.z + spot.z, 2.2, 1.4, 0, () => ({ type: 'task', name: modName(m.type), task: mk(def.id, def.mini, m.id, job.id, m.x + spot.x, m.z + spot.z, 2.2) }));
  }
  const hab = world.buildings.find((v) => v.type === 'habitat');
  if (hab) consider(hab.x + STATION.engineering.x, hab.z + STATION.engineering.z + 1.2, 2.4, 1.4, 0.2, () => ({ type: 'console' }));
  const door = world.doorNear(px, pz);
  if (door) consider(door.x, door.z + door.r, 2.6, 1.6, 0.5, () => ({ type: 'door', view: door }));
  if (!sim.storm) crew.members.forEach((m, index) => consider(m.x, m.z, 2.8, 0, 0.3, () => ({ type: 'crew', index })));
  return best;
}

// Quick actions on E or a tap of the action button. Tasks are held, not tapped.
function actTap(): void {
  if (ui.blocking() || !target || runner.stage === 'mini') return;
  if (target.type === 'door') {
    const open = world.toggleDoor(target.view);
    sfx.click();
    ui.toast(t(open ? 'doorOpened' : 'doorClosed'));
  } else if (target.type === 'crew') {
    openCrew(target.index);
  } else if (target.type === 'console') {
    unlockPointer(); sfx.click(); ui.openUpgrades(sim);
  }
}

function finishTask(tg: TaskTarget, result: TaskResult): void {
  if (result === 'done') {
    const m = sim.modules.find((mod) => mod.id === tg.moduleId);
    if (tg.kind === 'repair') { if (m) fix(sim, m.id); } else if (tg.jobId !== null) completeJob(sim, level, tg.jobId);
    world.pulse(tg.moduleId);
    sfx.fix();
    ui.toast(tg.kind === 'repair' ? t('taskDone_repair', { name: m ? modName(m.type) : '' }) : t('taskDone', { task: t(`task_${tg.kind}` as TextKey) }), 'good');
  } else {
    if (result === 'failed') sfx.broke();
    ui.toast(t(result === 'failed' ? 'taskFailed' : result === 'storm' ? 'taskStorm' : 'taskMoved'), 'bad');
  }
}

function seqPress(n: number): void {
  const tg = runner.target;
  const r = runner.press(n);
  if (!tg || r === null) return;
  if (r === 'ok') sfx.click();
  else if (r === 'wrong') { sfx.broke(); ui.toast(t('taskWrong'), 'bad'); }
  else finishTask(tg, r);
}

addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'Tab') e.preventDefault();
  if (ui.blocking()) {
    // Same key that opened a menu closes it again.
    const kind = ui.menuOpen();
    if (!e.repeat && ((e.code === 'KeyB' && kind === 'build') || (e.code === 'Tab' && kind === 'crew'))) { ui.closeMenu(); return; }
    if (ui.handleKey(e)) e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyE': if (placing) byId('placeBtn').click(); else actTap(); break;
    case 'Enter': if (placing) byId('placeBtn').click(); break;
    case 'KeyB': openBuild(); break;
    case 'Tab': openCrew(); break;
    case 'KeyG': if (sim.storm?.phase === 'warning') byId('shelterBtn').click(); break;
    case 'KeyH': if (lastBot) ui.toast(lastBot, 'bot'); break;
    case 'KeyF': toggleFF(); break;
    case 'KeyK': skipAhead(); break;
    case 'Escape': if (placing) placing = null; else openPause(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Numpad1': case 'Numpad2': case 'Numpad3':
      seqPress(Number(e.code.slice(-1)));
      break;
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
byId('btnFF').addEventListener('click', () => toggleFF());
byId('btnSkip').addEventListener('click', () => skipAhead());
addEventListener('blur', () => keys.clear());
// Esc while the mouse is captured only releases the mouse; treat that as "pause".
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !ui.blocking() && !placing && sim.status === 'running') openPause();
});
// Desktop: with the mouse captured, a click places the module.
canvas.addEventListener('mousedown', () => { if (placing && document.pointerLockElement === canvas) byId('placeBtn').click(); });
addEventListener('pointerdown', unlockAudio);

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

document.title = t('title');
hintEl.textContent = t('hintDesktop');
canvas.addEventListener('touchstart', () => { hintEl.textContent = t('hintTouch'); }, { once: true });
let hintTimer = 25;

ui.card({
  title: t('tutorialTitle'),
  paragraphs: [t('tutorialBody')],
  list: [t('tut1'), t('tut2'), t('tut3'), t('tut4'), t('tut5')],
  button: t('btnStart'),
  onClose: unlockAudio,
  extra: [{ label: t('btnLang'), onClick: switchLanguage }],
});

function handleEvents(): void {
  for (const e of sim.outbox) {
    switch (e.type) {
      case 'broke': {
        const m = sim.modules.find((mod) => mod.id === e.id)!;
        if (e.reason === 'meteor') world.meteorAt(m.x, m.z);
        sfx.broke();
        ui.toast(t(`broke_${e.reason}` as TextKey, { name: modName(m.type) }), 'bad');
        break;
      }
      case 'job': {
        const job = sim.jobs.find((j) => j.id === e.id);
        if (job) { sfx.part(); ui.toast(t('jobNew', { job: t(`task_${job.task}` as TextKey) })); }
        break;
      }
      case 'choreDone': sfx.part(); ui.toast(t('choreDone', { name: sim.crew[e.crew].name, chore: t(`task_${e.task}` as TextKey) }), 'good'); break;
      case 'upgrade': break; // the console handles its own feedback
      case 'autoRepair': { const m = sim.modules.find((mod) => mod.id === e.id); sfx.fix(); if (m) ui.toast(t('autoRepaired', { name: modName(m.type) }), 'good'); break; }
      case 'goal': sfx.win(); ui.toast(t('goalDone', { goal: t(`goal_${e.id}` as TextKey, { n: goalN(e.id) }) }), 'good'); break;
      case 'stormWarn': sfx.alarm(); sirenAt = clock + 12; bot('botStorm'); break;
      case 'stormStart': {
        sfx.alarm();
        bot('botImpact');
        if (sim.playerExposure > 0) {
          const tg = runner.target;
          const r = runner.cancel('storm');
          if (tg && r) finishTask(tg, r);
        }
        break;
      }
      case 'stormEnd': {
        sfx.allClear();
        ui.toast(t('stormOver'), 'good');
        if (e.index === 0) {
          const info = level.storms[0].info;
          const kp = Math.max(...solarEvent.gsts.map((g) => g.maxKp));
          unlockPointer();
          ui.card({
            title: t('infoTitle'),
            paragraphs: [
              t('infoBody1', { date: info.sepTimeUtc.replace('T', ' ').replace('Z', ''), cls: info.flareClass }),
              t('infoBody2'), t('infoBody3', { kp }), t('infoBody4'),
            ],
            source: `${t('infoSource', { id: info.sepId })} · ${info.sepUrl}`,
            button: t('btnGotIt'),
          });
        }
        break;
      }
      case 'meteor': {
        sfx.meteor();
        ui.flash(t('meteorBanner'), clock, 6);
        for (let i = 0; i < 5; i++) world.meteorAt((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70);
        break;
      }
      case 'end': {
        unlockPointer();
        placing = null;
        if (sim.status === 'won') sfx.win(); else sfx.lose();
        saveProgress(sim);
        ui.end(sim, () => location.reload());
        break;
      }
    }
  }
  sim.outbox.length = 0;
}

function updatePrompt(): void {
  const touch = isTouch();
  if (runner.stage === 'mini') {
    ui.setPrompt(null, runner.mini === 'gauge' ? t('btnAct_pump') : null);
    return;
  }
  if (!target || placing) { ui.setPrompt(null, null); return; }
  if (target.type === 'task') {
    const action = t(target.task.kind === 'repair' ? 'do_repair' : (`do_${target.task.kind}` as TextKey), { name: target.name });
    ui.setPrompt(touch ? t('promptHoldTouch', { action }) : t('promptHold', { key: 'E', action }), t(target.task.kind === 'repair' ? 'btnAct_repair' : 'btnAct_task'));
  } else if (target.type === 'console') {
    const action = t('do_console');
    ui.setPrompt(touch ? t('promptTapTouch', { action }) : t('promptTap', { key: 'E', action }), t('btnAct_console'));
  } else {
    const action = target.type === 'door'
      ? t(target.view.blocker.ring!.open ? 'do_closeDoor' : 'do_openDoor')
      : t('do_talk', { name: sim.crew[target.index].name });
    ui.setPrompt(touch ? t('promptTapTouch', { action }) : t('promptTap', { key: 'E', action }), t(target.type === 'door' ? 'btnAct_door' : 'btnAct_talk'));
  }
}

function jobList(): { text: string; urgent: boolean }[] {
  const out: { text: string; urgent: boolean }[] = [];
  for (const m of sim.modules) if (m.broken) out.push({ text: t('job_repair', { name: modName(m.type) }), urgent: true });
  for (const j of sim.jobs) out.push({ text: t(`task_${j.task}` as TextKey), urgent: false });
  return out;
}

const goalN = (id: string) => { const g = level.goals.find((x) => x.id === id)!; return g.kind.endsWith('Streak') ? Math.round(g.target / level.solLength) : g.target; };
// Fast-forward and skip are for waiting around: they are off while anything is urgent.
const urgent = () => !!sim.storm || sim.modules.some((m) => m.broken) || sim.stormIndex < level.storms.length && level.storms[sim.stormIndex].warnAt - sim.time < 15;
function toggleFF(): void {
  if (ffMul > 1) { ffMul = 1; byId('btnFF').classList.remove('on'); ui.toast(t('ffOff')); return; }
  if (urgent()) { ui.toast(t('ffBlocked'), 'bad'); return; }
  ffMul = 3; byId('btnFF').classList.add('on'); ui.toast(t('ffOn'));
}
function skipAhead(): void {
  if (urgent() || ui.blocking()) { ui.toast(t('skipBlocked'), 'bad'); return; }
  const until = sim.time + 40;
  while (sim.time < until && sim.status === 'running' && sim.outbox.length === 0 && !urgent()) step(sim, level, 1 / level.tickHz);
  handleEvents(); ui.update(sim, clock, crew.safeCount(sim)); ui.setJobs(jobList());
  ui.toast(t('skipDone'));
}

const TICK = 1 / level.tickHz;
let simAcc = 0;
ui.update(sim, clock, 0);
ui.setJobs(jobList());
player.update(0, input.state); // place the camera before the first (paused) frame

// FPS meter: average + worst frame over each half second, for the phone gate.
let last = performance.now(), acc = 0, frames = 0, worst = 0;
renderer.setAnimationLoop((now) => {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);
  const paused = ui.blocking() || sim.status !== 'running';

  if (ffMul > 1 && urgent()) { ffMul = 1; byId('btnFF').classList.remove('on'); }
  const reps = paused ? 0 : ffMul;
  for (let rep = 0; rep < reps; rep++) {
    if (ui.blocking() || sim.status !== 'running') break;
    clock += dt;
    const inp = rep === 0 ? input.state : { ...input.state, lookDX: 0, lookDY: 0, jump: false };
    const lookDX = inp.lookDX;
    player.update(dt, inp, keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const px = player.pos.x, pz = player.pos.z;

    // Only the shelter stops the radiation; the station's thin walls stop half.
    const inside = world.buildingAt(px, pz);
    sim.playerExposure = inside < 0 ? 1 : world.buildings[inside].type === 'shelter' ? 0 : stationExposure(sim, level);
    crew.update(dt, sim, px, pz);

    simAcc += dt;
    let ticked = false;
    while (simAcc >= TICK) { step(sim, level, TICK); simAcc -= TICK; ticked = true; }
    if (ticked) { handleEvents(); ui.update(sim, clock, crew.safeCount(sim)); ui.setJobs(jobList()); }

    world.update(dt, sim, clock, px, pz, crew.positions());

    // Build ghost follows where the player is looking, on the ground.
    if (placing) {
      const dist = player.pitch < -0.05 ? Math.max(4, Math.min(12, 1.7 / Math.tan(-player.pitch))) : 12;
      placeX = px - Math.sin(player.yaw) * dist;
      placeZ = pz - Math.cos(player.yaw) * dist;
      placeOk = canPlace(sim, level, placing, placeX, placeZ);
    }
    world.setGhost(placing, placeX, placeZ, placeOk);
    ui.setPlacing(!!placing, placeOk);

    // Interaction: aim, hold, then the mini-step.
    if (runner.stage !== 'mini') target = placing ? null : pickTarget();
    const holding = keys.has('KeyE') || ui.actHeld();
    const tg = runner.target;
    runner.speed = 1 / taskSpeed(sim, level);
    const result = runner.update(dt, holding, lookDX, target?.type === 'task' ? target.task : null, px, pz);
    if (result && tg) finishTask(tg, result);
    if (runner.stage === 'hold' && holding) { holdTick -= dt; if (holdTick <= 0) { holdTick = 0.22; sfx.click(); } }
    ui.setRing(runner.stage === 'hold' ? runner.hold : 0);
    ui.renderTask(runner, isTouch());
    updatePrompt();

    // Storm: siren during the warning, clicks from the radiation counter when exposed, and a red sky.
    if (sim.storm?.phase === 'warning' && clock >= sirenAt) { sirenAt = clock + 12; sfx.alarm(); }
    if (sim.storm?.phase === 'active' && sim.playerExposure > 0 && Math.random() < dt * 22 * sim.playerExposure) sfx.geiger();
    const want = sim.storm ? (sim.storm.phase === 'active' ? 1 : 0.4) : 0;
    skyMix += (want - skyMix) * Math.min(1, dt * 0.8);
    sky.setRGB(0.2 * skyMix, 0.035 * skyMix, 0.012 * skyMix);
    sun.color.copy(SUN_CALM).lerp(SUN_STORM, skyMix);

    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hintEl.style.display = 'none'; }
  }
  input.consume();

  // Shadow frustum follows the player so one small map covers what is nearby.
  sun.target.position.copy(player.pos);
  sun.position.set(player.pos.x + 60, player.pos.y + 45, player.pos.z + 30);

  renderer.render(scene, camera);

  acc += rawDt; frames++; worst = Math.max(worst, rawDt);
  if (acc >= 0.5) {
    const info = renderer.info.render;
    fpsEl.textContent = `${Math.round(frames / acc)} fps  worst ${(worst * 1000).toFixed(0)} ms\n${info.calls} calls  ${(info.triangles / 1000).toFixed(0)}k tris  dpr ${renderer.getPixelRatio().toFixed(1)}`;
    acc = 0; frames = 0; worst = 0;
  }
});
