import * as THREE from 'three';
import type { Plant } from '../sim/sim.ts';
import { REPAIR_STEPS, SOLAR_STEPS, WATER_STEPS, greenhouseSteps, TOOLS, type Step, type Tool, type WorkKind } from '../data/workTasks';
import type { TextKey } from '../i18n/en';
import { createTag } from '../render/building';

// Work mode: a close-up "workbench" of the machine in front of the camera. Each task is a list of steps
// (data/workTasks.ts). You pick a tool, then click or tap the parts to do each step with your own hands.

export interface WorkEnv {
  plants: Plant[];
  lampOn: () => boolean;
  setLamp: (on: boolean) => void;
  harvest: (i: number) => void;
  dust: () => number;
}
export interface WorkFx { click(): void; ok(): void; wrong(): void; done(): void }
export interface WorkView {
  kind: WorkKind; stepNo: number; stepTotal: number; hintKey: TextKey; n: number; m: number; pct: number;
  tool: Tool | null; needTool: Tool | null; gauge: number | null; meter: number | null; progress: number; note: TextKey | null; reading: string;
}
type Result = 'ok' | 'info' | 'wrong';
export const GAUGE_ZONE: [number, number] = [0.52, 0.8];

const mat = (color: number, emissive = 0x000000, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.6, metalness: 0.25, flatShading: true, ...opts });
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r: number, h: number, m: THREE.Material, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);

abstract class Rig {
  group = new THREE.Group();
  hots: THREE.Mesh[] = [];
  width = 2.8;
  height = 2.0;
  gauge: number | null = null;
  meter: number | null = null;
  pct = 0;
  reading = '';
  note: TextKey | null = null;
  protected tweens: ((dt: number) => boolean)[] = [];

  abstract act(step: Step, id: string, count: number): Result;
  need(step: Step): number { return step.n ?? 1; }
  drag(_id: string, _uv: THREE.Vector2): void { /* only the solar rig wipes */ }
  stepDone(_step: Step): boolean { return false; }
  protected tick(_dt: number, _pressedOn: string | null, _tool: Tool | null, _kind: string): void { /* rigs override */ }

  update(dt: number, pressedOn: string | null, tool: Tool | null, kind: string): void {
    this.tweens = this.tweens.filter((f) => f(dt));
    this.tick(dt, pressedOn, tool, kind);
  }

  protected hot<T extends THREE.Mesh>(m: T, id: string): T { m.userData.hot = id; this.hots.push(m); return m; }

  setHover(id: string | null): void {
    for (const h of this.hots) {
      const m = h.material as THREE.MeshStandardMaterial;
      if (m.emissive) m.emissiveIntensity = h.userData.hot === id ? 1 : 0;
    }
  }

  // Smoothly move an object to a position over a short time.
  protected slide(o: THREE.Object3D, to: THREE.Vector3, dur = 0.35, hideAtEnd = false): void {
    const from = o.position.clone();
    let t = 0;
    this.tweens.push((dt) => {
      t += dt / dur;
      o.position.lerpVectors(from, to, Math.min(1, t));
      if (t >= 1) { if (hideAtEnd) o.visible = false; return false; }
      return true;
    });
  }

  protected spin(o: THREE.Object3D, turns = 1, dur = 0.3): void {
    const from = o.rotation.z;
    let t = 0;
    this.tweens.push((dt) => { t += dt / dur; o.rotation.z = from + Math.min(1, t) * turns * Math.PI * 2; return t < 1; });
  }

  protected shake(o: THREE.Object3D): void {
    const x0 = o.position.x;
    let t = 0;
    this.tweens.push((dt) => { t += dt; o.position.x = x0 + Math.sin(t * 60) * 0.03 * (1 - Math.min(1, t / 0.3)); if (t >= 0.3) { o.position.x = x0; return false; } return true; });
  }
}

const SLOT_X = [-0.93, -0.31, 0.31, 0.93];
const CABLE_COLORS = [0xe74c3c, 0x2ecc71, 0x3498db];
const PLUG_ORDER = [2, 0, 1]; // the plug row is shuffled so each plug must be matched to its port

