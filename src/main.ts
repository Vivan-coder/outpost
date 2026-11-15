import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createTerrain, createFarGround, createRocks, heightAt } from './render/terrain';
import { Intro, createLander, LANDER_AT } from './game/intro';
import { CutscenePlayer, shotsLength, MAX_CUTSCENE_SECONDS_PER_DAY } from './cutscenes/engine';
import { buildStormStage, stormFormingShots } from './cutscenes/stormForming';
import { createStars, createEarth, createSun } from './render/sky';
import { createInput } from './game/input';
import { Player, type Blocker } from './game/player';
import { World, type BuildingView } from './game/world';
import { Crew } from './game/crew';
import { TaskRunner, type TaskKind, type TaskResult, type TaskTarget } from './game/tasks';
import { WorkSession, type WorkEnv } from './game/work';
import type { WorkKind } from './data/workTasks';
import { warnTime, eatMeal, MEAL_COST, MEAL_HEALTH, applyEffects, shelterLeak, shieldF, caps, crewOptions, harvestPlant, HARVEST_FOOD, assign, type TaskId, build, canPlace, completeJob, createSim, fix, setShelter, stationExposure, step, taskSpeed, upgrade, upgradeCost, type ModuleType, type SimState } from './sim/sim.ts';
import { STATION, STATION_SPOTS, TASK_SPOT } from './game/layout';
import { moon, stormsForSeed } from './data/moon.ts';
import { mars, MARS_DECISIONS, MARS_GRAVITY } from './data/mars.ts';
import { createUi, factText } from './ui/ui';
import { cardInfo, researchFor, setCardStorm, issDayHigh, issDayLow, type CardId } from './ui/cards';
import { runMissionControl, controlRoom, marsDecision, type McContext } from './ui/mission';
import { DECISIONS, planDecisions, seeded } from './data/decisions';
import { warnLines, stormLines, type Line } from './data/talk';
import { makeQuiz } from './data/quiz';
import { stars as starsOf } from './sim/sim.ts';
import { sfx, unlockAudio, setAudioActive } from './audio/sfx';
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
renderer.shadowMap.autoUpdate = false; // shadows are refreshed on a schedule below (the sun never moves, so this is cheap)

const scene = new THREE.Scene();
const sky = new THREE.Color(0x000000);
scene.background = sky;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
// The camera sits in a rig. It stays at the origin on desktop and phone; in VR the rig is the player's body.
const rig = new THREE.Group();
scene.add(rig); rig.add(camera);

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
scene.add(createRocks());
const terrainMesh = createTerrain(), starsPts = createStars(), earthMesh = createEarth();
scene.add(createFarGround(), terrainMesh, starsPts, earthMesh, sunDisc);
const SUN_DIR = new THREE.Vector3(60, 45, 30).normalize();
const SUN_CALM = new THREE.Color(0xfff4e0), SUN_STORM = new THREE.Color(0xff8a4a);

const isMars = new URLSearchParams(location.search).has('mars');
const level = isMars ? mars : moon;
if (isMars) document.body.classList.add('mars');
// Every run uses a seed: it changes the order of the decision cards and how fast dust builds up. ?seed=123 repeats a run.
const runSeed = Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 1e9);
level.seed = runSeed;
if (!isMars && !new URLSearchParams(location.search).has('judge')) level.storms = stormsForSeed(new URLSearchParams(location.search).has('classic') ? 0 : runSeed);
if (!isMars) level.dustRate = 0.8 + seeded(runSeed)() * 0.6;
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
if (params.has('debug')) Object.assign(window, { outpost: { sim, player, crew, world, runner, keys, askQuiz, camera, renderer, rig, vr: () => vr, startVr: () => onVrClick(), testWork: () => selfTestWork(), intro: () => intro, work: () => work, go: (k: WorkKind, id: number) => startWork(k, { kind: k === 'repair' ? 'repair' : k, mini: 'sequence', moduleId: id, jobId: null, x: 0, z: 0, reach: 9 } as TaskTarget) } });

type Target =
  | { type: 'task'; task: TaskTarget; name: string }
  | { type: 'door'; view: BuildingView }
  | { type: 'console' }
  | { type: 'weather' }
  | { type: 'eat' }
  | { type: 'food' }
  | { type: 'air' }
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
const PIXEL_CAP: Record<Quality, number> = { low: 1, medium: 1.25, high: 2 };
const MSAA: Record<Quality, number> = { low: 0, medium: 2, high: 4 };
let dynScale = 1; // dynamic resolution: drops a little when the frame rate dips and recovers when it is steady
const SHADOW_SIZE: Record<Quality, number> = { low: 512, medium: 1024, high: 2048 };
function applyQuality(): void {
  sun.castShadow = quality !== 'low';
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  applyEnvironment();
  bloomPass.enabled = quality !== 'low';
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = MSAA[quality]; rt.dispose(); }
  sun.shadow.mapSize.set(SHADOW_SIZE[quality], SHADOW_SIZE[quality]);
  resize();
  try { localStorage.setItem('outpost.quality', quality); } catch { /* storage blocked */ }
}
let lowRun = 0, dipRun = 0, steadyRun = 0, shadowTick = 0;

