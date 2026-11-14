import * as THREE from 'three';
import { createTerrain, heightAt } from './render/terrain';
import { createStars, createEarth } from './render/sky';
import { createInput } from './game/input';
import { Player, type Blocker } from './game/player';
import { createSim, step } from './sim/sim';
import { moon } from './data/moon';
import { createHud } from './ui/hud';
import { t } from './i18n/en';

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
sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0x223355, 0x111111, 0.35));

scene.add(createTerrain(), createStars(), createEarth());

// First placeholder module: habitat on the flat build site.
const blockers: Blocker[] = [];
{
  const y = heightAt(0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.6, metalness: 0.2 });
  const hab = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 24), mat);
  hab.position.set(0, y + 1.5, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.set(0, y + 3, 0);
  for (const m of [hab, dome]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  blockers.push({ x: 0, z: 0, r: 4 });
}

const input = createInput(canvas);
const player = new Player(camera, blockers);

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
(document.getElementById('jump') as HTMLElement).textContent = t('jump');
hintEl.textContent = t('hintDesktop');
canvas.addEventListener('touchstart', () => { hintEl.textContent = t('hintTouch'); }, { once: true });
setTimeout(() => { hintEl.style.display = 'none'; }, 9000);

// Simulation runs on its own fixed tick, independent of frame rate.
const level = moon;
const sim = createSim(level);
const hud = createHud(level);
hud.update(sim);
const TICK = 1 / level.tickHz;
let simAcc = 0;

// FPS meter: average + worst frame over each half second, for the phone gate.
let last = performance.now(), acc = 0, frames = 0, worst = 0;
renderer.setAnimationLoop((now) => {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);

  player.update(dt, input.state);
  input.consume();

  simAcc += dt;
  if (simAcc >= TICK) {
    while (simAcc >= TICK) { step(sim, level, TICK); simAcc -= TICK; }
    hud.update(sim);
  }

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