// ---- Power panel: open it, find the burnt module with the meter, swap it, reconnect, close, flip the breaker ----
class PowerRig extends Rig {
  faults: Set<number>;
  private screws: THREE.Mesh[] = [];
  private cover = new THREE.Group();
  private mods: THREE.Mesh[] = [];
  private tags: ReturnType<typeof createTag>[] = [];
  private spares: THREE.Mesh[] = [];
  private lights: THREE.Mesh[] = [];
  private lever!: THREE.Mesh;
  private plugs: THREE.Mesh[] = [];
  private cables: THREE.Mesh[] = [];
  private out = new Set<number>();
  private probed = new Set<number>();
  private removed = new Set<number>();
  private inserted = new Set<number>();
  private connected = new Set<number>();
  private fastened = new Set<number>();
  private selected: number | null = null;
  private coverOff = false;
  private coverBack = false;
  private stuck = Math.floor(Math.random() * 4);
  private stuckLeft = 2;
  width = 3.0;
  height = 3.4;

  constructor() {
    super();
    const g = this.group;
    const faultCount = Math.random() < 0.35 ? 2 : 1;
    this.faults = new Set<number>();
    while (this.faults.size < faultCount) this.faults.add(Math.floor(Math.random() * 4));

    g.add(box(2.7, 1.9, 0.2, mat(0x2b3140)));
    // sockets and modules
    SLOT_X.forEach((x, i) => {
      const slot = this.hot(box(0.56, 0.9, 0.08, mat(0x111620)), `slot${i}`);
      slot.position.set(x, 0.1, 0.12); g.add(slot);
      const burnt = this.faults.has(i);
      const mod = this.hot(box(0.5, 0.8, 0.25, mat(burnt ? 0x1c1a18 : 0x3b6fd0, 0x000000)), `mod${i}`);
      mod.position.set(x, 0.1, 0.25); g.add(mod); this.mods.push(mod);
      const tag = createTag(); tag.sprite.position.set(x, 0.85, 0.6); tag.sprite.scale.set(1.0, 0.19, 1); tag.sprite.visible = false;
      g.add(tag.sprite); this.tags.push(tag);
    });
    // cable ports on top, plugs hanging at the bottom
    CABLE_COLORS.forEach((c, k) => {
      const port = this.hot(box(0.26, 0.16, 0.1, mat(c)), `port${k}`); port.position.set(-0.7 + k * 0.7, 0.78, 0.2); g.add(port);
      const plug = this.hot(box(0.22, 0.3, 0.14, mat(CABLE_COLORS[PLUG_ORDER[k]])), `plug${k}`);
      plug.position.set(-0.7 + k * 0.7, -0.68, 0.3); g.add(plug); this.plugs.push(plug);
    });
    // spare tray
    const tray = this.hot(box(1.5, 0.5, 0.3, mat(0x4a4f5c)), 'tray'); tray.position.set(0, -1.4, 0.2); g.add(tray);
    for (let i = 0; i < 2; i++) { const s = box(0.4, 0.34, 0.22, mat(0x35c27a)); s.position.set(-0.3 + i * 0.6, -1.4, 0.4); g.add(s); this.spares.push(s); }
    // breaker and status lights
    this.lever = this.hot(box(0.16, 0.5, 0.12, mat(0xf2b632)), 'breaker'); this.lever.position.set(1.5, -0.2, 0.2); this.lever.rotation.z = 0.5; g.add(this.lever);
    for (let i = 0; i < 3; i++) { const l = box(0.14, 0.14, 0.06, mat(0x552222, 0x551111)); l.position.set(-1.1 + i * 0.22, 0.85, 0.22); g.add(l); this.lights.push(l); }
    // cover plate with four screws
    const plate = this.hot(box(2.5, 1.7, 0.07, mat(0x8a93a5)), 'cover'); this.cover.add(plate);
    [[-1.1, 0.7], [1.1, 0.7], [-1.1, -0.7], [1.1, -0.7]].forEach(([x, y], i) => {
      const s = this.hot(cyl(0.09, 0.08, mat(0xd0d4dc), 8), `screw${i}`); s.rotation.x = Math.PI / 2; s.position.set(x, y, 0.06);
      this.cover.add(s); this.screws.push(s);
    });
    this.cover.position.z = 0.5; g.add(this.cover);
  }