// ---- Image-based lighting from a CC0 sky (Poly Haven), loaded after start-up so it never delays the first frame ----
let envMap: THREE.Texture | null = null;
function applyEnvironment(): void {
  const on = quality !== 'low' && envMap;
  scene.environment = on ? envMap : null; scene.environmentIntensity = 0.55;
  workScene.environment = on ? envMap : null; workScene.environmentIntensity = 0.9;
}
setTimeout(() => {
  new HDRLoader().load('assets/sky/kloppenheim_02_puresky_1k.hdr', (tex) => {
    const pm = new THREE.PMREMGenerator(renderer);
    envMap = pm.fromEquirectangular(tex).texture;
    tex.dispose(); pm.dispose();
    applyEnvironment();
  });
}, 400);

// ---- Post-processing (Medium and High): bloom on bright emissives and a soft vignette. Off on Low. ----
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 2.6);
const vignettePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.4 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - smoothstep(0.38, 0.9, d) * strength; gl_FragColor = c; }',
});
composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(new OutputPass()); composer.addPass(vignettePass);

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
  mc: () => { unlockPointer(); controlRoom(sim, level, (info) => ui.toast(`${t('srcName', { s: info.source })} · ${info.url}`, 'bot'), () => ui.weatherCard(sim)); },
  cardNew: (id: CardId) => { sim.research += 2; sfx.part(); ui.toast(t('newCard', { title: cardInfo(id).title, n: 2 }), 'good'); persistCards(); },
  restart: () => location.reload(),
  tool: (i) => { work?.selectIndex(i); },
  leaveWork: () => leaveWork(),
});

// ---- VR (WebXR): loaded only when the player presses Enter VR, so it never touches the normal game ----
let vr: import('./vr/vr').Vr | null = null;
let vrMod: typeof import('./vr/vr') | null = null;
let vrPaused = false;
let vrSeqT = 0;
let vrPerf = 0; // 0 = full quality ... 3 = lightest (set by the VR frame-time controller)
const xrOn = () => renderer.xr.isPresenting;
const vrHelpers = {
  hud() {
    const cap = caps(sim, level);
    const p = (v: number, m: number) => Math.max(0, Math.min(100, (v / m) * 100));
    const mm = Math.max(0, level.missionLength - sim.time);
    return {
      bars: [
        { label: t('power'), pct: p(sim.power, cap.power), color: '#ffd24a', warn: sim.power / cap.power < 0.25 },
        { label: t('air'), pct: p(sim.air, cap.air), color: '#5ad1ff', warn: sim.air / cap.air < 0.25 },
        { label: t('protect'), pct: p(100 - sim.radiation, 100), color: '#6fd3a8', warn: 100 - sim.radiation < 25 },
      ],
      timer: `${Math.floor(mm / 60)}:${String(Math.floor(mm % 60)).padStart(2, '0')}`,
      sol: t('sol', { n: Math.floor(sim.time / level.solLength) + 1 }),
      dose: t('doseGame', { n: Math.round(sim.radiation * 10) }),
      banner: (byId('banner').innerText || '').split('\n')[0],
      prompt: (byId('prompt').innerText || ''),
      hold: runner.stage === 'hold' ? runner.hold : 0,
      job: (byId('jobs').innerText.split('\n')[1] || ''),
    };
  },
  // The live storm chart for the world-space panel (the DOM chart cannot be seen in VR)
  chart() {
    if (!sim.storm || byId('stormPanel').style.display === 'none') return null;
    return { canvas: byId('spChart') as HTMLCanvasElement, title: byId('spTitle').textContent ?? '', badges: (byId('spBadge').textContent ?? '').trim(), note: byId('spNote').textContent ?? '' };
  },
};
// Framebuffer scale cannot change during a VR session, so it is chosen at the start: lighter if the last session struggled. ?vrscale=0.8 overrides it.
const vrScale = (): number => {
  const q = Number(params.get('vrscale'));
  if (q >= 0.5 && q <= 1.5) return q;
  try { const lvl = Number(localStorage.getItem('outpost.vr.perf') ?? 0); return lvl >= 2 ? 0.75 : lvl === 1 ? 0.85 : 0.9; } catch { return 0.9; }
};

