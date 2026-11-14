import * as THREE from 'three';
import { heightAt } from '../render/terrain';
import { createAstronaut, type Astronaut } from '../render/models';
import type { TextKey } from '../i18n/en';

// Opening cinematic, all in engine: the lander comes down, kicks up dust, touches down, the crew climb out,
// walk to the station and go in. Skippable. About 36 seconds.
export const LANDER_AT = { x: 16, z: 28 };
const DOOR = { x: 0, z: 6.9 };
const SUITS = [0xff8a3d, 0x4fc3e8, 0xc77dff];
const ease = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

export interface IntroDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  habLights: THREE.PointLight[];
  say(key: TextKey): void;
  showTitle(on: boolean): void;
  setFade(opacity: number): void;
  fx: { engine(): void; thud(): void; hiss(): void; click(): void };
}

const std = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35, flatShading: true, ...o });

export function createLander(): { group: THREE.Group; hatch: THREE.Group; ladder: THREE.Group; flame: THREE.Mesh; light: THREE.PointLight } {
  const g = new THREE.Group();
  const add = (m: THREE.Mesh, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.9, 10), std(0xe9e6df)), 0, 2.4, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 0.9, 10), std(0xd8b14a, { metalness: 0.7 })), 0, 3.8, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 6), std(0x555b66)), 0, 4.6, 0);
  const nozzle = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 10), std(0x3a3f4a)), 0, 1.0, 0);
  nozzle.rotation.x = Math.PI;
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.0, 0.13), std(0xb9bfca)), Math.cos(a) * 1.45, 1.1, Math.sin(a) * 1.45);
    leg.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), -0.55);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8), std(0xb9bfca)), Math.cos(a) * 2.05, 0.04, Math.sin(a) * 2.05);
  }
  // hatch on the +x side, hinged at its back edge, and a ladder that is shown once it is open
  const hatch = new THREE.Group();
  hatch.position.set(1.56, 2.4, -0.45);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.9), std(0x8d94a3)); panel.position.set(0, 0, 0.45); hatch.add(panel);
  g.add(hatch);
  const ladder = new THREE.Group();
  for (const z of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 0.05), std(0xcfd3dc)); r.position.set(2.0, 1.15, z); r.rotation.z = 0.2; ladder.add(r); }
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), std(0xcfd3dc)); r.position.set(1.65 + i * 0.1, 2.1 - i * 0.38, 0); ladder.add(r); }
  ladder.visible = false;
  g.add(ladder);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.8, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = Math.PI; flame.position.set(0, -0.6, 0);
  g.add(flame);
  const light = new THREE.PointLight(0xffa850, 40, 30, 1.6); light.position.set(0, 0.2, 0); g.add(light);
  return { group: g, hatch, ladder, flame, light };
}

export class Intro {
  t = 0;
  done = false;
  private L = createLander();
  private gy = heightAt(LANDER_AT.x, LANDER_AT.z);
  private crew: { a: Astronaut; start: number; pos: THREE.Vector3; walking: boolean; gone: boolean; lastStep: number; sideL: boolean }[] = [];
  private dust: THREE.Points;
  private dustPos = new Float32Array(260 * 3);
  private dustVel = new Float32Array(260 * 3);
  private dustLife = new Float32Array(260);
  private prints: THREE.Mesh[] = [];
  private printGeo = new THREE.CircleGeometry(0.5, 8);
  private printMat = new THREE.MeshBasicMaterial({ color: 0x4a4740, transparent: true, opacity: 0.55, depthWrite: false });
  private said = new Set<number>();
  private lightsOn = false;
  private thudded = false; private engineOn = false; private hatchSound = false;
  private origLights: number[];