  need(step: Step): number { return step.kind === 'inspect' || step.target === 'burnt' || step.kind === 'insertPart' ? this.faults.size : (step.n ?? 1); }

  act(step: Step, id: string): Result {
    const idx = Number(id.replace(/\D/g, ''));
    switch (step.kind) {
      case 'unscrew': {
        if (!id.startsWith('screw') || this.out.has(idx) || this.coverOff) return 'wrong';
        if (idx === this.stuck && this.stuckLeft > 0) { this.stuckLeft--; this.shake(this.screws[idx]); this.note = 'ws_stuck'; return 'info'; }
        this.out.add(idx); this.spin(this.screws[idx], 2); this.slide(this.screws[idx], this.screws[idx].position.clone().add(new THREE.Vector3(0, 0, 0.25)), 0.35, true);
        return 'ok';
      }
      case 'removePart': {
        if (step.target === 'cover') {
          if (id !== 'cover' || this.out.size < 4 || this.coverOff) return 'wrong';
          this.coverOff = true; this.slide(this.cover, new THREE.Vector3(1.9, -1.35, 1.0), 0.5); this.cover.scale.setScalar(0.45);
          this.cover.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.hot === 'cover') o.userData.hot = 'coverOff'; });
          return 'ok';
        }
        if (!id.startsWith('mod') || !this.faults.has(idx) || this.removed.has(idx) || !this.probed.has(idx)) return 'wrong';
        this.removed.add(idx); this.slide(this.mods[idx], new THREE.Vector3(SLOT_X[idx], -0.9, 1.4), 0.4, true);
        return 'ok';
      }
      case 'inspect': {
        if (!id.startsWith('mod') || !this.coverOff || this.probed.has(idx)) return 'info';
        this.probed.add(idx);
        const bad = this.faults.has(idx);
        this.tags[idx].set(bad ? '0.0 V  BURNT' : '12.0 V  OK', bad ? '#ff7b6a' : '#7bff9a');
        this.tags[idx].sprite.visible = true;
        return bad ? 'ok' : 'info';
      }
      case 'insertPart': {
        if (!id.startsWith('slot') || !this.removed.has(idx) || this.inserted.has(idx)) return 'wrong';
        this.inserted.add(idx);
        const m = box(0.5, 0.8, 0.25, mat(0x35c27a)); m.position.set(SLOT_X[idx], 0.1, 1.2); this.group.add(m); this.slide(m, new THREE.Vector3(SLOT_X[idx], 0.1, 0.25), 0.35);
        if (this.spares.length) this.spares.pop()!.visible = false;
        this.tags[idx].sprite.visible = false;
        return 'ok';
      }
      case 'connectCable': {
        if (id.startsWith('plug')) { if (this.connected.has(idx)) return 'info'; this.selected = idx; return 'info'; }
        return 'wrong';
      }
      case 'close': {
        if (id !== 'cover' && id !== 'coverOff') return 'wrong';
        if (!this.coverOff) return 'wrong';
        this.coverOff = false; this.coverBack = true; this.cover.scale.setScalar(1); this.slide(this.cover, new THREE.Vector3(0, 0, 0.5), 0.45);
        this.screws.forEach((s) => { s.visible = true; s.position.z = 0.3; });
        return 'ok';
      }
      case 'fasten': {
        if (!id.startsWith('screw') || !this.coverBack || this.fastened.has(idx)) return 'wrong';
        this.fastened.add(idx); this.spin(this.screws[idx], 2); this.slide(this.screws[idx], new THREE.Vector3(this.screws[idx].position.x, this.screws[idx].position.y, 0.06), 0.3);
        return 'ok';
      }
      case 'flip': {
        if (id !== 'breaker' || this.fastened.size < 4) return 'wrong';
        this.lever.rotation.z = -0.5;
        this.lights.forEach((l) => { l.material = mat(0x2ecc71, 0x22aa55); });
        return 'ok';
      }
      default: return 'wrong';
    }
  }

  // Port clicks come through here because the cable step needs the plug that was selected first.
  portClick(k: number): Result {
    if (this.selected === null) return 'wrong';
    const plugColor = CABLE_COLORS[PLUG_ORDER[this.selected]];
    if (plugColor !== CABLE_COLORS[k]) { this.selected = null; return 'wrong'; }
    const sel = this.selected; this.selected = null; this.connected.add(sel);
    const p = this.plugs[sel]; const to = new THREE.Vector3(-0.7 + k * 0.7, 0.62, 0.3);
    this.slide(p, to, 0.4);
    const len = Math.abs(p.position.y - to.y);
    const cable = cyl(0.04, len, mat(plugColor), 6); cable.position.set(p.position.x, (p.position.y + to.y) / 2, 0.3); this.group.add(cable); this.cables.push(cable);
    return 'ok';
  }
  get cableSelected(): number | null { return this.selected; }
  get hasPorts(): boolean { return true; }
}