// The Enter VR button appears only when the browser reports immersive VR support, and is re-checked when a headset is plugged in or removed.
let vrBtnEl: HTMLButtonElement | null = null;
async function refreshVrButton(): Promise<void> {
  const ok = vrMod ? await vrMod.Vr.supported() : false;
  if (ok && !vrBtnEl) {
    vrBtnEl = document.createElement('button');
    vrBtnEl.id = 'vrBtn'; vrBtnEl.textContent = t('btnVr');
    vrBtnEl.addEventListener('click', onVrClick);
    document.body.appendChild(vrBtnEl);
  } else if (!ok && vrBtnEl) { vrBtnEl.remove(); vrBtnEl = null; }
}
function setupVrButton(): void {
  if (!navigator.xr) return; // iPhone Safari and other browsers without WebXR never load any VR code
  void import('./vr/vr').then((m) => {
    vrMod = m;
    void refreshVrButton();
    try { navigator.xr?.addEventListener('devicechange', () => { void refreshVrButton(); }); } catch { /* old browser: no devicechange */ }
  });
}
// Straight from the click: start audio and ask for the session while the browser still counts it as a user gesture
function onVrClick(): void {
  unlockAudio();
  if (!vrMod) return;
  let p: Promise<XRSession>;
  try { p = vrMod.Vr.request(); } catch (e) { vrFail(e); return; }
  void startVr(p);
}
function vrFail(e: unknown): void {
  const name = (e as Error | undefined)?.name ?? '';
  const why = name === 'NotSupportedError' ? t('vrWhyNotSupported') : name === 'SecurityError' ? t('vrWhySecurity') : ((e as Error | undefined)?.message ?? t('vrWhyOther')).slice(0, 80);
  vrMod?.Vr.logError(`VR start failed: ${name} ${(e as Error | undefined)?.message ?? ''}`);
  ui.toast(t('vrFailed', { why }), 'bad'); // the game simply carries on in the normal view
}
async function startVr(sessionP: Promise<XRSession>): Promise<void> {
  let session: XRSession;
  try { session = await sessionP; } catch (e) { vrFail(e); return; }
  try {
    if (intro) endIntro(); // the cinematic moves the camera, which is never done to a VR player
    const m = vrMod ?? await import('./vr/vr');
    if (!vr) {
      vr = new m.Vr({
        renderer, scene, camera, rig,
        heightAt: (x, z) => heightAt(x, z),
        blockers: () => blockers,
        setPlayer: (x, z, yaw) => { player.pos.x = x; player.pos.z = z; player.pos.y = heightAt(x, z); player.yaw = yaw; },
        press: (on) => { if (on) { keys.add('KeyE'); actTap(); } else keys.delete('KeyE'); },
        interact: () => !!target,
        hold: () => (runner.stage === 'hold' ? runner.hold : 0),
        work: () => work,
        hud: () => vrHelpers.hud(),
        chart: () => vrHelpers.chart(),
        labels: { resume: t('btnResume'), crew: t('btnCrew'), shelter: t('vrShelter'), fastForward: t('vrFF'), data: t('btnLab'), log: t('btnLog'), exit: t('vrExit'), back: t('btnBack'), ok: t('btnGotIt'), rest: t('choreRest'), menu: t('pauseTitle'), hold: t('vrHold'), stepBack: t('vrStepBack'), diag: t('vrDiag'), copy: t('vrCopy') },
        crew: () => sim.crew.map((c, i) => ({ name: c.name, doing: c.chore ? t(`task_${c.chore}` as TextKey) : t(`act_${activities()[i]}` as TextKey), options: crewOptions(sim, level).slice(0, 5).map((o) => ({ id: o.id, label: t(`task_${o.id}` as TextKey) })) })),
        assign: (i, id) => { assign(sim, level, i, id as TaskId | null); if (id) ui.toast(t('assigned', { name: sim.crew[i].name, chore: t(`task_${id}` as TextKey) }), 'good'); },
        callShelter: () => { if (!sim.shelterCall) { setShelter(sim, true); sfx.alarm(); } },
        toggleFF: () => toggleFF(),
        dataLines: () => [t('labIntro'), t('lab_donki'), t('lab_radlab'), t('lab_osdr'), t('lab_alsj')],
        logLines: () => ui.collectedIds().length ? ui.collectedIds().map((id) => `${cardInfo(id).title}: ${cardInfo(id).line}`) : [t('logLocked')],
        setPaused: (on) => { vrPaused = on; },
        setAudio: (on) => setAudioActive(on),
        setPerf: (lvl) => { vrPerf = lvl; sun.castShadow = quality !== 'low' && lvl < 2; },
        remember: (lvl) => { try { localStorage.setItem('outpost.vr.perf', String(lvl)); } catch { /* private window */ } },
        rtl: () => document.documentElement.dir === 'rtl',
        get scale() { return vrScale(); },
        get debug() { return params.has('vrdebug'); },
        onStart: () => {
          document.body.classList.add('xr');
          ui.setVrHook({
            note: (k) => vr?.toast(t(k)),
            crew: (only) => vr?.crewMenu(only),
            menu: () => vr?.mainMenu(),
            card: (title, lines, button, onClose) => vr?.card(title, lines, button, onClose),
            toast: (text) => vr?.toast(text),
            subtitle: (name, text, sec) => vr?.subtitle(name, text, sec),
          });
          for (const id of ['menu', 'overlay']) byId(id).classList.remove('on');
          unlockAudio();
          vr?.toast(t('vrHelp'));
        },
        onEnd: () => {
          document.body.classList.remove('xr');
          ui.setVrHook(null);
          if (work) leaveWork();
          sun.castShadow = quality !== 'low'; vrPerf = 0;
          camera.position.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
          player.update(0, input.state);
          resize();
        },
      });
    }
    rig.position.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z);
    rig.rotation.y = player.yaw;
    await vr.enter(session);
  } catch (e) { vrFail(e); }
}

// ---- Work mode: close-up hands-on tasks ----
// The machine being worked on is shown on its own stage with its own lights and a plain backdrop. Nothing from the
// base (walls, props, crew, other machines) is in that scene, so nothing can get in the way. The world is untouched.
const workScene = new THREE.Scene();
workScene.background = new THREE.Color(0x0c111b);
{
  workScene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1c2330, 1.1));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.4); key.position.set(2.5, 3.5, 5); workScene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb0ff, 1.0); rim.position.set(-4, 1, -3); workScene.add(rim);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; g.fillStyle = '#121a28'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#1f2c44'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 4); tex.colorSpace = THREE.SRGBColorSpace;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshBasicMaterial({ map: tex })); wall.position.z = -3; workScene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.85, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -2.1, 3); workScene.add(floor);
}
const workFade = document.getElementById('workFade') as HTMLElement;
function fadeFromBlack(): void { workFade.style.transition = 'none'; workFade.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { workFade.style.transition = 'opacity .45s'; workFade.style.opacity = '0'; })); }
// The stage needs a tight depth range, so decals and screens never z-fight.
function stageCamera(on: boolean): void { camera.near = on ? 0.1 : 0.1; camera.far = on ? 60 : 1200; camera.fov = on ? 52 : 70; camera.updateProjectionMatrix(); }
let work: WorkSession | null = null;
let workTarget: TaskTarget | null = null;
let workDoneAt = 0;
const sessions = new Map<string, WorkSession>();
const lastNdc = new THREE.Vector2();
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
  if (work) workScene.remove(work.group);
  const key = `${kind}:${tg.moduleId}`;
  let ses = sessions.get(key);
  if (!ses) { ses = new WorkSession(kind, workEnv, workFx); sessions.set(key, ses); }
  work = ses; workTarget = tg; workDoneAt = 0;
  if (xrOn()) { scene.add(ses.group); vr?.placeWork(ses.group); input.enabled = false; sfx.click(); return; }
  world.markersHidden = true;
  workScene.add(ses.group);
  stageCamera(true);
  fadeFromBlack();
  input.enabled = false;
  unlockPointer();
  sfx.click();
}

