import * as THREE from 'three';
import { createTerrain, createFarGround } from './render/terrain';
import { Intro, createLander, LANDER_AT } from './game/intro';
import { createStars, createEarth, createSun } from './render/sky';
import { createInput } from './game/input';
import { Player, type Blocker } from './game/player';
import { World, type BuildingView } from './game/world';
import { Crew } from './game/crew';
import { TaskRunner, type TaskKind, type TaskResult, type TaskTarget } from './game/tasks';
import { WorkSession, type WorkEnv } from './game/work';
import type { WorkKind } from './data/workTasks';
import { harvestPlant, HARVEST_FOOD, assign, build, canPlace, completeJob, createSim, fix, setShelter, stationExposure, step, taskSpeed, upgrade, upgradeCost, type ModuleType, type SimState } from './sim/sim.ts';
import { STATION, TASK_SPOT } from './game/layout';
import { moon, solarEvent } from './data/moon.ts';
import { createUi, factText } from './ui/ui';
import { cardInfo, researchFor, type CardId } from './ui/cards';
import { warnLines, stormLines, type Line } from './data/talk';
import { makeQuiz } from './data/quiz';
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
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color(0x000000);
scene.background = sky;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

// Harsh single sun, almost no fill: there is no atmosphere to scatter light on the Moon.
const sun = new THREE.DirectionalLight(0xfff4e0, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x223355, 0x111111, 0.45));
const sunDisc = createSun();
scene.add(createFarGround(), createTerrain(), createStars(), createEarth(), sunDisc);
const SUN_DIR = new THREE.Vector3(60, 45, 30).normalize();
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
if (params.has('debug')) Object.assign(window, { outpost: { sim, player, crew, world, runner, keys, askQuiz, camera, intro: () => intro, work: () => work, go: (k: WorkKind, id: number) => startWork(k, { kind: k === 'repair' ? 'repair' : k, mini: 'sequence', moduleId: id, jobId: null, x: 0, z: 0, reach: 9 } as TaskTarget) } });

type Target =
  | { type: 'task'; task: TaskTarget; name: string }
  | { type: 'door'; view: BuildingView }
  | { type: 'console' }
  | { type: 'weather' }
  | { type: 'crew'; index: number };

let placing: ModuleType | null = null;
let placeX = 0, placeZ = 0, placeOk = false;
let target: Target | null = null;
let clock = 0; // seconds of unpaused play, for banners and animation
let skyMix = 0, sirenAt = 0, holdTick = 0, lastBot = '';

// Saved progress: past goals give a few bonus research points at the start of the next mission.
interface Save { plays: number; bestStars: number; goals: string[]; cards: string[] }
function loadSave(): Save {
  try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (v && Array.isArray(v.goals)) return { cards: [], ...v } as Save; } catch { /* storage blocked or corrupt */ }
  return { plays: 0, bestStars: 0, goals: [], cards: [] };
}
function persistCards(): void {
  const old = loadSave();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...old, cards: Array.from(new Set([...old.cards, ...ui.collectedIds()])) })); } catch { /* storage blocked */ }
}
function saveProgress(sim: SimState): void {
  const old = loadSave();
  const next: Save = { plays: old.plays + 1, bestStars: Math.max(old.bestStars, starsOf(sim)), goals: Array.from(new Set([...old.goals, ...sim.goalsDone])), cards: Array.from(new Set([...old.cards, ...ui.collectedIds()])) };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
}

// ---- Quality: Low, Medium, High. Low has no shadows and a lower pixel ratio. It drops by itself if the frame rate stays low. ----
type Quality = 'low' | 'medium' | 'high';
let quality: Quality = matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
try { const v = localStorage.getItem('outpost.quality'); if (v === 'low' || v === 'medium' || v === 'high') quality = v; } catch { /* storage blocked */ }
const PIXEL_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const SHADOW_SIZE: Record<Quality, number> = { low: 512, medium: 1024, high: 2048 };
function applyQuality(): void {
  sun.castShadow = quality !== 'low';
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  sun.shadow.mapSize.set(SHADOW_SIZE[quality], SHADOW_SIZE[quality]);
  resize();
  try { localStorage.setItem('outpost.quality', quality); } catch { /* storage blocked */ }
}
let lowRun = 0;