// ---- Solar array: brush the dust off with a dirt mask and watch the output rise ----
class SolarRig extends Rig {
  private canvases: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; cells: boolean[] }[] = [];
  private readonly W = 240; private readonly H = 160; private readonly CX = 16; private readonly CY = 10;
  private startPct: number;
  private tested = false;
  private inv!: ReturnType<typeof createTag>;
  width = 5.4;
  height = 2.6;

  constructor(dust: number) {
    super();
    this.startPct = 0.45 + 0.4 * (1 - Math.min(1, dust));
    for (let i = 0; i < 3; i++) {
      const x = -1.75 + i * 1.75;
      const base = box(1.6, 1.1, 0.1, mat(0x1c3a7a, 0x000000, { metalness: 0.6, roughness: 0.3 })); base.position.set(x, 0.3, 0); this.group.add(base);
      const frame = box(1.66, 1.16, 0.06, mat(0xb8bfcc)); frame.position.set(x, 0.3, -0.03); this.group.add(frame);
      const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = `rgba(176,140,98,${0.7 + 0.25 * dust})`; ctx.fillRect(0, 0, this.W, this.H);
      for (let n = 0; n < 160; n++) { ctx.fillStyle = `rgba(${120 + Math.random() * 60},${95 + Math.random() * 40},${60 + Math.random() * 30},0.35)`; ctx.beginPath(); ctx.arc(Math.random() * this.W, Math.random() * this.H, 4 + Math.random() * 14, 0, 7); ctx.fill(); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const over = this.hot(new THREE.Mesh(new THREE.PlaneGeometry(1.56, 1.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true })), `dust${i}`);
      over.position.set(x, 0.3, 0.08); this.group.add(over);
      this.canvases.push({ ctx, tex, cells: new Array(this.CX * this.CY).fill(false) });
    }
    const inv = this.hot(box(0.9, 0.5, 0.2, mat(0x4a4f5c)), 'inverter'); inv.position.set(0, -0.8, 0.1); this.group.add(inv);
    this.inv = createTag(); this.inv.sprite.position.set(0, -0.8, 0.4); this.inv.sprite.scale.set(1.3, 0.25, 1); this.group.add(this.inv.sprite);
    this.meter = this.startPct;
  }

  drag(id: string, uv: THREE.Vector2): void {
    const i = Number(id.replace('dust', ''));
    const pc = this.canvases[i];
    if (!pc) return;
    const px = uv.x * this.W, py = (1 - uv.y) * this.H;
    pc.ctx.globalCompositeOperation = 'destination-out';
    pc.ctx.beginPath(); pc.ctx.arc(px, py, 20, 0, 7); pc.ctx.fill();
    pc.ctx.globalCompositeOperation = 'source-over';
    pc.tex.needsUpdate = true;
    const cw = this.W / this.CX, ch = this.H / this.CY;
    for (let cy = 0; cy < this.CY; cy++) for (let cx = 0; cx < this.CX; cx++) {
      if (Math.hypot((cx + 0.5) * cw - px, (cy + 0.5) * ch - py) < 20) pc.cells[cy * this.CX + cx] = true;
    }
    this.pct = this.canvases.reduce((a, c) => a + c.cells.filter(Boolean).length, 0) / (3 * this.CX * this.CY);
    this.meter = this.startPct + (1 - this.startPct) * Math.min(1, this.pct / 0.95);
  }

  stepDone(step: Step): boolean { return step.kind === 'wipe' && this.pct >= 0.95; }

  act(step: Step, id: string): Result {
    if (step.kind === 'test' && id === 'inverter' && this.pct >= 0.95 && !this.tested) {
      this.tested = true; this.reading = 'OK';
      this.inv.set('Output: 100% OK', '#7bff9a');
      return 'ok';
    }
    return 'wrong';
  }
}