// Leaving keeps the session, so the steps already done stay done when you come back.
function leaveWork(): void {
  if (!work) return;
  work.group.removeFromParent();
  work = null; workTarget = null;
  world.markersHidden = false;
  input.enabled = true;
  if (xrOn()) return;
  stageCamera(false);
  fadeFromBlack();
  player.update(0, input.state);
  ui.setWork(null, isTouch());
}

function finishWork(): void {
  const tg = workTarget, ses = work;
  if (!tg || !ses) return;
  sessions.delete(`${ses.kind}:${tg.moduleId}`);
  ses.group.removeFromParent();
  work = null; workTarget = null;
  world.markersHidden = false;
  input.enabled = true;
  if (!xrOn()) {
    stageCamera(false);
    fadeFromBlack();
    player.update(0, input.state);
    ui.setWork(null, isTouch());
  }
  finishTask(tg, 'done');
  const why = tg.kind === 'solar' ? 'dustPanels' : tg.kind === 'water' ? 'water90' : null;
  if (why) { const f = factText(why); if (f) ui.toast(`${t('whyTitle')}: ${f}`, 'bot'); }
  ui.toast(t('ws_simplified'));
}

// Debug self-test: enters and leaves every work-mode task and checks the stage is isolated and the world camera comes back exactly.
function selfTestWork(): string[] {
  const out: string[] = [];
  const kinds: [WorkKind, string][] = [['repair', 'solar'], ['solar', 'solar'], ['water', 'tank'], ['greenhouse', 'greenhouse']];
  for (const [k, type] of kinds) {
    const m = sim.modules.find((x) => x.type === type)!;
    const p0 = camera.position.clone(), q0 = camera.quaternion.clone();
    startWork(k, { kind: k, mini: 'sequence', moduleId: m.id, jobId: null, x: 0, z: 0, reach: 9 } as TaskTarget);
    const g = work!.group;
    const stage = g.parent === workScene && !scene.children.includes(g);
    const marksHidden = world.markersHidden;
    const stageKids = workScene.children.length;
    leaveWork();
    const back = camera.position.distanceTo(p0) < 1e-3 && camera.quaternion.angleTo(q0) < 1e-3 && camera.near === 0.1 && camera.far === 1200 && !work && g.parent === null;
    out.push(`${k}: onOwnStage=${stage} markersHidden=${marksHidden} stageObjects=${stageKids} worldRestored=${back}`);
  }
  return out;
}

function workFrame(dt: number): void {
  if (!work) return;
  work.update(dt);
  if (xrOn()) { if (work.done) { workDoneAt += dt; if (workDoneAt > 0.9) finishWork(); } return; }
  const f = work.frame(52, camera.aspect);
  camera.position.copy(f.pos);
  camera.quaternion.identity();
  camera.lookAt(f.look);
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
  if (hab) consider(hab.x + STATION_SPOTS.engineering.x, hab.z + STATION_SPOTS.engineering.z, 2.4, 1.4, 0.2, () => ({ type: 'console' }));
  if (hab) consider(hab.x + STATION_SPOTS.weather.x, hab.z + STATION_SPOTS.weather.z, 2.4, 1.4, 0.25, () => ({ type: 'weather' }));
  // Galley and life support you can use: eat at the canteen, read the food and oxygen levels
  if (hab) {
    consider(hab.x + STATION.canteen.x, hab.z + STATION.canteen.z, 2.0, 1.2, -0.8, () => ({ type: 'eat' }));
    consider(hab.x + STATION.foodLocker.x, hab.z + STATION.foodLocker.z, 2.4, 1.4, -0.4, () => ({ type: 'food' }));
    consider(hab.x + STATION.o2.x, hab.z + STATION.o2.z, 2.6, 1.6, -0.4, () => ({ type: 'air' }));
  }
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
  } else if (target.type === 'eat') {
    const r = eatMeal(sim);
    if (r === 'ok') { sfx.part(); ui.popup('🍲 +' + MEAL_HEALTH + ' ♥'); ui.toast(t('eatOk', { cost: MEAL_COST, gain: MEAL_HEALTH }), 'good'); } else { sfx.click(); ui.toast(t(r === 'empty' ? 'eatEmpty' : r === 'full' ? 'eatFull' : 'eatWait'), r === 'empty' ? 'bad' : undefined); }
  } else if (target.type === 'food' || target.type === 'air') {
    sfx.click();
    const food = target.type === 'food', cap = caps(sim, level);
    const have = food ? sim.food : sim.air, full = food ? cap.food : cap.air;
    // Minutes left at the current rate over the last day: simple, labelled as a game estimate
    const rate = Math.max(0.01, ((food ? sim.dayStart.food : sim.dayStart.air) - have) / Math.max(1, sim.time - sim.dayStart.time));
    const mins = rate <= 0.011 ? '99+' : String(Math.max(0, Math.round(have / rate / 60 * 10) / 10));
    ui.toast(t(food ? 'foodInfo' : 'airInfo', { p: Math.round(have / full * 100), m: mins }));
  } else if (target.type === 'weather') {
    unlockPointer(); sfx.click();
    controlRoom(sim, level, (info) => ui.toast(`${t('srcName', { s: info.source })} · ${info.url}`, 'bot'), () => ui.weatherCard(sim));
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
  if (cine) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') cine.finish(); return; }
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

// The visible area: on phones the browser bars hide part of the window, so use the visual viewport when there is one.
const vpW = (): number => Math.round(window.visualViewport?.width ?? innerWidth);
const vpH = (): number => Math.round(window.visualViewport?.height ?? innerHeight);
function resize(): void {
  if (renderer.xr.isPresenting) return; // the headset sets the size; changing it mid-session is not allowed
  (window as unknown as { __fitViewport?: () => void }).__fitViewport?.();
  const w = vpW(), h = vpH();
  renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP[quality]) * dynScale);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => { setTimeout(resize, 60); setTimeout(resize, 400); });