// Data cards: the first time the player meets a real dataset it is added to the Mission Log (+2 research).
const cmeSaid = new Set<number>();
const researchSeen = new Set<string>();
function collectResearch(task: string): void {
  const id = researchFor(task);
  if (!id || researchSeen.has(id)) return;
  researchSeen.add(id);
  const c = cardInfo(id);
  ui.collect(id);
  ui.toast(`${t('badgeReal')}: ${c.line}`, 'bot');
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
  quality: () => quality,
  cycleQuality: () => { quality = quality === 'high' ? 'medium' : quality === 'medium' ? 'low' : 'high'; applyQuality(); },
  fps: () => document.body.classList.contains('showfps'),
  toggleFps: () => { document.body.classList.toggle('showfps'); },
  cardNew: (id: CardId) => { sim.research += 2; sfx.part(); ui.toast(t('newCard', { title: cardInfo(id).title, n: 2 }), 'good'); persistCards(); },
  restart: () => location.reload(),
  tool: (i) => { work?.selectIndex(i); },
  leaveWork: () => leaveWork(),
});

// ---- Work mode: close-up hands-on tasks ----
let work: WorkSession | null = null;
let workTarget: TaskTarget | null = null;
let workDoneAt = 0;
const sessions = new Map<string, WorkSession>();
const lastNdc = new THREE.Vector2();
const lookCur = new THREE.Vector3();
const workEnv: WorkEnv = {
  plants: sim.plants,
  lampOn: () => sim.lampOn,
  setLamp: (on) => { sim.lampOn = on; },
  harvest: (i) => { if (harvestPlant(sim, level, i)) { ui.toast(t('ws_harvested', { n: HARVEST_FOOD }), 'good'); ui.popup(`+${HARVEST_FOOD} 🌱`); } },
  dust: () => sim.dust,
};
const workFx = { click: () => sfx.click(), ok: () => sfx.part(), wrong: () => sfx.broke(), done: () => sfx.fix() };
const workKindOf = (tg: TaskTarget): WorkKind | null => (tg.kind === 'repair' ? 'repair' : tg.kind === 'solar' ? 'solar' : tg.kind === 'water' ? 'water' : tg.kind === 'greenhouse' ? 'greenhouse' : null);

function startWork(kind: WorkKind, tg: TaskTarget): void {
  if (work) scene.remove(work.group);
  const key = `${kind}:${tg.moduleId}`;
  let ses = sessions.get(key);
  if (!ses) { ses = new WorkSession(kind, workEnv, workFx); sessions.set(key, ses); }
  work = ses; workTarget = tg; workDoneAt = 0;
  world.markersHidden = true;
  scene.add(ses.group);
  input.enabled = false;
  unlockPointer();
  lookCur.set(0, 0, 0).copy(camera.position);
  sfx.click();
}

// Leaving keeps the session, so the steps already done stay done when you come back.
function leaveWork(): void {
  if (!work) return;
  scene.remove(work.group);
  work = null; workTarget = null;
  world.markersHidden = false;
  input.enabled = true;
  camera.fov = 70; camera.updateProjectionMatrix();
  ui.setWork(null, isTouch());
}

function finishWork(): void {
  const tg = workTarget, ses = work;
  if (!tg || !ses) return;
  sessions.delete(`${ses.kind}:${tg.moduleId}`);
  scene.remove(ses.group);
  work = null; workTarget = null;
  world.markersHidden = false;
  input.enabled = true;
  camera.fov = 70; camera.updateProjectionMatrix();
  ui.setWork(null, isTouch());
  finishTask(tg, 'done');
  const why = tg.kind === 'solar' ? 'dustPanels' : tg.kind === 'water' ? 'water90' : null;
  if (why) { const f = factText(why); if (f) ui.toast(`${t('whyTitle')}: ${f}`, 'bot'); }
  ui.toast(t('ws_simplified'));
}

function workFrame(dt: number): void {
  if (!work) return;
  work.update(dt);
  const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.7, player.pos.z);
  const fov = 52;
  const f = work.frame(eye, player.yaw, fov, camera.aspect);
  const k = 1 - Math.exp(-9 * dt);
  camera.position.lerp(f.pos, k);
  lookCur.lerp(f.look, k);
  camera.lookAt(f.look);
  camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
  ui.setWork(work.view(), isTouch());
  if (work.done) { workDoneAt += dt; if (workDoneAt > 0.9) finishWork(); }
}