// ---- Water recovery: swap the dirty filter cartridge, prime the pump, check the quality ----
class WaterRig extends Rig {
  private cart!: THREE.Mesh;
  private fresh!: THREE.Mesh;
  private trayCart!: THREE.Mesh;
  private lever!: THREE.Mesh;
  private pump!: THREE.Mesh;
  private quality!: ReturnType<typeof createTag>;
  private unlocked = false; private removedC = false; private inserted = false; private locked = false; private tested = false;
  private hold = 0; private level = 0.15;
  width = 3.0;
  height = 3.2;

  constructor() {
    super();
    const g = this.group;
    g.add(box(2.5, 1.9, 0.3, mat(0x5a6272)));
    const bay = box(0.8, 1.35, 0.1, mat(0x1b2029)); bay.position.set(-0.45, 0.1, 0.17); g.add(bay);
    this.cart = this.hot(cyl(0.3, 1.2, mat(0x6b4a2a), 14), 'cart'); this.cart.position.set(-0.45, 0.1, 0.34); g.add(this.cart);
    this.fresh = cyl(0.3, 1.2, mat(0x7fd3ff), 14); this.fresh.position.set(-0.45, 0.1, 0.34); this.fresh.visible = false; g.add(this.fresh);
    this.lever = this.hot(box(0.2, 0.9, 0.14, mat(0xf2b632)), 'lever'); this.lever.position.set(0.55, 0.3, 0.25); g.add(this.lever);
    this.pump = this.hot(cyl(0.22, 0.14, mat(0xd63a3a), 14), 'pump'); this.pump.rotation.x = Math.PI / 2; this.pump.position.set(0.55, -0.6, 0.25); g.add(this.pump);
    const q = this.hot(box(0.95, 0.4, 0.08, mat(0x10261a, 0x0a2a14)), 'quality'); q.position.set(0.55, 0.9, 0.2); g.add(q);
    this.quality = createTag(); this.quality.sprite.position.set(0.55, 0.9, 0.4); this.quality.sprite.scale.set(1.2, 0.23, 1); this.quality.set('Quality: ?', '#cfd8e8'); g.add(this.quality.sprite);
    const tray = box(1.4, 0.2, 0.5, mat(0x4a4f5c)); tray.position.set(-0.3, -1.3, 0.4); g.add(tray);
    this.trayCart = this.hot(cyl(0.26, 0.9, mat(0xe8f6ff), 14), 'tray'); this.trayCart.rotation.z = Math.PI / 2; this.trayCart.position.set(-0.3, -1.1, 0.5); g.add(this.trayCart);
    this.gauge = null;
  }

  act(step: Step, id: string): Result {
    switch (step.kind) {
      case 'unlock':
        if (id !== 'lever' || this.unlocked) return 'wrong';
        this.unlocked = true; this.lever.rotation.z = 0.9; return 'ok';
      case 'removePart':
        if (id !== 'cart' || !this.unlocked || this.removedC) return 'wrong';
        this.removedC = true; this.slide(this.cart, new THREE.Vector3(-0.45, -0.5, 1.6), 0.5, true); return 'ok';
      case 'insertPart':
        if (id !== 'tray' || !this.removedC || this.inserted) return 'wrong';
        this.inserted = true; this.trayCart.visible = false; this.fresh.visible = true; this.fresh.position.z = 1.4; this.slide(this.fresh, new THREE.Vector3(-0.45, 0.1, 0.34), 0.45); return 'ok';
      case 'lock':
        if (id !== 'lever' || !this.inserted || this.locked) return 'wrong';
        this.locked = true; this.lever.rotation.z = 0; return 'ok';
      case 'test':
        if (id !== 'quality' || this.hold < 1 || this.tested) return 'wrong';
        this.tested = true; this.reading = 'OK'; this.quality.set('Quality: CLEAN', '#7bff9a'); return 'ok';
      default: return 'wrong';
    }
  }