window.visualViewport?.addEventListener('resize', resize);
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
    onClose: () => { unlockAudio(); dayFlow(true); },
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
  sim.time = 236; sim.sampleAt = 236; sim.day = 3; sim.dayStart = { time: 236, power: 75, air: 85, food: 70, health: 88, radiation: 0, research: 6 }; sim.nextJobAt = 236; sim.eventIndex = level.events.filter((e) => e.at < 236).length;
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
function showMarsBriefing(): void {
  ui.card({
    title: t('marsTitle'),
    paragraphs: [t('marsBody'), t('fact_gravityMars'), t('fact_commsDelay'), t('fact_dustOpportunity'), t('marsGoal')],
    button: t('btnStart'),
    onClose: () => { unlockAudio(); dayFlow(true); },
    extra: [{ label: t('marsBack'), onClick: () => { location.href = location.pathname; } }],
  });
}
function showJudge(): void {
  ui.card({ title: t('judgeTitle'), paragraphs: [t('judgeBody')], button: t('btnStart'), onClose: () => { unlockAudio(); dayFlow(true); } });
}
// ---- Mars preview ----
const radio = { until: 0, id: '', best: null as null | typeof MARS_DECISIONS[number]['best'], asked: new Set<string>() };
const radioEl = byId('radio');
function radioDelaySeconds(): number { return Math.max(6, Math.round((level.commsDelay ?? 20) / commsFOf())); }
function commsFOf(): number { return Math.max(0.5, Math.min(1.5, sim.budget.comms / 15)); }
function updateRadio(): void {
  if (!isMars) return;
  const left = radio.until - sim.time;
  radioEl.textContent = left > 0 ? `${t('radioLabel')} · ${t('radioWaiting', { s: Math.ceil(left) })}` : `${t('radioLabel')} · ${t('radioIdle', { s: radioDelaySeconds() })}`;
  if (radio.best && left <= 0) {
    const best = radio.best; radio.best = null;
    applyEffects(sim, level, best);
    ui.toast(t('radioReply', { a: t(`mars_${radio.id}_ans` as TextKey) }) + ' ' + t('marsReplyApplied'), 'bot'); sfx.allClear();
  }
  for (const d of MARS_DECISIONS) {
    if (!radio.asked.has(d.id) && sim.time >= d.at && !ui.blocking()) {
      radio.asked.add(d.id);
      unlockPointer();
      const delay = radioDelaySeconds();
      marsDecision(d.id, delay, { a: d.a, wait: d.wait }, (choice) => {
        if (choice === 'a') applyEffects(sim, level, d.a);
        else { applyEffects(sim, level, d.wait); radio.until = sim.time + delay; radio.id = d.id; radio.best = d.best; }
      }, (info) => ui.toast(`${t('srcName', { s: info.source })} · ${info.url}`, 'bot'));
      break;
    }
  }
}
if (isMars) {
  player.gravity = MARS_GRAVITY;
  (terrainMesh.material as THREE.MeshStandardMaterial).color.setHex(0xe0a070);
  starsPts.visible = false;
  earthMesh.scale.setScalar(0.12); (earthMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x6fa0ff);
  sunDisc.scale.setScalar(0.55);
  sun.color.setHex(0xffd9a8);
}
const skipIntroNow = params.has('skip') || params.has('nointro') || judge || isMars;
if (skipIntroNow) {
  const l = createLander();
  l.group.position.set(LANDER_AT.x, 0, LANDER_AT.z); l.group.remove(l.flame, l.light); l.hatch.rotation.z = -1.7; l.ladder.visible = true;
  scene.add(l.group);
  world.extraBlockers.push({ x: LANDER_AT.x, z: LANDER_AT.z, r: 2.4 });
  world.sync(sim);
  if (isMars) showMarsBriefing(); else if (judge) showJudge(); else showTutorial();
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
      case 'dayStart': if (xrOn()) vrDayReport(); else dayFlow(false); break;
      case 'dustStart': ui.toast(t('mars_dust_t'), 'bad'); break;
      case 'dustEnd': break;
      case 'autoRepair': { const m = sim.modules.find((mod) => mod.id === e.id); sfx.fix(); if (m) ui.toast(t('autoRepaired', { name: modName(m.type) }), 'good'); break; }
      case 'goal': sfx.win(); ui.toast(t('goalDone', { goal: t(`goal_${e.id}` as TextKey, { n: goalN(e.id) }) }), 'good'); break;
      case 'stormWarn': {
        sfx.alarm(); sirenAt = clock + 12; bot('botStorm'); queueTalk(warnLines(level.storms[e.index]), 4, 5);
        setCardStorm(level.storms[e.index].info);
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
        queueTalk(stormLines(level.storms[e.index], level.storms[e.index].info.kp, factText), 6, 6.5);
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
        {
          const info = level.storms[e.index].info;
          const kp = info.kp;
          unlockPointer();
          ui.card({
            title: t('infoTitle'),
            paragraphs: [
              t('infoBody1', { date: info.sepTimeUtc.replace('T', ' ').replace('Z', ''), cls: info.flareClass }),
              t('infoBody2'), t('infoBody3', { kp }), t('doseCompare', { n: Math.round(sim.radiation * 10), lo: issDayLow, hi: issDayHigh }), t('infoBody4'),
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
        ui.end(sim, () => location.reload(), isMars ? { title: t('marsDone'), label: t('marsBack'), onClick: () => { location.href = location.pathname; } } : sim.status === 'won' ? { label: t('marsNext'), onClick: () => { location.href = location.pathname + '?mars=1'; } } : undefined);
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
  } else if (target.type === 'eat' || target.type === 'food' || target.type === 'air') {
    const action = t(target.type === 'eat' ? 'do_eat' : target.type === 'food' ? 'do_food' : 'do_air');
    ui.setPrompt(touch ? t('promptTapTouch', { action }) : t('promptTap', { key: 'E', action }), t(target.type === 'eat' ? 'btnAct_eat' : 'btnAct_check'));
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
  const w = vpW(), h = vpH();
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
  if (hab && sim.research >= cheapest) add('con', t('btnAct_console'), '#7fe0ff', hab.x + STATION_SPOTS.engineering.x, 2.4, hab.z + STATION_SPOTS.engineering.z, 3);
  if (sim.storm) { const sh = world.buildings.find((v) => v.type === 'shelter'); if (sh && sim.playerExposure > 0) add('shl', t('lbl_shelter'), '#6be08a', sh.x, 3.5, sh.z, 2); }
  ui.setMarks(items);
}

// One clear next step for the player, shown at the top of the screen whenever no storm message is up
function objective(): string {
  if (sim.status !== 'running') return '';
  const broken = sim.modules.find((m) => m.broken);
  if (broken) return t('obj_fix', { name: modName(broken.type) });
  if (sim.jobs.length) return t('obj_job', { job: t(`task_${sim.jobs[0].task}` as TextKey) });
  if (sim.stormIndex < level.storms.length) {
    const left = Math.max(0, warnTime(sim, level, sim.stormIndex) - sim.time);
    return left < 240 ? t('obj_wait', { t: `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` }) : t('obj_free');
  }
  return t('obj_free');
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

// ---- Mission Control: each day starts with a summary, decision cards and the power plan ----
let choicesToday: string[] = [];
const DAY_NOTES = ['exercise2h', 'water90', 'bone1', 'flareScale', 'dustPanels', 'water90', 'exercise2h', 'bone1', 'flareScale', 'dustPanels', 'water90', 'exercise2h'];
const decisionPlan = planDecisions(14, runSeed);
// ---- Cutscenes: short in-engine explainers driven by the bundled NASA records ----
let cine: CutscenePlayer | null = null;
const cineQueue: (() => void)[] = []; // waits for a safe moment: no menu, no task
let cineToday = 0; // seconds of cutscene played today (limit about 25)
const CINE_SEEN = 'outpost.cine.stormForming';
const cineSeen = (): boolean => { try { return localStorage.getItem(CINE_SEEN) === '1'; } catch { return false; } };
const reduceMotion = (): boolean => params.has('reduce') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const GUIDE_SEEN = 'outpost.guide.seen';
function showGuideOnce(): void {
  try { if (localStorage.getItem(GUIDE_SEEN)) return; localStorage.setItem(GUIDE_SEEN, '1'); } catch { /* private window: show it */ }
  unlockPointer();
  ui.card({ title: t('guide_title'), paragraphs: [t('guide_1'), t('guide_2'), t('guide_3')], button: t('btnGotIt') });
}
function playStormCutscene(idx: number, full: boolean, after?: () => void): void {
  const info = level.storms[idx]?.info;
  if (!info || xrOn() || cine) { after?.(); return; }
  const shots = stormFormingShots(info, !full && cineSeen());
  if (!full && cineToday + shotsLength(shots) > MAX_CUTSCENE_SECONDS_PER_DAY) { after?.(); return; }
  unlockPointer(); unlockAudio();
  const p: CutscenePlayer = new CutscenePlayer(buildStormStage(), shots, {
    camera, root: byId('cineUi'), reduceMotion: reduceMotion(), skipLabel: t('cine_skip'),
    fx: { hiss: () => sfx.hiss(), thud: () => sfx.thud(), alarm: () => sfx.alarm(), click: () => sfx.click() },
    onEnd: () => {
      cine = null; cineToday += p.elapsed;
      try { localStorage.setItem(CINE_SEEN, '1'); } catch { /* private window */ }
      player.update(0, input.state);
      after?.();
      showGuideOnce();
    },
  });
  cine = p;
}
window.addEventListener('outpost:cine', () => { cineQueue.push(() => playStormCutscene(sim.storm?.index ?? Math.min(sim.stormIndex, level.storms.length - 1), true)); });
if (params.has('debug')) Object.assign((window as unknown as { outpost: object }).outpost, { cine: (full = true) => playStormCutscene(0, full), cinePlayer: () => cine, cineState: () => ({ playing: !!cine, queued: cineQueue.length, today: cineToday }) });

// The evening report for VR: the same numbers and notes as the desktop screen, as a world-space panel
function vrDayReport(): void {
  const r = sim.lastDay;
  if (!r || !vr) return;
  const cp = caps(sim, level);
  const pc = (v: number, m: number) => Math.round(Math.max(0, Math.min(100, (v / m) * 100)));
  const a = [pc(r.start.power, cp.power), pc(r.start.air, cp.air), 100 - Math.round(r.start.radiation)];
  const b = [pc(r.end.power, cp.power), pc(r.end.air, cp.air), 100 - Math.round(r.end.radiation)];
  const d = (x: number) => (x > 0 ? '+' : '') + Math.round(x);
  const lines = [
    `${t('power')}: ${a[0]} → ${b[0]}`, `${t('air')}: ${a[1]} → ${b[1]}`, `${t('protect')}: ${a[2]} → ${b[2]}`,
    t('sum_air', { d: d(b[1] - a[1]), p: r.budget.life }),
    r.storm ? t('sum_storm', { p: r.budget.shield, d: d(b[2] - a[2]) }) : '',
    t('sum_pow', { d: d(b[0] - a[0]) }), t('sum_sci', { p: r.budget.science, n: Math.round(r.budget.science / 10) }), t('sum_trade'),
  ].filter(Boolean);
  const note = DAY_NOTES[(r.day - 1 + 12) % 12];
  lines.push(`${t('sum_real')} ${t(`fact_${note}` as TextKey)} (${t('badgeReal')})`);
  vr.card(t('sumTitle', { n: r.day }), lines, t('mcNext'));
}

function dayFlow(first: boolean): void {
  if (new URLSearchParams(location.search).has('nodash') || xrOn()) return;
  if (isMars && !first) return; // the preview is short: one power plan, then radio decisions
  const day = sim.day + 1;
  cineToday = 0;
  const ctx: McContext = {
    day, report: first ? null : sim.lastDay, choices: first ? [] : choicesToday.splice(0), decisions: decisionPlan[day - 1] ?? [], gentle: day === 1,
    dayNote: first ? null : DAY_NOTES[(day - 2 + 12) % 12],
    applyDecision: (id, o) => { const dec = DECISIONS.find((d) => d.id === id)!; applyEffects(sim, level, dec[o]); choicesToday.push(t(`dec_${id}_${o}` as TextKey)); sfx.build(); },
    openSource: (info) => ui.toast(`${t('srcName', { s: info.source })} · ${info.url}`, 'bot'),
    onDone: (b) => {
      sim.budget = b; sfx.fix(); unlockAudio();
      // A storm will be announced during this day: explain it with the real data first
      if (sim.stormIndex < level.storms.length && warnTime(sim, level, sim.stormIndex) <= sim.time + level.solLength) { const idx = sim.stormIndex; cineQueue.push(() => playStormCutscene(idx, false)); }
    },
  };
  unlockPointer();
  runMissionControl(sim, level, ctx, { decisionEffects: (id, o) => DECISIONS.find((d) => d.id === id)![o] });
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
setupVrButton();

// FPS meter: average + worst frame over each half second, for the phone gate.
let last = performance.now(), acc = 0, frames = 0, worst = 0;
applyQuality();
if (params.has('fps')) document.body.classList.add('showfps');
renderer.setAnimationLoop((now) => {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);
  const paused = ui.blocking() || sim.status !== 'running' || !!intro || !!cine || vrPaused;
  if (xrOn()) { try { vr?.update(dt); } catch (e) { vrMod?.Vr.logError(`vr.update: ${String(e)}`); } }
  if (cine) cine.update(dt);
  else if (cineQueue.length && !ui.blocking() && !work && runner.stage === 'idle' && sim.status === 'running') cineQueue.shift()!();
  if (intro) { intro.update(dt); if (intro.done) endIntro(); }

  if (ffMul > 1 && urgent()) { ffMul = 1; byId('btnFF').classList.remove('on'); }
  const reps = paused ? 0 : ffMul;
  for (let rep = 0; rep < reps; rep++) {
    if (ui.blocking() || sim.status !== 'running') break;
    clock += dt;
    const inp = rep === 0 ? input.state : { ...input.state, lookDX: 0, lookDY: 0, jump: false };
    const lookDX = inp.lookDX;
    if (!work && !xrOn()) player.update(dt, inp, keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const px = player.pos.x, pz = player.pos.z;

    // Only the shelter stops the radiation; the station's thin walls stop half.
    const inside = world.buildingAt(px, pz);
    sim.playerExposure = inside < 0 ? 1 : world.buildings[inside].type === 'shelter' ? shelterLeak(sim) : Math.min(1, stationExposure(sim, level) / shieldF(sim));
    crew.update(dt, sim, px, pz);

    simAcc += dt;
    let ticked = false;
    while (simAcc >= TICK) { step(sim, level, TICK); simAcc -= TICK; ticked = true; }
    if (ticked) { handleEvents(); ui.setObjective(objective()); ui.update(sim, clock, crew.safeCount(sim)); ui.setJobs(jobList()); }

    world.update(dt, sim, clock, px, pz, crew.positions());
    if (sim.storm?.phase === 'warning' && !cmeSaid.has(sim.storm.index) && sim.time >= level.storms[sim.storm.index].info.cmeAt) {
      cmeSaid.add(sim.storm.index);
      const inf = level.storms[sim.storm.index].info;
      ui.toast(t('forecast2', { speed: inf.cmeSpeedKmS ?? '?' }), 'bot'); ui.collect('donkiCme');
    }
    if (clock > 25) ui.collect('radIss');
    updateRadio();
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
    let lookForTask = lookDX;
    if (xrOn() && runner.stage === 'mini') {
      if (runner.mini === 'wipe') lookForTask = holding ? Math.sin(clock * 9) * 0.12 : 0;
      else if (runner.mini === 'sequence' && holding) { vrSeqT -= dt; if (vrSeqT <= 0) { vrSeqT = 0.5; seqPress(runner.order[runner.index]); } }
    }
    const result = runner.update(dt, holding, lookForTask, target?.type === 'task' ? target.task : null, px, pz);
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
    const dustLook = sim.dustActive ? 0.55 : 0;
    skyMix += (dustLook - skyMix) * Math.min(1, dt * 0.5) * (sim.storm ? 0 : 1);
    if (isMars) sky.setRGB(0.42 * (1 - 0.5 * dustLook) + 0.2 * skyMix, 0.27 * (1 - 0.5 * dustLook) + 0.035 * skyMix, 0.16 * (1 - 0.5 * dustLook) + 0.012 * skyMix);
    else sky.setRGB(0.2 * skyMix, 0.035 * skyMix, 0.012 * skyMix);
    sun.color.copy(SUN_CALM).lerp(SUN_STORM, skyMix);

    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hintEl.style.display = 'none'; }
  }
  input.consume();

  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 900);

  // Shadow frustum follows the player so one small map covers what is nearby.
  sun.target.position.copy(player.pos);
  sun.position.set(player.pos.x + 60, player.pos.y + 45, player.pos.z + 30);

  shadowTick++;
  if (xrOn()) { if (shadowTick % (vrPerf >= 1 ? 6 : 3) === 0) renderer.shadowMap.needsUpdate = true; } else if (quality === 'high' || shadowTick % 2 === 0) renderer.shadowMap.needsUpdate = true;
  if (xrOn()) renderer.render(scene, camera); // no post-processing in VR
  else if (quality === 'low') renderer.render(cine ? cine.scene : work ? workScene : scene, camera);
  else { renderPass.scene = cine ? cine.scene : work ? workScene : scene; composer.render(); }

  acc += rawDt; frames++; worst = Math.max(worst, rawDt);
  if (acc >= 0.5) {
    const info = renderer.info.render;
    fpsEl.textContent = `${Math.round(frames / acc)} fps  worst ${(worst * 1000).toFixed(0)} ms\n${info.calls} calls  ${(info.triangles / 1000).toFixed(0)}k tris  dpr ${renderer.getPixelRatio().toFixed(1)}`;
    if (!params.has('debug') && !paused && rawDt < 0.25 && !document.hidden && !xrOn()) {
      const f = frames / acc;
      dipRun = f < 52 ? dipRun + 1 : 0;
      steadyRun = f >= 58 ? steadyRun + 1 : 0;
      if (dipRun >= 2 && dynScale > 0.65) { dynScale = Math.max(0.65, dynScale - 0.1); dipRun = 0; resize(); }
      else if (steadyRun >= 8 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); steadyRun = 0; resize(); }
      // Only if the lowest resolution still cannot keep up do we lower the quality setting
      lowRun = f < 28 && dynScale <= 0.65 ? lowRun + 1 : 0;
      if (lowRun >= 6 && quality !== 'low') {
        quality = quality === 'high' ? 'medium' : 'low'; lowRun = 0; dynScale = 1; applyQuality();
        ui.toast(t('qualityAuto', { q: t(`q_${quality}` as TextKey) }));
      }
    }
    acc = 0; frames = 0; worst = 0;
  }
});

// iPhone/iPad Safari keeps its bars on screen: suggest installing the game once, so it can run full screen
{
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  if (isIos && !standalone) {
    setTimeout(() => {
      try { if (localStorage.getItem('outpost.iosTip')) return; localStorage.setItem('outpost.iosTip', '1'); } catch { /* private window: show it anyway */ }
      ui.toast(t('iosTip'), 'bot');
    }, 12000);
  }
}

// Phone: switches to hide and show the menu buttons and the task list (remembered)
{
  const KEY = 'outpost.hidden.panels';
  let hidden: string[] = [];
  try { hidden = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* ignore */ }
  const apply = () => {
    document.body.classList.toggle('hide-menu', hidden.includes('menu'));
    document.body.classList.toggle('hide-tasks', hidden.includes('tasks'));
    byId('tglMenu').classList.toggle('off', hidden.includes('menu'));
    byId('tglTasks').classList.toggle('off', hidden.includes('tasks'));
    try { localStorage.setItem(KEY, JSON.stringify(hidden)); } catch { /* ignore */ }
  };
  const flip = (name: string) => { hidden = hidden.includes(name) ? hidden.filter((x) => x !== name) : [...hidden, name]; sfx.click(); apply(); };
  byId('tglMenu').title = t('tglMenu'); byId('tglTasks').title = t('tglTasks');
  byId('tglMenu').addEventListener('click', () => flip('menu'));
  byId('tglTasks').addEventListener('click', () => flip('tasks'));
  apply();
}