const ndcOf = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); lastNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); return lastNdc; };
canvas.addEventListener('pointermove', (e) => { if (work) work.pointerMove(ndcOf(e), camera); });
canvas.addEventListener('pointerdown', (e) => { if (work) { e.preventDefault(); work.pointerDown(ndcOf(e), camera); } });
addEventListener('pointerup', () => { work?.pointerUp(); });

const activities = () => crew.members.map((m) => m.activity);
const openBuild = () => { unlockPointer(); placing = null; sfx.click(); ui.openBuild(sim); };
const openCrew = (only: number | null = null) => { unlockPointer(); sfx.click(); ui.openCrew(sim, activities(), only); };
const openPause = () => { unlockPointer(); ui.openPause(); };
const byId = (id: string) => document.getElementById(id)!;
byId('buildBtn').addEventListener('click', () => openBuild());
byId('crewBtn').addEventListener('click', () => openCrew());
byId('pauseBtn').addEventListener('click', () => openPause());
byId('dataBtn').addEventListener('click', () => { unlockPointer(); sfx.click(); ui.dataLab(); });
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
  if (hab) consider(hab.x + STATION.weather.x, hab.z + STATION.weather.z + 1.2, 2.4, 1.4, 0.25, () => ({ type: 'weather' }));
  const door = world.doorNear(px, pz);
  if (door) consider(door.x, door.z + door.r, 2.6, 1.6, 0.5, () => ({ type: 'door', view: door }));
  const safeTalk = !sim.storm || (sim.storm.phase === 'active' && sim.playerExposure === 0);
  if (safeTalk) crew.members.forEach((m, index) => consider(m.x, m.z, 2.8, 0, 0.3, () => ({ type: 'crew', index })));
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
    if (sim.storm) askQuiz(); else openCrew(target.index);
  } else if (target.type === 'console') {
    unlockPointer(); sfx.click(); ui.openUpgrades(sim);
  } else if (target.type === 'weather') {
    unlockPointer(); sfx.click(); ui.weatherCard(sim);
  }
}