  stepDone(step: Step): boolean { return step.kind === 'hold' && this.hold >= 1; }

  protected tick(dt: number, pressedOn: string | null, _tool: Tool | null, kind: string): void {
    if (kind !== 'hold') { this.gauge = null; return; }
    this.gauge = this.level;
    this.level = Math.max(0, Math.min(1, this.level + (pressedOn === 'pump' ? 0.5 : -0.4) * dt));
    this.pump.position.z = pressedOn === 'pump' ? 0.2 : 0.25;
    if (this.level >= GAUGE_ZONE[0] && this.level <= GAUGE_ZONE[1]) this.hold = Math.min(1, this.hold + dt / 3.5);
    else this.hold = Math.max(0, this.hold - dt * 0.05);
    this.pct = this.hold;
  }
}

// ---- Greenhouse: plant, water, harvest and fix the lamp. Plants keep growing in the real greenhouse afterwards ----
class GreenRig extends Rig {
  private pots: THREE.Group[] = [];
  private plantMeshes: THREE.Group[] = [];
  private lastStage: number[] = [];
  private lamp!: THREE.Mesh;
  private soil: THREE.Mesh[] = [];
  width = 3.4;
  height = 2.6;

  constructor(private env: WorkEnv) {
    super();
    const g = this.group;
    g.add(box(3.1, 2.0, 0.2, mat(0x3a4a42)));
    this.lamp = this.hot(box(2.8, 0.2, 0.3, mat(0xf2e08a, 0xcaa02a)), 'lamp'); this.lamp.position.set(0, 0.95, 0.3); g.add(this.lamp);
    for (let i = 0; i < 3; i++) {
      const x = -1 + i;
      const pot = this.hot(cyl(0.38, 0.5, mat(0x9c6b3e), 12), `pot${i}`); pot.position.set(x, -0.55, 0.4); g.add(pot);
      const soil = cyl(0.33, 0.06, mat(0x3a2a1a), 12); soil.position.set(x, -0.3, 0.4); g.add(soil); this.soil.push(soil);
      const hit = this.hot(box(0.9, 1.4, 0.4, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })), `pot${i}`); hit.position.set(x, 0.1, 0.4); g.add(hit);
      const holder = new THREE.Group(); holder.position.set(x, -0.27, 0.4); g.add(holder); this.plantMeshes.push(holder); this.lastStage.push(-1);
      this.pots.push(holder);
    }
  }

  private build(p: Plant): THREE.Group {
    const g = new THREE.Group();
    const leaf = mat(p.kind === 'tomato' ? 0x2f9e44 : 0x5fd35f);
    if (p.stage === 1) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0x6b4a2a)); s.position.y = 0.03; g.add(s); }
    if (p.stage >= 2) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), leaf); c.position.y = 0.17; g.add(c); }
    if (p.stage >= 3) for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 6), leaf); c.position.set(Math.sin(i * 1.57) * 0.15, 0.3, Math.cos(i * 1.57) * 0.15); c.rotation.set(Math.cos(i * 1.57) * 0.5, 0, -Math.sin(i * 1.57) * 0.5); g.add(c); }
    if (p.stage === 4) for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(p.kind === 'tomato' ? 0xe03a3a : 0x9be36a)); f.position.set(Math.sin(i * 2.1) * 0.2, 0.28 + i * 0.05, Math.cos(i * 2.1) * 0.2); g.add(f); }
    return g;
  }

  act(step: Step, id: string): Result {
    const i = Number(id.replace(/\D/g, ''));
    const p = this.env.plants[i];
    switch (step.kind) {
      case 'plant':
        if (!id.startsWith('pot') || !p || p.stage !== 0) return 'wrong';
        p.stage = 1; p.growth = 0; p.water = 0.5; return 'ok';
      case 'harvest':
        if (!id.startsWith('pot') || !p || p.stage !== 4) return 'wrong';
        this.env.harvest(i); return 'ok';
      case 'lamp':
        if (id !== 'lamp') return 'wrong';
        this.env.setLamp(true); return 'ok';
      case 'test': return id === 'lamp' ? 'ok' : 'wrong';
      default: return 'wrong';
    }
  }

  stepDone(step: Step): boolean {
    if (step.kind !== 'water') return false;
    const i = Number((step.target ?? 'pot0').replace('pot', ''));
    return this.env.plants[i].water >= 0.85;
  }

  protected tick(dt: number, pressedOn: string | null, tool: Tool | null, _kind: string): void {
    if (pressedOn && pressedOn.startsWith('pot') && tool === 'can') {
      const p = this.env.plants[Number(pressedOn.replace('pot', ''))];
      if (p && p.stage > 0) p.water = Math.min(1, p.water + dt * 0.7);
    }
    (this.lamp.material as THREE.MeshStandardMaterial).emissive.setHex(this.env.lampOn() ? 0xcaa02a : 0x000000);
    this.env.plants.forEach((p, i) => {
      const key = p.stage;
      if (key !== this.lastStage[i]) {
        this.lastStage[i] = key;
        const holder = this.pots[i];
        holder.clear();
        if (p.stage > 0) holder.add(this.build(p));
      }
      (this.soil[i].material as THREE.MeshStandardMaterial).color.setHex(p.stage > 0 && p.water > 0.35 ? 0x2a1e12 : 0x6a5a40);
    });
  }
}