  constructor(private d: IntroDeps) {
    this.L.group.position.set(LANDER_AT.x, this.gy + 140, LANDER_AT.z);
    d.scene.add(this.L.group);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    const puff = document.createElement('canvas'); puff.width = puff.height = 32;
    const pg = puff.getContext('2d')!; const grad = pg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); pg.fillStyle = grad; pg.fillRect(0, 0, 32, 32);
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfc8bb, map: new THREE.CanvasTexture(puff), size: 2.6, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dust.frustumCulled = false;
    d.scene.add(this.dust);
    for (let i = 0; i < 260; i++) { this.dustPos[i * 3 + 1] = -50; this.dustLife[i] = 0; }
    SUITS.forEach((c, i) => {
      const a = createAstronaut(c);
      a.group.visible = false;
      d.scene.add(a.group);
      this.crew.push({ a, start: 17 + i * 1.1, pos: new THREE.Vector3(), walking: false, gone: false, lastStep: 0, sideL: false });
    });
    this.origLights = d.habLights.map((l) => l.intensity);
    d.habLights.forEach((l) => { l.intensity = 0; });
    d.setFade(1);
  }

  private altitude(): number {
    const t = this.t;
    if (t < 4) return 140;
    if (t >= 12) return 0;
    const u = (t - 4) / 8;
    return 140 * (1 - u) * (1 - u);
  }

  private line(at: number, key: TextKey): void { if (this.t >= at && !this.said.has(at)) { this.said.add(at); this.d.say(key); } }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const alt = this.altitude();
    const L = this.L;
    const gy = this.gy;
    L.group.position.y = gy + alt;
    // The engine burns from 4 s to touchdown; the hatch opens afterwards
    const burning = t >= 4 && t < 12.2;
    L.flame.visible = burning; L.light.visible = burning;
    if (burning) {
      const k = 0.8 + Math.random() * 0.5;
      L.flame.scale.set(k, 0.8 + Math.random() * 0.5, k);
      L.light.intensity = 25 + Math.random() * 20;
    }
    if (burning && !this.engineOn) { this.engineOn = true; this.d.fx.engine(); }
    if (t >= 12 && !this.thudded) { this.thudded = true; this.d.fx.thud(); }
    const hatchOpen = clamp01((t - 15.2) / 1.0);
    L.hatch.rotation.z = -hatchOpen * 1.7;
    L.ladder.visible = t > 15.8;
    if (t > 15.2 && !this.hatchSound) { this.hatchSound = true; this.d.fx.click(); }

    this.updateDust(dt, alt, burning);
    this.updateCrew(dt);
    this.updateCamera();

    // Subtitles
    this.line(0.4, 'intro_1'); this.line(5, 'intro_2'); this.line(12.4, 'intro_3');
    this.line(16.6, 'intro_4'); this.line(23, 'intro_5'); this.line(31.2, 'intro_6');

    // Station lights come on as the crew arrive
    if (t > 31 && !this.lightsOn) { this.lightsOn = true; this.d.fx.hiss(); }
    if (this.lightsOn) { const k = clamp01((t - 31) / 1.2); this.d.habLights.forEach((l, i) => { l.intensity = this.origLights[i] * k; }); }
    this.d.showTitle(t > 33.2);
    this.d.setFade(t < 1 ? 1 - t : t > 35.2 ? clamp01((t - 35.2) / 0.8) : 0);
    if (t >= 36) this.finish();
  }

  private updateDust(dt: number, alt: number, burning: boolean): void {
    const gy = this.gy;
    if (burning && alt < 24) {
      const power = 1 - alt / 24;
      for (let n = 0, i = 0; n < 7 && i < 260; i++) {
        if (this.dustLife[i] > 0) continue;
        n++;
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 9 * power + 1;
        this.dustPos.set([LANDER_AT.x + Math.cos(a) * 0.8, gy + 0.2, LANDER_AT.z + Math.sin(a) * 0.8], i * 3);
        this.dustVel.set([Math.cos(a) * sp, 0.4 + Math.random() * 1.6, Math.sin(a) * sp], i * 3);
        this.dustLife[i] = 2.2 + Math.random() * 1.5;
      }
    }
    for (let i = 0; i < 260; i++) {
      if (this.dustLife[i] <= 0) { this.dustPos[i * 3 + 1] = -50; continue; }
      this.dustLife[i] -= dt;
      this.dustVel[i * 3] *= 0.985; this.dustVel[i * 3 + 2] *= 0.985; this.dustVel[i * 3 + 1] -= 1.2 * dt;
      for (let k = 0; k < 3; k++) this.dustPos[i * 3 + k] += this.dustVel[i * 3 + k] * dt;
      if (this.dustPos[i * 3 + 1] < gy + 0.1) { this.dustPos[i * 3 + 1] = gy + 0.1; this.dustVel[i * 3 + 1] = 0; }
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateCrew(dt: number): void {
    const gy = this.gy;
    const base = new THREE.Vector3(LANDER_AT.x + 2.5, gy, LANDER_AT.z);
    this.crew.forEach((c, i) => {
      const lt = this.t - c.start;
      const g = c.a.group;
      if (lt < 0 || c.gone) { g.visible = false; return; }
      g.visible = true;
      if (lt < 1.5) {
        // climbing down the ladder, facing it
        const u = ease(lt / 1.5);
        c.pos.set(LANDER_AT.x + 1.9 + u * 0.6, gy + 2.2 * (1 - u), LANDER_AT.z - 0.25 + i * 0.25);
        g.position.copy(c.pos); g.rotation.y = Math.PI / 2;
        const s = Math.sin(lt * 9) * 0.7;
        c.a.armL.rotation.x = -1.2 + s * 0.4; c.a.armR.rotation.x = -1.2 - s * 0.4; c.a.legL.rotation.x = s * 0.5; c.a.legR.rotation.x = -s * 0.5;
        return;
      }
      // walk to the station door
      if (!c.walking) { c.walking = true; c.pos.set(base.x, gy, base.z - 0.5 + i * 0.5); }
      const target = new THREE.Vector3(DOOR.x + (i - 1) * 0.5, 0, DOOR.z);
      const dir = new THREE.Vector3(target.x - c.pos.x, 0, target.z - c.pos.z);
      const dist = dir.length();
      if (dist < 0.6) { c.gone = true; g.visible = false; return; }
      dir.normalize();
      const step = 2.7 * dt;
      c.pos.x += dir.x * step; c.pos.z += dir.z * step;
      c.pos.y = heightAt(c.pos.x, c.pos.z);
      g.position.copy(c.pos); g.rotation.y = Math.atan2(dir.x, dir.z);
      const w = Math.sin(this.t * 8 + i) * 0.7;
      c.a.legL.rotation.x = w; c.a.legR.rotation.x = -w; c.a.armL.rotation.x = -w * 0.7; c.a.armR.rotation.x = w * 0.7;
      g.position.y += Math.abs(Math.sin(this.t * 8 + i)) * 0.07;
      // footprints, alternating left and right
      if (this.t - c.lastStep > 0.34 && this.prints.length < 160) {
        c.lastStep = this.t; c.sideL = !c.sideL;
        const p = new THREE.Mesh(this.printGeo, this.printMat);
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(c.sideL ? 0.18 : -0.18);
        p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(dir.x, dir.z);
        p.scale.set(0.16, 0.3, 1);
        p.position.set(c.pos.x + side.x, heightAt(c.pos.x, c.pos.z) + 0.04, c.pos.z + side.z);
        this.d.scene.add(p); this.prints.push(p);
      }
    });
  }

  private updateCamera(): void {
    const t = this.t;
    const cam = this.d.camera;
    const gy = this.gy;
    const lp = this.L.group.position;
    const lookTmp = new THREE.Vector3();
    if (t < 4) {
      cam.position.set(LANDER_AT.x + 16, gy + 142, LANDER_AT.z + 22);
      lookTmp.set(-300, 430, -620).lerp(new THREE.Vector3(lp.x, lp.y + 2, lp.z), ease(clamp01((t - 0.3) / 3.4)));
    } else if (t < 12) {
      const u = (t - 4) / 8;
      cam.position.set(lp.x + 11, lp.y + 3.5 - u * 1.8, lp.z + 14);
      lookTmp.set(lp.x, lp.y + 1.5, lp.z);
    } else if (t < 16.5) {
      cam.position.set(LANDER_AT.x + 8, gy + 1.6, LANDER_AT.z + 10);
      lookTmp.set(LANDER_AT.x, gy + 2.2, LANDER_AT.z);
    } else if (t < 22) {
      cam.position.set(LANDER_AT.x + 6.5, gy + 1.7, LANDER_AT.z + 5);
      lookTmp.set(LANDER_AT.x + 2.2, gy + 1.2, LANDER_AT.z);
    } else if (t < 31) {
      // follow the crew from behind and to the side
      const lead = this.crew[0].pos;
      cam.position.set(lead.x + 7, gy + 1.8, lead.z + 6);
      lookTmp.set(lead.x - 2, gy + 1.5, lead.z - 3);
    } else {
      cam.position.set(7, gy + 1.8, 15);
      lookTmp.set(0, gy + 2.2, 4.5);
    }
    cam.lookAt(lookTmp);
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    this.d.scene.remove(this.dust);
    this.L.flame.visible = false; this.L.light.visible = false;
    // The lander stays on the Moon as scenery; settle it on the ground
    this.L.group.position.y = this.gy;
    this.L.group.remove(this.L.flame, this.L.light);
    this.L.hatch.rotation.z = -1.7; this.L.ladder.visible = true;
    this.crew.forEach((c) => this.d.scene.remove(c.a.group));
    this.d.habLights.forEach((l, i) => { l.intensity = this.origLights[i]; });
    this.d.showTitle(false);
    this.d.setFade(0);
  }

  get lander(): THREE.Group { return this.L.group; }
}