function finishTask(tg: TaskTarget, result: TaskResult): void {
  if (result === 'done') {
    const m = sim.modules.find((mod) => mod.id === tg.moduleId);
    if (tg.kind === 'repair') { if (m) fix(sim, m.id); } else if (tg.jobId !== null) completeJob(sim, level, tg.jobId);
    world.pulse(tg.moduleId);
    sfx.fix();
    collectResearch(tg.kind);
    if (tg.kind !== 'repair') { const def = level.tasks.find((tk) => tk.id === tg.kind); if (def) ui.popup(ui.gainText(def.reward)); } else ui.popup('✔');
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
  if (intro) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') endIntro(); return; }
  if (e.code === 'Tab') e.preventDefault();
  if (work && !ui.blocking()) {
    if (e.code === 'Escape') { leaveWork(); return; }
    if (/^Digit[1-8]$/.test(e.code)) { work.selectIndex(Number(e.code.slice(5)) - 1); return; }
    if (e.code === 'KeyE' && !e.repeat) work.pointerDown(lastNdc, camera);
    return;
  }
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
    case 'KeyJ': ui.toggleGoals(); break;
    case 'KeyK': skipAhead(); break;
    case 'Escape': if (placing) placing = null; else openPause(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Numpad1': case 'Numpad2': case 'Numpad3':
      seqPress(Number(e.code.slice(-1)));
      break;
  }
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE') work?.pointerUp(); });
byId('btnFF').addEventListener('click', () => toggleFF());
byId('btnSkip').addEventListener('click', () => skipAhead());
addEventListener('blur', () => keys.clear());
// Esc while the mouse is captured only releases the mouse; treat that as "pause".
let wasLocked = false;
document.addEventListener('pointerlockchange', () => {
  const locked = !!document.pointerLockElement;
  if (!locked && wasLocked && !ui.blocking() && !placing && !work && sim.status === 'running') openPause();
  wasLocked = locked;
});
// Desktop: with the mouse captured, a click places the module.
canvas.addEventListener('mousedown', () => { if (placing && document.pointerLockElement === canvas) byId('placeBtn').click(); });
addEventListener('pointerdown', unlockAudio);
byId('introSkip').addEventListener('click', () => endIntro());
byId('introUi').addEventListener('pointerdown', () => { if (intro && intro.t > 1.5) endIntro(); });

function resize(): void {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP[quality]));
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

function showTutorial(): void {
  ui.card({
    title: t('tutorialTitle'),
    paragraphs: [t('tutorialBody')],
    list: [t('tut1'), t('tut2'), t('tut3'), t('tut4'), t('tut5')],
    button: t('btnStart'),
    onClose: unlockAudio,
    extra: [{ label: t('btnLang'), onClick: switchLanguage }],
  });
}

// ---- Opening cinematic ----
let intro: Intro | null = null;
const fadeEl = byId('fade'), titleEl = byId('introTitle');
(titleEl.querySelector('b') as HTMLElement).textContent = t('introTitle');
(titleEl.querySelector('span') as HTMLElement).textContent = t('introTag');
byId('introSkip').textContent = t('btnSkip2');

function startIntro(): void {
  unlockAudio();
  const hab = world.buildings.find((b) => b.type === 'habitat')!;
  const lights: THREE.PointLight[] = [];
  hab.b.group.traverse((o) => { if (o instanceof THREE.PointLight) lights.push(o); });
  document.body.classList.add('intro');
  crew.members.forEach((m) => { m.model.group.visible = false; });
  intro = new Intro({
    scene, camera, habLights: lights,
    say: (key) => ui.subtitle('', t(key), 5),
    showTitle: (on) => titleEl.classList.toggle('on', on),
    setFade: (o) => { fadeEl.style.opacity = String(o); },
    fx: { engine: () => sfx.engine(), thud: () => sfx.thud(), hiss: () => sfx.hiss(), click: () => sfx.click() },
  });
}

// Ends the cinematic (it finished or was skipped): park the lander, show the crew and hand over inside the station.
function endIntro(): void {
  if (!intro) return;
  intro.finish();
  const lander = intro.lander;
  world.extraBlockers.push({ x: LANDER_AT.x, z: LANDER_AT.z, r: 2.4 });
  world.sync(sim);
  intro = null;
  document.body.classList.remove('intro');
  crew.members.forEach((m) => { m.model.group.visible = true; });
  void lander;
  player.pos.set(0, 0, 1.5); player.yaw = 0; player.pitch = 0;
  player.update(0, input.state);
  ui.subtitle('', '', 0);
  showTutorial();
}

const judge = params.has('judge');
if (judge) {
  document.body.classList.add('judge');
  // A ready, upgraded base about 20 s before the first storm warning, with a job already waiting
  sim.time = 236; sim.sampleAt = 236; sim.nextJobAt = 236; sim.eventIndex = level.events.filter((e) => e.at < 236).length;
  sim.power = 75; sim.air = 85; sim.food = 70; sim.health = 88; sim.parts = 6; sim.research = 6; sim.dust = 0.6;
  for (const k of ['solar', 'lifeSupport', 'greenhouse', 'engineering', 'station'] as const) sim.levels[k] = 2;
  sim.plants[0] = { stage: 4, growth: 100, water: 0.6, kind: 'lettuce' };
  sim.plants[1] = { stage: 2, growth: 30, water: 0.5, kind: 'tomato' };
  const solarMod = sim.modules.find((m) => m.type === 'solar');
  if (solarMod) sim.jobs.push({ id: sim.nextId++, task: 'solar', moduleId: solarMod.id });
  player.pos.set(0, 0, 1.5);
  byId('judgeReset').textContent = t('btnJudgeReset');
  byId('judgeReset').addEventListener('click', () => location.reload());
} else ui.setCollected(saved.cards);
function showJudge(): void {
  ui.card({ title: t('judgeTitle'), paragraphs: [t('judgeBody')], button: t('btnStart'), onClose: unlockAudio });
}
const skipIntroNow = params.has('skip') || params.has('nointro') || judge;
if (skipIntroNow) {
  const l = createLander();
  l.group.position.set(LANDER_AT.x, 0, LANDER_AT.z); l.group.remove(l.flame, l.light); l.hatch.rotation.z = -1.7; l.ladder.visible = true;
  scene.add(l.group);
  world.extraBlockers.push({ x: LANDER_AT.x, z: LANDER_AT.z, r: 2.4 });
  world.sync(sim);
  if (judge) showJudge(); else showTutorial();
} else {
  ui.card({
    title: t('introTitle'),
    paragraphs: [t('introWelcome')],
    button: t('btnPlayIntro'),
    onClose: () => startIntro(),
    extra: [
      { label: t('btnSkipIntro'), onClick: () => { byId('overlay').classList.remove('on'); unlockAudio(); const l = createLander(); l.group.position.set(LANDER_AT.x, 0, LANDER_AT.z); l.group.remove(l.flame, l.light); l.hatch.rotation.z = -1.7; l.ladder.visible = true; scene.add(l.group); world.extraBlockers.push({ x: LANDER_AT.x, z: LANDER_AT.z, r: 2.4 }); world.sync(sim); player.pos.set(0, 0, 1.5); showTutorial(); } },
      { label: t('btnJudge'), onClick: () => { location.href = location.pathname + '?judge=1'; } },
      { label: t('btnLang'), onClick: switchLanguage },
    ],
  });
}

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
      case 'choreDone': collectResearch(e.task); sfx.part(); ui.toast(t('choreDone', { name: sim.crew[e.crew].name, chore: t(`task_${e.task}` as TextKey) }), 'good'); break;
      case 'upgrade': break; // the console handles its own feedback
      case 'autoRepair': { const m = sim.modules.find((mod) => mod.id === e.id); sfx.fix(); if (m) ui.toast(t('autoRepaired', { name: modName(m.type) }), 'good'); break; }
      case 'goal': sfx.win(); ui.toast(t('goalDone', { goal: t(`goal_${e.id}` as TextKey, { n: goalN(e.id) }) }), 'good'); break;
      case 'stormWarn': {
        sfx.alarm(); sirenAt = clock + 12; bot('botStorm'); queueTalk(warnLines(level.storms[e.index]), 4, 5);
        ui.collect('donkiFlare');
        ui.toast(t('forecast1', { cls: level.storms[e.index].info.flareClass }), 'bot');
        break;
      }
      case 'stormStart': {
        sfx.alarm();
        bot('botImpact');
        ui.toast(t('forecast3'), 'bot');
        ui.collect('donkiSep'); ui.collect('apollo1972'); ui.collect('radMoon');
        if (work && sim.playerExposure > 0) { leaveWork(); ui.toast(t('taskStorm'), 'bad'); }
        queueTalk(stormLines(level.storms[e.index], Math.max(...solarEvent.gsts.map((g) => g.maxKp)), factText), 6, 6.5);
        if (sim.playerExposure > 0) {
          const tg = runner.target;
          const r = runner.cancel('storm');
          if (tg && r) finishTask(tg, r);
        }
        break;
      }
      case 'stormEnd': {
        ui.collect('donkiKp'); ui.collect('radMars');
        talkQueue = [];
        say({ who: 2, key: 'talk_clear', vars: {} });
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
  } else if (target.type === 'console' || target.type === 'weather') {
    const action = t(target.type === 'console' ? 'do_console' : 'do_weather');
    ui.setPrompt(touch ? t('promptTapTouch', { action }) : t('promptTap', { key: 'E', action }), t(target.type === 'console' ? 'btnAct_console' : 'btnAct_weather'));
  } else {
    const action = target.type === 'door'
      ? t(target.view.blocker.ring!.open ? 'do_closeDoor' : 'do_openDoor')
      : t(sim.storm ? 'do_quiz' : 'do_talk', { name: sim.crew[target.index].name });
    ui.setPrompt(touch ? t('promptTapTouch', { action }) : t('promptTap', { key: 'E', action }), t(target.type === 'door' ? 'btnAct_door' : sim.storm ? 'btnAct_quiz' : 'btnAct_talk'));
  }
}