// ---- The session: steps, tools, pointer input ----
export class WorkSession {
  readonly steps: Step[];
  idx = 0;
  count = 0;
  tool: Tool | null = null;
  done = false;
  private rig: Rig;
  private ray = new THREE.Raycaster();
  private pressedOn: string | null = null;
  private hover: string | null = null;
  private pressed = false;
  private light = new THREE.PointLight(0xffffff, 14, 9, 1.4);
  private flashKey: TextKey | null = null;
  private flashT = 0;

  constructor(readonly kind: WorkKind, env: WorkEnv, private fx: WorkFx) {
    if (kind === 'repair') { this.rig = new PowerRig(); this.steps = REPAIR_STEPS.map((s) => ({ ...s })); }
    else if (kind === 'solar') { this.rig = new SolarRig(env.dust()); this.steps = SOLAR_STEPS.map((s) => ({ ...s })); }
    else if (kind === 'water') { this.rig = new WaterRig(); this.steps = WATER_STEPS.map((s) => ({ ...s })); }
    else { this.rig = new GreenRig(env); this.steps = greenhouseSteps(env.plants, env.lampOn()); }
    this.rig.group.add(this.light);
    this.light.position.set(0, 0.6, 3);
  }

  get group(): THREE.Group { return this.rig.group; }
  get width(): number { return this.rig.width; }
  get height(): number { return this.rig.height; }
  private get step(): Step { return this.steps[this.idx]; }
  private need(): number { return this.rig.need(this.step); }

  setTool(t: Tool): void {
    this.tool = t;
    this.fx.click();
    if (!this.done && this.step.kind === 'pickTool' && this.step.tool === t) this.advance();
  }
  selectIndex(i: number): void { if (TOOLS[i]) this.setTool(TOOLS[i].id); }

  private advance(): void {
    this.idx++; this.count = 0;
    if (this.idx >= this.steps.length) { this.done = true; this.fx.done(); } else this.fx.ok();
  }

  private flash(key: TextKey): void { this.flashKey = key; this.flashT = 1.6; }

  private pick(ndc: THREE.Vector2, camera: THREE.Camera): { id: string; uv: THREE.Vector2 | null } | null {
    this.ray.setFromCamera(ndc, camera);
    const hits = this.ray.intersectObjects(this.rig.hots.filter((h) => h.visible), false);
    if (!hits.length) return null;
    return { id: hits[0].object.userData.hot as string, uv: hits[0].uv ?? null };
  }

