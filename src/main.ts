import * as THREE from 'three';
import { createTerrain } from './render/terrain';
import { createStars, createEarth } from './render/sky';
import { createInput } from './game/input';
import { Player, type Blocker } from './game/player';
import { World } from './game/world';
import { Crew } from './game/crew';
import { assign, build, canPlace, createSim, fix, setShelter, step, type ModuleType } from './sim/sim.ts';
import { moon } from './data/moon.ts';
import { nasaRecords, NASA_SOURCE } from './data/nasaStorm.ts';
import { createUi } from './ui/ui';
import { sfx, unlockAudio } from './audio/sfx';
import { t, type TextKey } from './i18n/en';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

// Harsh single sun, almost no fill: there is no atmosphere to scatter light on the Moon.
const sun = new THREE.DirectionalLight(0xfff4e0, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x223355, 0x111111, 0.4));
scene.add(createTerrain(), createStars(), createEarth());

const level = moon;
const sim = createSim(level);
const blockers: Blocker[] = [];
const world = new World(scene, blockers, level);
world.sync(sim);
const crew = new Crew(scene, sim, level, blockers);
const input = createInput(canvas);
const player = new Player(camera, blockers);

let placing: ModuleType | null = null;
let placeX = 0, placeZ = 0, placeOk = false;
let fixId: number | null = null;
let clock = 0; // seconds of unpaused play, for banners and animation

const modName = (type: ModuleType) => t(`mod_${type}` as TextKey);
const unlockPointer = () => { if (document.pointerLockElement) document.exitPointerLock(); };

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
  fix() {
    if (fixId === null) return;
    const m = sim.modules.find((mod) => mod.id === fixId);
    if (m && fix(sim, fixId)) { sfx.fix(); ui.toast(t('fixed', { name: modName(m.type) }), 'good'); }
  },
  assign(i, chore) {
    assign(sim, i, chore);
    if (chore) {
      const def = level.chores.find((c) => c.id === chore)!;
      if (def.at !== 'rockPile' && !sim.modules.some((m) => m.type === def.at)) {
        ui.toast(t('crewNoModule', { name: sim.crew[i].name }), 'bad');
      }
    }
  },
  toggleShelter() {
    setShelter(sim, !sim.shelterCall);
    if (sim.shelterCall) sfx.alarm(); else sfx.allClear();
  },
});

const phases = () => crew.members.map((m) => m.phase);
const openBuild = () => { unlockPointer(); placing = null; sfx.click(); ui.openBuild(sim); };
const openCrew = () => { unlockPointer(); sfx.click(); ui.openCrew(sim, phases()); };
document.getElementById('buildBtn')!.addEventListener('click', openBuild);
document.getElementById('crewBtn')!.addEventListener('click', openCrew);

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape') { placing = null; ui.closeMenu(); return; }
  if (ui.blocking()) {
    if ((e.code === 'KeyB' && ui.menuOpen() === 'build') || (e.code === 'KeyC' && ui.menuOpen() === 'crew')) ui.closeMenu();
    return;
  }
  if (e.code === 'KeyE') { if (placing) uiPlace(); else uiFix(); }
  else if (e.code === 'KeyB') openBuild();
  else if (e.code === 'KeyC') openCrew();
  else if (e.code === 'KeyH' && (sim.storm || sim.shelterCall)) document.getElementById('shelterBtn')!.click();
});
const uiPlace = () => document.getElementById('placeBtn')!.click();
const uiFix = () => document.getElementById('fixBtn')!.click();
// Desktop: with the mouse captured, a click places the module.
canvas.addEventListener('mousedown', () => { if (placing && document.pointerLockElement === canvas) uiPlace(); });
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

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
let hintTimer = 12;

ui.card({
  title: t('tutorialTitle'),
  paragraphs: [t('tutorialBody')],
  list: [t('tut1'), t('tut2'), t('tut3'), t('tut4'), t('tut5')],
  button: t('btnStart'),
  onClose: unlockAudio,
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
      case 'stormWarn': sfx.alarm(); break;
      case 'stormStart': sfx.alarm(); break;
      case 'stormEnd': {
        sfx.allClear();
        ui.toast(t('stormOver'), 'good');
        if (e.index === 0) {
          const rec = nasaRecords[level.storms[0].recordId];
          unlockPointer();
          ui.card({
            title: t('infoTitle'),
            paragraphs: [
              t('infoBody1', { date: rec.timeUtc.replace('T', ' ').replace('Z', '') }),
              t('infoBody2'), t('infoBody3'), t('infoBody4'),
            ],
            source: `${t('infoSource', { source: NASA_SOURCE, id: rec.id })} · ${rec.url}`,
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
      case 'part': sfx.part(); ui.toast(t('partFound'), 'good'); break;
      case 'end': {
        unlockPointer();
        placing = null;
        if (sim.status === 'won') sfx.win(); else sfx.lose();
        ui.end(sim, () => location.reload());
        break;
      }
    }
  }
  sim.outbox.length = 0;
}

const TICK = 1 / level.tickHz;
let simAcc = 0;
ui.update(sim, clock);
player.update(0, input.state); // place the camera before the first (paused) frame

// FPS meter: average + worst frame over each half second, for the phone gate.
let last = performance.now(), acc = 0, frames = 0, worst = 0;
renderer.setAnimationLoop((now) => {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);
  const paused = ui.blocking() || sim.status !== 'running';

  if (!paused) {
    clock += dt;
    player.update(dt, input.state);

    const hab = level.modules.habitat.radius;
    sim.playerSheltered = Math.hypot(player.pos.x, player.pos.z) < hab + 2.5;
    crew.update(dt, sim);

    simAcc += dt;
    let ticked = false;
    while (simAcc >= TICK) { step(sim, level, TICK); simAcc -= TICK; ticked = true; }
    if (ticked) { handleEvents(); ui.update(sim, clock); }

    world.update(dt, sim, clock);

    // Build ghost follows where the player is looking, on the ground.
    if (placing) {
      const dist = player.pitch < -0.05 ? Math.max(4, Math.min(12, 1.7 / Math.tan(-player.pitch))) : 12;
      placeX = player.pos.x - Math.sin(player.yaw) * dist;
      placeZ = player.pos.z - Math.cos(player.yaw) * dist;
      placeOk = canPlace(sim, level, placing, placeX, placeZ);
    }
    world.setGhost(placing, placeX, placeZ, placeOk);
    ui.setPlacing(!!placing, placeOk);

    fixId = placing ? null : world.fixTarget(sim, player.pos.x, player.pos.z, player.yaw);
    ui.setFix(fixId !== null);

    if (sim.storm?.phase === 'active' && !sim.playerSheltered && Math.random() < dt * 20) sfx.geiger();

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