// Objective markers: broken machines, waiting jobs, the console when you can afford an upgrade, and the shelter in a storm.
const markVec = new THREE.Vector3();
function updateMarks(): void {
  const items: { id: string; label: string; color: string; x: number; y: number; dist: number; edge: boolean; angle: number }[] = [];
  const w = innerWidth, h = innerHeight;
  const add = (id: string, label: string, color: string, x: number, y: number, z: number, minDist = 5) => {
    const dist = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (dist < minDist || placing) return;
    markVec.set(x, y, z).project(camera);
    const behind = markVec.z > 1;
    let sx = (markVec.x * 0.5 + 0.5) * w, sy = (-markVec.y * 0.5 + 0.5) * h;
    if (behind) { sx = w - sx; sy = h - sy; }
    const m = 46;
    const off = behind || sx < m || sx > w - m || sy < m + 60 || sy > h - m - 70;
    let angle = 0;
    if (off) {
      const cx = w / 2, cy = h / 2;
      let dx = sx - cx, dy = sy - cy;
      if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dx = 1; }
      angle = Math.atan2(dy, dx) + Math.PI / 2;
      const k = Math.min((w / 2 - m) / (Math.abs(dx) || 1e-6), (h / 2 - m - 60) / (Math.abs(dy) || 1e-6));
      sx = cx + dx * k; sy = cy + dy * k;
    }
    items.push({ id, label, color, x: sx, y: sy, dist, edge: off, angle });
  };
  for (const m of sim.modules) if (m.broken) add(`b${m.id}`, '!', '#ff5a4a', m.x, 3.5, m.z);
  for (const j of sim.jobs) {
    const m = sim.modules.find((mod) => mod.id === j.moduleId);
    if (!m) continue;
    const spot = (m.type === 'habitat' || m.type === 'shelter') ? TASK_SPOT[j.task] : { x: 0, z: 0 };
    add(`j${j.id}`, '★', '#ffc840', m.x + spot.x, (m.type === 'habitat' || m.type === 'shelter') ? 2.2 : 3.2, m.z + spot.z);
  }
  const cheapest = Math.min(...(['engineering', 'solar', 'lifeSupport', 'greenhouse', 'battery', 'tank', 'station'] as const).map((k) => upgradeCost(sim, level, k) ?? 99));
  const hab = world.buildings.find((v) => v.type === 'habitat');
  if (hab && sim.research >= cheapest) add('con', t('btnAct_console'), '#7fe0ff', hab.x + STATION.engineering.x, 2.4, hab.z + STATION.engineering.z, 3);
  if (sim.storm) { const sh = world.buildings.find((v) => v.type === 'shelter'); if (sh && sim.playerExposure > 0) add('shl', t('lbl_shelter'), '#6be08a', sh.x, 3.5, sh.z, 2); }
  ui.setMarks(items);
}