  pointerMove(ndc: THREE.Vector2, camera: THREE.Camera): void {
    const hit = this.pick(ndc, camera);
    this.hover = hit?.id ?? null;
    this.rig.setHover(this.hover);
    if (this.pressed && hit?.uv && this.kind === 'solar' && this.step?.kind === 'wipe' && this.tool === 'brush') this.rig.drag(hit.id, hit.uv);
    if (this.pressed) this.pressedOn = hit?.id ?? null;
  }

  pointerDown(ndc: THREE.Vector2, camera: THREE.Camera): void {
    if (this.done) return;
    this.pressed = true;
    const hit = this.pick(ndc, camera);
    this.pressedOn = hit?.id ?? null;
    if (!hit) return;
    const step = this.step;
    if (step.kind === 'pickTool' || step.kind === 'hold' || step.kind === 'wipe' || step.kind === 'water') {
      if (step.kind === 'wipe' && hit.uv && this.tool === 'brush') this.rig.drag(hit.id, hit.uv);
      else if (step.kind === 'wipe' && this.tool !== 'brush') this.flash('ws_toolWrong');
      else if (step.kind === 'water' && this.tool !== 'can') this.flash('ws_toolWrong');
      else if (step.kind === 'hold') this.fx.click();
      return;
    }
    if (step.tool && this.tool !== step.tool) { this.flash('ws_toolWrong'); this.fx.wrong(); return; }
    // The cable step needs a plug first, then a port: ports are the top row of the power rig.
    let res: Result;
    if (step.kind === 'connectCable' && this.rig instanceof PowerRig && hit.id.startsWith('port')) res = this.rig.portClick(Number(hit.id.slice(4)));
    else res = this.rig.act(step, hit.id, this.count);
    if (res === 'ok') { this.count++; this.fx.click(); if (this.count >= this.need()) this.advance(); else this.fx.ok(); }
    else if (res === 'info') this.fx.click();
    else { this.flash('ws_wrong'); this.fx.wrong(); }
  }

  pointerUp(): void { this.pressed = false; this.pressedOn = null; }

  // Cable ports are small, so a click on the plug row also counts for plugs and a click near a port picks it.
  update(dt: number): void {
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.rig.note) { this.flashKey = this.rig.note; this.flashT = 1.6; this.rig.note = null; }
    if (this.done) { this.rig.update(dt, null, this.tool, 'done'); return; }
    this.rig.update(dt, this.pressed ? this.pressedOn : null, this.tool, this.step.kind);
    if (this.rig.stepDone(this.step)) this.advance();
  }

  view(): WorkView {
    const s = this.steps[Math.min(this.idx, this.steps.length - 1)];
    const m = this.rig.need(s);
    return {
      kind: this.kind, stepNo: Math.min(this.idx + 1, this.steps.length), stepTotal: this.steps.length, hintKey: s.hint,
      n: this.count, m, pct: Math.round(this.rig.pct * 100), tool: this.tool,
      needTool: s.tool ?? null, gauge: this.rig.gauge, meter: this.rig.meter,
      progress: (this.idx + (m > 0 ? this.count / m : 0)) / this.steps.length,
      note: this.flashT > 0 ? this.flashKey : null, reading: this.rig.reading,
    };
  }

  // Positions the rig in front of the player's eye, facing them, and returns where the camera should be.
  frame(eye: THREE.Vector3, yaw: number, fovDeg: number, aspect: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const center = eye.clone().addScaledVector(fwd, 2.4);
    this.rig.group.position.copy(center);
    this.rig.group.rotation.y = yaw;
    const t = Math.tan((fovDeg * Math.PI) / 360);
    const dist = Math.max(1.3, (this.rig.width / 2) * 1.1 / (t * aspect), (this.rig.height / 2) * 1.1 / t);
    return { pos: center.clone().addScaledVector(fwd, -dist), look: center };
  }

  // Colour hint for the port row of the power rig: lets the UI know ports exist as clickable parts.
  get isPower(): boolean { return this.rig instanceof PowerRig; }
}