function jobList(): { text: string; urgent: boolean }[] {
  const out: { text: string; urgent: boolean }[] = [];
  for (const m of sim.modules) if (m.broken) out.push({ text: t('job_repair', { name: modName(m.type) }), urgent: true });
  for (const j of sim.jobs) out.push({ text: t(`task_${j.task}` as TextKey), urgent: false });
  return out;
}

// Crew talk: lines are queued and spoken one at a time, as a bubble over the head and a subtitle.
let talkQueue: Line[] = [], nextTalkAt = 0, talkGap = 6.5;
const askedQuiz = new Set<string>();
function say(l: Line): void {
  const text = t(l.key, l.vars);
  crew.say(l.who, text, 6, clock);
  ui.subtitle(sim.crew[l.who].name, text, 6);
}
function queueTalk(lines: Line[], delay: number, gap: number): void {
  talkQueue = lines; nextTalkAt = clock + delay; talkGap = gap;
}
// Next unanswered storm question, as a numbered menu. Right answers earn research points.
function askQuiz(): void {
  const idx = sim.storm?.index ?? 0;
  const qs = makeQuiz(level.storms[idx].info);
  const next = qs.find((x) => !askedQuiz.has(`${idx}:${x.id}`));
  unlockPointer();
  if (!next) { ui.toast(t('quizNone'), 'good'); return; }
  ui.openQuiz(t(next.key), next.options, (i) => {
    askedQuiz.add(`${idx}:${next.id}`);
    if (i === next.correct) { sim.research += 3; sfx.win(); ui.popup('+3 ★'); ui.toast(t('quizRight', { n: 3 }), 'good'); }
    else { sfx.broke(); ui.toast(t('quizWrong', { a: next.options[next.correct] }), 'bad'); }
  });
}

const goalN = (id: string) => { const g = level.goals.find((x) => x.id === id)!; return g.kind.endsWith('Streak') ? Math.round(g.target / level.solLength) : g.target; };
// Fast-forward and skip are for waiting around: they are off while anything is urgent.
const safeInShelter = () => sim.storm?.phase === 'active' && sim.playerExposure === 0 && sim.crew.every((c) => c.sheltered);
const urgent = () => !safeInShelter() && (!!sim.storm || sim.modules.some((m) => m.broken) || sim.stormIndex < level.storms.length && level.storms[sim.stormIndex].warnAt - sim.time < 15);
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
applyQuality();
if (params.has('fps')) document.body.classList.add('showfps');
renderer.setAnimationLoop((now) => {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);
  const paused = ui.blocking() || sim.status !== 'running' || !!intro;
  if (intro) { intro.update(dt); if (intro.done) endIntro(); }

  if (ffMul > 1 && urgent()) { ffMul = 1; byId('btnFF').classList.remove('on'); }
  const reps = paused ? 0 : ffMul;
  for (let rep = 0; rep < reps; rep++) {
    if (ui.blocking() || sim.status !== 'running') break;
    clock += dt;
    const inp = rep === 0 ? input.state : { ...input.state, lookDX: 0, lookDY: 0, jump: false };
    const lookDX = inp.lookDX;
    if (!work) player.update(dt, inp, keys.has('ShiftLeft') || keys.has('ShiftRight'));
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
    if (sim.storm?.phase === 'warning' && !cmeSaid.has(sim.storm.index) && sim.time >= level.storms[sim.storm.index].info.cmeAt) {
      cmeSaid.add(sim.storm.index);
      const inf = level.storms[sim.storm.index].info;
      ui.toast(t('forecast2', { speed: inf.cmeSpeedKmS ?? '?' }), 'bot'); ui.collect('donkiCme');
    }
    if (clock > 25) ui.collect('radIss');
    if (talkQueue.length > 0 && clock >= nextTalkAt) { say(talkQueue.shift()!); nextTalkAt = clock + talkGap; }
    crew.tickSpeech(clock);

    // Build ghost follows where the player is looking, on the ground.
    if (placing) {
      const dist = player.pitch < -0.05 ? Math.max(4, Math.min(12, 1.7 / Math.tan(-player.pitch))) : 12;
      placeX = px - Math.sin(player.yaw) * dist;
      placeZ = pz - Math.cos(player.yaw) * dist;
      placeOk = canPlace(sim, level, placing, placeX, placeZ);
    }
    world.setGhost(placing, placeX, placeZ, placeOk);
    ui.setPlacing(!!placing, placeOk);

    // Interaction: aim, hold, then the mini-step or the close-up work mode.
    if (work) { workFrame(dt); } else {
    if (runner.stage !== 'mini') target = placing ? null : pickTarget();
    const holding = keys.has('KeyE') || ui.actHeld();
    const tg = runner.target;
    runner.speed = 1 / taskSpeed(sim, level);
    const result = runner.update(dt, holding, lookDX, target?.type === 'task' ? target.task : null, px, pz);
    if (result && tg) finishTask(tg, result);
    if (runner.stage === 'hold' && holding) { holdTick -= dt; if (holdTick <= 0) { holdTick = 0.22; sfx.click(); } }
    ui.setRing(runner.stage === 'hold' ? runner.hold : 0);
    if (runner.stage === 'mini' && runner.target) {
      const wk = workKindOf(runner.target);
      if (wk) { const tgt = runner.target; runner.cancel('moved'); startWork(wk, tgt); }
    }
    ui.renderTask(runner, isTouch());
    updatePrompt();
    updateMarks();
    }

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

  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 900);

  // Shadow frustum follows the player so one small map covers what is nearby.
  sun.target.position.copy(player.pos);
  sun.position.set(player.pos.x + 60, player.pos.y + 45, player.pos.z + 30);

  renderer.render(scene, camera);

  acc += rawDt; frames++; worst = Math.max(worst, rawDt);
  if (acc >= 0.5) {
    const info = renderer.info.render;
    fpsEl.textContent = `${Math.round(frames / acc)} fps  worst ${(worst * 1000).toFixed(0)} ms\n${info.calls} calls  ${(info.triangles / 1000).toFixed(0)}k tris  dpr ${renderer.getPixelRatio().toFixed(1)}`;
    if (!params.has('debug') && !paused && rawDt < 0.25 && !document.hidden) {
      lowRun = frames / acc < 28 ? lowRun + 1 : 0;
      if (lowRun >= 6 && quality !== 'low') {
        quality = quality === 'high' ? 'medium' : 'low'; lowRun = 0; applyQuality();
        ui.toast(t('qualityAuto', { q: t(`q_${quality}` as TextKey) }));
      }
    }
    acc = 0; frames = 0; worst = 0;
  }
});
