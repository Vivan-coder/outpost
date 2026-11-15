import * as THREE from 'three';
import { resolve, type Blocker, type Resolved } from '../game/collide';
import type { WorkSession } from '../game/work';

// WebXR mode. Loaded only when the player presses "Enter VR", so it never touches the desktop or phone game.
// Comfort first: teleport with an arc, snap turns, no camera movement forced on the player, and the HUD lives on
// world-space panels (a wrist panel, a floating menu, subtitles, the storm chart) because screen overlays do not show in VR.
//
// Rules this file follows (checked by `npm run vr:static`): no requestAnimationFrame (the game has one render loop),
// no window size reads, no DOM access except creating canvases for textures, no pointer lock, and no object
// allocation in the per-frame functions (they use the preallocated temporaries below).

export interface VrBar { label: string; pct: number; color: string; warn?: boolean }
export interface VrHud { bars: VrBar[]; timer: string; sol: string; dose: string; banner: string; prompt: string; hold: number; job: string }
export interface VrLabels { resume: string; crew: string; shelter: string; fastForward: string; data: string; log: string; exit: string; back: string; ok: string; rest: string; menu: string; hold: string; stepBack: string; diag: string; copy: string }
export interface VrCrewEntry { name: string; doing: string; options: { id: string; label: string }[] }
export interface VrChart { canvas: HTMLCanvasElement; title: string; badges: string; note: string }

export interface VrHost {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; rig: THREE.Group;
  heightAt(x: number, z: number): number;
  blockers(): Blocker[];
  setPlayer(x: number, z: number, yaw: number): void;
  press(on: boolean): void;
  interact(): boolean; // is there something to use right now (so a hand pinch means "use", not "teleport")
  hold(): number; // 0..1 progress of a hold-to-start task
  work(): WorkSession | null;
  hud(): VrHud;
  chart(): VrChart | null;
  labels: VrLabels;
  crew(): VrCrewEntry[];
  assign(i: number, id: string | null): void;
  callShelter(): void;
  toggleFF(): void;
  dataLines(): string[];
  logLines(): string[];
  setPaused(on: boolean): void;
  setAudio(on: boolean): void;
  setPerf(level: number): void; // 0 = full quality ... 3 = lightest (host lowers shadows)
  remember(level: number): void; // worst performance level of the session, so the next one starts lighter
  rtl(): boolean;
  scale: number; // framebuffer scale for this session
  debug: boolean; // ?vrdebug=1: show the in-headset diagnostics panel
  onStart(): void;
  onEnd(): void;
}

interface Btn { label: string; fn: () => void }
// Three's controller objects are event targets for the WebXR input events
type EvTarget = { addEventListener(t: string, f: (e: unknown) => void): void; removeEventListener(t: string, f: (e: unknown) => void): void };
type Rec = {
  c: THREE.Group; grip: THREE.Group; line: THREE.Line; index: number;
  hand: string; src: XRInputSource | null; connected: boolean; isHand: boolean;
  prev: boolean[]; selecting: boolean; pendingTp: boolean;
  onConnected: (e: unknown) => void; onDisconnected: () => void; onSelectStart: () => void; onSelectEnd: () => void; onSqueeze: () => void;
};

// A flat canvas panel in the world. Buttons are hit with a controller ray.
class Panel {
  mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private boxes: { y0: number; y1: number; fn: () => void }[] = [];
  private hits: THREE.Intersection[] = [];
  hover = -1;
  constructor(public wM: number, public hM: number, private pw = 800, private ph = 600, private fs = 1) {
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 20; this.mesh.frustumCulled = false;
  }

  private wrap(text: string, maxW: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const w of text.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (this.ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  // Title, paragraphs and a column of big buttons. Body text is about 2 degrees of visual angle at the normal distance.
  draw(title: string, lines: string[], buttons: Btn[], rtl: boolean): void {
    const g = this.ctx, W = this.pw, H = this.ph, fs = this.fs;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,20,36,0.94)'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = '#7fb0ff'; g.lineWidth = 4; g.stroke();
    g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'top';
    const x = rtl ? W - 36 : 36;
    let y = 26;
    if (title) { g.fillStyle = '#ffd24a'; g.font = `bold ${40 * fs}px system-ui, sans-serif`; g.fillText(title, x, y, W - 72); y += 60 * fs; }
    g.fillStyle = '#ffffff'; g.font = `${29 * fs}px system-ui, sans-serif`;
    for (const p of lines) for (const l of this.wrap(p, W - 72)) { if (y > H - 80 - buttons.length * 66) break; g.fillText(l, x, y); y += 37 * fs; }
    this.boxes.length = 0;
    const bh = 56, gap = 10;
    let by = H - 28 - buttons.length * (bh + gap) + gap;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      g.fillStyle = i === this.hover ? '#3a7bd5' : '#24344f';
      g.beginPath(); g.roundRect(30, by, W - 60, bh, 16); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 30px system-ui, sans-serif';
      g.fillText(b.label, W / 2, by + 10, W - 90);
      this.boxes.push({ y0: by, y1: by + bh, fn: b.fn });
      by += bh + gap;
    }
    this.tex.needsUpdate = true;
  }

  raw(): { g: CanvasRenderingContext2D; w: number; h: number; done: () => void } { return { g: this.ctx, w: this.pw, h: this.ph, done: () => { this.tex.needsUpdate = true; } }; }

  // Which button the ray is pointing at (-1 = none; -2 = on the panel but not on a button)
  hit(ray: THREE.Ray, ray3: THREE.Raycaster): number {
    ray3.ray.copy(ray);
    this.hits.length = 0;
    ray3.intersectObject(this.mesh, false, this.hits);
    const h = this.hits[0];
    if (!h || !h.uv) return -1;
    const py = (1 - h.uv.y) * this.ph;
    for (let i = 0; i < this.boxes.length; i++) if (py >= this.boxes[i].y0 && py <= this.boxes[i].y1) return i;
    return -1;
  }
  click(i: number): void { this.boxes[i]?.fn(); }
  setBox(y0: number, y1: number, fn: () => void): void { this.boxes.length = 0; this.boxes.push({ y0, y1, fn }); }
}

const PERF_FOVEATION = [0.5, 0.75, 1, 1];
const EYE_HEIGHT = 1.6; // used only when the headset gives us a "local" reference space (no floor)

export class Vr {
  // Errors and warnings kept for the diagnostics panel (last 10)
  static errors: string[] = [];
  static logError(msg: string): void { Vr.errors.push(msg); if (Vr.errors.length > 10) Vr.errors.shift(); }
  static captureErrors(): void {
    if ((Vr as unknown as { _cap?: boolean })._cap) return;
    (Vr as unknown as { _cap?: boolean })._cap = true;
    window.addEventListener('error', (e) => Vr.logError(`error: ${e.message}`));
    window.addEventListener('unhandledrejection', (e) => Vr.logError(`rejection: ${String((e as PromiseRejectionEvent).reason)}`));
  }

  active = false;
  entering = false;
  paused = false; // a menu is open
  hidden = false; // the system has taken the view (visibilityState is not "visible")
  eyeOffset = 0;
  refType = '';
  perfLevel = 0;
  fade = 0; // 0..1 black fade when the head is inside a wall
  stats = { ms: 0, fps: 0, worst: 0, stalls: 0 };
  lastTeleport = { ok: false, x: 0, z: 0 }; // read by the emulator test

  private ctrls: Rec[] = [];
  private panel = new Panel(1.2, 0.9);
  private wrist = new Panel(0.24, 0.24, 512, 512);
  private subs = new Panel(1.0, 0.28, 1000, 280, 1.45);
  private chartPanel = new Panel(1.2, 0.84, 800, 560);
  private diag = new Panel(1.3, 0.95, 1000, 730);
  private ray3 = new THREE.Raycaster();
  private arc: THREE.Line;
  private arcAttr: THREE.BufferAttribute;
  private marker: THREE.Mesh;
  private ringBg: THREE.Mesh;
  private ringFill: THREE.Mesh;
  private fadeQuad: THREE.Mesh;
  private aiming = false;
  private hasTarget = false;
  private target = new THREE.Vector3();
  private snapCool = 0;
  private snapArmed = true;
  private wristT = 0; private chartT = 0; private diagT = 0;
  private menuState: 'none' | 'main' | 'crew' | 'tasks' | 'text' | 'card' = 'none';
  private crewIndex = 0;
  private cardClose: (() => void) | null = null;
  private subText = ''; private subDrawn = ''; private subUntil = 0;
  private toastText = ''; private toastUntil = 0;
  private clock = 0;
  private session: XRSession | null = null;
  private showDiag = false;
  private diagReport = '';
  private copyNote = '';
  private stepBackAt = -10;
  private perfOver = 0; private perfUnder = 0; private worstLevel = 0; private ema = 13.9;
  private fpsAcc = 0; private fpsFrames = 0;
  // preallocated temporaries: nothing below is created per frame
  private tmpV = new THREE.Vector3(); private tmpV2 = new THREE.Vector3(); private tmpV3 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private rayA = new THREE.Ray(); private rayB = new THREE.Ray();
  private res: Resolved = { x: 0, z: 0, hit: null };
  private hx = 0; private hy = 0; private hz = 0; private hyaw = 0;

  get menuVisible(): boolean { return this.panel.mesh.visible; }
  get aimingNow(): boolean { return this.aiming && this.arc.visible; }
  // Test helpers: where the menu panel is, listener counts, and a way to move the head for the emulator test
  panelWorld(): { c: number[]; up: number[] } { const c = this.panel.mesh.getWorldPosition(new THREE.Vector3()); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.panel.mesh.getWorldQuaternion(new THREE.Quaternion())); return { c: [c.x, c.y, c.z], up: [up.x, up.y, up.z] }; }
  debugSetHead(x: number, z: number): void { this.setHeadXZ(x, z); }
  debugCounts(): { listeners: number; sceneChildren: number; ctrls: number } {
    let n = 0;
    for (const r of this.ctrls) { const l = (r.c as unknown as { _listeners?: Record<string, unknown[]> })._listeners ?? {}; for (const k of Object.keys(l)) n += l[k].length; }
    return { listeners: n, sceneChildren: this.h.scene.children.length, ctrls: this.ctrls.length };
  }

  constructor(private h: VrHost) {
    if (h.debug) Vr.captureErrors();
    // controller visuals (created once and reused by every session)
    for (let i = 0; i < 2; i++) {
      const c = h.renderer.xr.getController(i), grip = h.renderer.xr.getControllerGrip(i);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.7 }));
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.5 }));
      c.add(line); grip.add(body);
      const rec: Rec = {
        c, grip, line, index: i, hand: '', src: null, connected: false, isHand: false, prev: [false, false, false, false, false, false, false, false], selecting: false, pendingTp: false,
        onConnected: (e) => this.onConnected(rec, (e as { data: XRInputSource }).data),
        onDisconnected: () => this.onDisconnected(rec),
        onSelectStart: () => this.onSelect(rec, true),
        onSelectEnd: () => this.onSelect(rec, false),
        onSqueeze: () => this.onSqueeze(rec),
      };
      this.ctrls.push(rec);
    }
    // teleport arc (a fixed number of points, updated in place) and landing marker
    this.arcAttr = new THREE.BufferAttribute(new Float32Array(42 * 3), 3);
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', this.arcAttr); ag.setDrawRange(0, 0);
    this.arc = new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0x55ff88 }));
    this.arc.visible = false; this.arc.frustumCulled = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x55ff88, side: THREE.DoubleSide }));
    this.marker.visible = false;
    // progress ring for hold-to-start tasks
    this.ringBg = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }));
    this.ringFill = new THREE.Mesh(new THREE.CircleGeometry(0.07, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.ringBg.renderOrder = 30; this.ringFill.renderOrder = 31; this.ringBg.visible = false; this.ringFill.visible = false;
    // black fade in front of the eyes (head inside a wall)
    this.fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.fadeQuad.position.set(0, 0, -0.12); this.fadeQuad.renderOrder = 1000; this.fadeQuad.frustumCulled = false; this.fadeQuad.visible = false;
    this.wrist.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
    this.wrist.mesh.position.set(0, 0.06, 0.02);
    this.panel.mesh.visible = false; this.subs.mesh.visible = false; this.chartPanel.mesh.visible = false; this.diag.mesh.visible = false;
  }

  static async supported(): Promise<boolean> {
    try { return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr')); } catch { return false; }
  }

  // Must be called straight from the button's click handler (a user gesture). Nothing is required, so the request cannot fail on a missing feature.
  static request(): Promise<XRSession> {
    if (!navigator.xr) return Promise.reject(new Error('WebXR is not available in this browser'));
    return navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  }

  async enter(session: XRSession): Promise<void> {
    if (this.active || this.entering) { void session.end().catch(() => { /* already ending */ }); return; }
    this.entering = true;
    const h = this.h;
    try {
      let type: XRReferenceSpaceType = 'local-floor';
      try { await session.requestReferenceSpace('local-floor'); } catch { type = 'local'; Vr.logError('local-floor is not available: using "local" with a fixed eye height'); }
      this.refType = type; this.eyeOffset = type === 'local-floor' ? 0 : EYE_HEIGHT;
      h.renderer.xr.enabled = true;
      h.renderer.xr.setReferenceSpaceType(type);
      h.renderer.xr.setFramebufferScaleFactor(h.scale);
      h.renderer.xr.setFoveation(PERF_FOVEATION[0]);
      this.session = session;
      this.attach();
      session.addEventListener('end', this.onEnd);
      session.addEventListener('visibilitychange', this.onVis);
      await h.renderer.xr.setSession(session);
      h.rig.position.y += this.eyeOffset; // with a floor-less space the head starts at height 0
      this.active = true; this.hidden = false; this.perfLevel = 0; this.worstLevel = 0; this.perfOver = 0; this.perfUnder = 0; this.ema = 13.9; this.clock = 0;
      this.stats.stalls = 0; this.stats.worst = 0;
      this.entering = false;
      h.onStart();
    } catch (e) {
      // Leave nothing half started: the game goes back to its normal desktop state
      Vr.logError(`could not start VR: ${(e as Error).message}`);
      session.removeEventListener('end', this.onEnd); session.removeEventListener('visibilitychange', this.onVis);
      this.detach();
      h.renderer.xr.enabled = false;
      this.session = null; this.active = false; this.entering = false;
      try { await session.end(); } catch { /* already ended */ }
      throw e;
    }
  }

  async exit(): Promise<void> { await this.session?.end(); }

  // ---- session lifecycle ----
  private onEnd = (): void => {
    const { rig, renderer, camera } = this.h;
    this.session?.removeEventListener('visibilitychange', this.onVis);
    this.detach();
    this.active = false; this.session = null; this.hidden = false;
    renderer.xr.enabled = false;
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    this.menuState = 'none'; this.paused = false; this.aiming = false;
    this.h.setPaused(false); this.h.setAudio(true); this.h.setPerf(0); this.h.remember(this.worstLevel);
    this.h.onEnd();
  };

  private onVis = (): void => {
    const v = this.session?.visibilityState ?? 'visible';
    this.hidden = v !== 'visible';
    this.syncPause();
    this.h.setAudio(!this.hidden);
  };

  private syncPause(): void { this.h.setPaused(this.paused || this.hidden); }

  // Add the controllers, panels and helpers to the world, and listen to the controllers. detach() undoes exactly this.
  private attach(): void {
    const { scene, rig, camera } = this.h;
    for (const r of this.ctrls) {
      (r.c as unknown as EvTarget).addEventListener('connected', r.onConnected); (r.c as unknown as EvTarget).addEventListener('disconnected', r.onDisconnected);
      (r.c as unknown as EvTarget).addEventListener('selectstart', r.onSelectStart); (r.c as unknown as EvTarget).addEventListener('selectend', r.onSelectEnd);
      (r.c as unknown as EvTarget).addEventListener('squeezestart', r.onSqueeze);
      rig.add(r.c, r.grip);
    }
    scene.add(this.arc, this.marker, this.panel.mesh, this.subs.mesh, this.chartPanel.mesh, this.diag.mesh, this.ringBg, this.ringFill);
    camera.add(this.fadeQuad);
    this.showDiag = this.h.debug;
  }

  private detach(): void {
    const { scene, rig, camera } = this.h;
    for (const r of this.ctrls) {
      (r.c as unknown as EvTarget).removeEventListener('connected', r.onConnected); (r.c as unknown as EvTarget).removeEventListener('disconnected', r.onDisconnected);
      (r.c as unknown as EvTarget).removeEventListener('selectstart', r.onSelectStart); (r.c as unknown as EvTarget).removeEventListener('selectend', r.onSelectEnd);
      (r.c as unknown as EvTarget).removeEventListener('squeezestart', r.onSqueeze);
      rig.remove(r.c, r.grip);
      r.connected = false; r.src = null; r.hand = ''; r.selecting = false; r.pendingTp = false; r.isHand = false;
    }
    scene.remove(this.arc, this.marker, this.panel.mesh, this.subs.mesh, this.chartPanel.mesh, this.diag.mesh, this.ringBg, this.ringFill);
    camera.remove(this.fadeQuad);
    this.wrist.mesh.removeFromParent();
    this.panel.mesh.visible = false; this.subs.mesh.visible = false; this.chartPanel.mesh.visible = false; this.diag.mesh.visible = false;
    this.arc.visible = false; this.marker.visible = false; this.ringBg.visible = false; this.ringFill.visible = false; this.fadeQuad.visible = false;
    this.fade = 0;
  }

  private connectedCount(): number { let n = 0; for (let i = 0; i < this.ctrls.length; i++) if (this.ctrls[i].connected) n++; return n; }

  private onConnected(rec: Rec, src: XRInputSource): void {
    rec.src = src; rec.connected = true; rec.hand = src.handedness; rec.isHand = !!src.hand;
    this.placeWrist();
  }

  private onDisconnected(rec: Rec): void {
    // A controller vanished (battery, tracking, user put it down): let go of anything it was holding
    if (rec.selecting) { rec.selecting = false; const w = this.h.work(); if (w) w.pointerUp(); this.h.press(false); }
    rec.connected = false; rec.src = null; rec.hand = ''; rec.isHand = false; rec.pendingTp = false;
    if (this.aiming && rec === this.locoRec()) { this.aiming = false; this.arc.visible = false; this.marker.visible = false; this.hasTarget = false; }
    this.placeWrist();
  }

  // The wrist panel rides on the left controller, or on the only controller there is
  private placeWrist(): void {
    let best: Rec | null = null;
    for (let i = 0; i < this.ctrls.length; i++) { const r = this.ctrls[i]; if (!r.connected) continue; if (r.hand === 'left') { best = r; break; } if (!best) best = r; }
    if (best) best.grip.add(this.wrist.mesh); else this.wrist.mesh.removeFromParent();
  }

  // The controller used for teleport and snap turn: the right one, or whichever has a thumbstick
  private locoRec(): Rec | null {
    let any: Rec | null = null;
    for (let i = 0; i < this.ctrls.length; i++) { const r = this.ctrls[i]; if (!r.connected || !r.src?.gamepad) continue; if (r.hand === 'right') return r; if (!any) any = r; }
    return any;
  }

  // The controller that points at menus and tasks: the right one, else any
  private pointerRec(): Rec | null {
    let any: Rec | null = null;
    for (let i = 0; i < this.ctrls.length; i++) { const r = this.ctrls[i]; if (!r.connected) continue; if (r.hand === 'right') return r; if (!any) any = r; }
    return any;
  }

  // ---- panels ----
  // Fills this.hx/hy/hz (the head in world space) and this.hyaw (where it faces). No allocation.
  private head(): void {
    const { camera } = this.h;
    camera.getWorldPosition(this.tmpV);
    camera.getWorldQuaternion(this.tmpQ);
    this.tmpV2.set(0, 0, -1).applyQuaternion(this.tmpQ);
    this.hx = this.tmpV.x; this.hy = this.tmpV.y; this.hz = this.tmpV.z;
    this.hyaw = Math.atan2(-this.tmpV2.x, -this.tmpV2.z);
  }

  private placeInFront(mesh: THREE.Object3D, dist: number, dy: number, yawOff = 0): void {
    const yaw = this.hyaw + yawOff;
    mesh.position.set(this.hx - Math.sin(yaw) * dist, this.hy + dy, this.hz - Math.cos(yaw) * dist);
    mesh.lookAt(this.hx, this.hy + dy, this.hz);
  }

  // Keep a panel roughly where the player is looking, but only move it when they have turned or walked away
  private follow(mesh: THREE.Object3D, dist: number, dy: number, yawOff: number): void {
    const dx = mesh.position.x - this.hx, dz = mesh.position.z - this.hz;
    const d = Math.hypot(dx, dz);
    let diff = this.hyaw + yawOff - Math.atan2(-dx, -dz); // where the panel should be vs where it is
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (d > dist + 1.2 || d < dist - 0.9 || Math.abs(diff) > 1.0) this.placeInFront(mesh, dist, dy, yawOff);
  }

  private show(title: string, lines: string[], buttons: Btn[]): void {
    this.panel.draw(title, lines, buttons, this.h.rtl());
    this.panel.mesh.visible = true;
    this.head();
    this.placeInFront(this.panel.mesh, 1.3, -0.1);
    this.paused = true; this.syncPause();
  }

  closeMenu(): void {
    this.panel.mesh.visible = false; this.menuState = 'none'; this.paused = false; this.syncPause();
    this.cardClose = null;
  }

  mainMenu(): void {
    const L = this.h.labels;
    this.menuState = 'main';
    const btns: Btn[] = [
      { label: L.resume, fn: () => this.closeMenu() },
      { label: L.crew, fn: () => this.crewMenu() },
      { label: L.shelter, fn: () => { this.h.callShelter(); this.closeMenu(); } },
      { label: L.fastForward, fn: () => { this.h.toggleFF(); this.closeMenu(); } },
      { label: L.data, fn: () => this.text(L.data, this.h.dataLines()) },
      { label: L.log, fn: () => this.text(L.log, this.h.logLines()) },
    ];
    if (this.h.debug) btns.push({ label: L.diag, fn: () => { this.showDiag = !this.showDiag; this.closeMenu(); } });
    btns.push({ label: L.exit, fn: () => { void this.exit(); } });
    this.show(L.menu, [], btns);
  }

  crewMenu(only: number | null = null): void {
    const L = this.h.labels;
    const crew = this.h.crew();
    if (only !== null) { this.tasks(only); return; }
    this.menuState = 'crew';
    this.show(L.crew, [], [
      ...crew.map((c, i): Btn => ({ label: `${c.name}: ${c.doing}`, fn: () => this.tasks(i) })),
      { label: L.back, fn: () => this.mainMenu() },
    ]);
  }

  private tasks(i: number): void {
    const L = this.h.labels;
    const c = this.h.crew()[i];
    this.menuState = 'tasks'; this.crewIndex = i;
    this.show(c.name, [], [
      ...c.options.slice(0, 5).map((o): Btn => ({ label: o.label, fn: () => { this.h.assign(i, o.id); this.closeMenu(); } })),
      { label: L.rest, fn: () => { this.h.assign(i, null); this.closeMenu(); } },
      { label: L.back, fn: () => this.mainMenu() },
    ]);
  }

  text(title: string, lines: string[]): void {
    this.menuState = 'text';
    this.show(title, lines, [{ label: this.h.labels.back, fn: () => this.mainMenu() }]);
  }

  // Cards that the desktop shows as pop-ups (tutorial, storm info, results) come here in VR.
  card(title: string, lines: string[], button: string, onClose?: () => void): void {
    this.menuState = 'card'; this.cardClose = onClose ?? null;
    this.show(title, lines, [{ label: button, fn: () => { const f = this.cardClose; this.closeMenu(); f?.(); } }]);
  }

  toast(text: string): void { this.toastText = text; this.toastUntil = this.clock + 6; }
  subtitle(name: string, text: string, seconds: number): void { this.subText = name ? `${name}: ${text}` : text; this.subUntil = this.clock + seconds; }

  // The pop-out work panel sits at chest height in front of the player. The camera never moves.
  placeWork(group: THREE.Object3D): void {
    this.head();
    group.scale.setScalar(0.34);
    group.position.set(this.hx - Math.sin(this.hyaw) * 0.95, this.hy - 0.4, this.hz - Math.cos(this.hyaw) * 0.95);
    group.rotation.set(0, this.hyaw, 0);
  }

  // ---- input ----
  private rayOf(rec: Rec, out: THREE.Ray): THREE.Ray {
    rec.c.updateMatrixWorld(true);
    out.origin.setFromMatrixPosition(rec.c.matrixWorld);
    out.direction.set(0, 0, -1).transformDirection(rec.c.matrixWorld);
    return out;
  }

  private onSelect(rec: Rec, down: boolean): void {
    rec.selecting = down;
    if (!this.active || this.hidden || this.aiming) return;
    const ray = this.rayOf(rec, this.rayA);
    if (this.panel.mesh.visible) {
      if (down) { const i = this.panel.hit(ray, this.ray3); if (i >= 0) this.panel.click(i); }
      return;
    }
    if (this.showDiag && this.diag.mesh.visible && down) {
      const i = this.diag.hit(ray, this.ray3);
      if (i === 0) { this.copyReport(); return; }
    }
    const w = this.h.work();
    if (w) { if (down) w.pointerDownRay(ray); else w.pointerUp(); if (!down) this.h.press(false); return; }
    if (down) {
      // Hands have no thumbstick: a pinch on empty floor teleports, a pinch on something usable uses it
      if (rec.isHand && !this.h.interact()) rec.pendingTp = true; else this.h.press(true);
    } else if (rec.pendingTp) { rec.pendingTp = false; this.pinchTeleport(rec); } else this.h.press(false);
  }

  // Squeeze (grip, or a pinch with the other hand) opens the menu when the controller has no menu button
  private onSqueeze(rec: Rec): void {
    if (!this.active || this.hidden) return;
    if (!rec.isHand && rec.src?.gamepad && this.connectedCount() > 1) return; // real controllers use the X/Y button
    if (this.panel.mesh.visible) this.closeMenu(); else this.mainMenu();
  }

  private pinchTeleport(rec: Rec): void {
    this.head();
    this.rayOf(rec, this.rayB);
    if (this.arcToGround(this.rayB)) this.finishAim();
    else { this.hasTarget = false; this.lastTeleport.ok = false; }
  }

  // ---- movement ----
  private setHeadXZ(x: number, z: number): void {
    const { rig, camera, heightAt } = this.h;
    const th = rig.rotation.y, c = Math.cos(th), s = Math.sin(th);
    const hx = c * camera.position.x + s * camera.position.z, hz = -s * camera.position.x + c * camera.position.z;
    rig.position.set(x - hx, heightAt(x, z) + this.eyeOffset, z - hz);
  }

  private snapTurn(deg: number): void {
    const { rig } = this.h;
    this.head();
    const hx = this.hx, hz = this.hz;
    rig.rotation.y += (deg * Math.PI) / 180;
    this.setHeadXZ(hx, hz);
  }

  // Arc from the controller to the ground (gravity-bent). Fills the arc points in place. Returns true if the landing spot is valid.
  private arcToGround(ray: THREE.Ray): boolean {
    const pos = this.arcAttr.array as Float32Array;
    this.tmpV.copy(ray.direction).multiplyScalar(9);      // velocity
    this.tmpV2.copy(ray.origin);                           // point
    let n = 0, hit = false;
    for (let i = 0; i < 40; i++) {
      pos[n * 3] = this.tmpV2.x; pos[n * 3 + 1] = this.tmpV2.y; pos[n * 3 + 2] = this.tmpV2.z; n++;
      const nx = this.tmpV2.x + this.tmpV.x * 0.05, ny = this.tmpV2.y + this.tmpV.y * 0.05, nz = this.tmpV2.z + this.tmpV.z * 0.05;
      this.tmpV.y -= 9.8 * 0.05;
      const gy = this.h.heightAt(nx, nz);
      if (ny <= gy) { this.target.set(nx, gy, nz); pos[n * 3] = nx; pos[n * 3 + 1] = gy; pos[n * 3 + 2] = nz; n++; hit = true; break; }
      this.tmpV2.set(nx, ny, nz);
    }
    this.arcAttr.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, n);
    let ok = false;
    if (hit) {
      const dist = Math.hypot(this.target.x - this.hx, this.target.z - this.hz);
      ok = dist < 14 && this.walkable(this.hx, this.hz, this.target.x, this.target.z);
    }
    (this.arc.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x55ff88 : 0xff5555);
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x55ff88 : 0xff5555);
    this.arc.visible = true;
    this.marker.visible = hit;
    if (hit) this.marker.position.set(this.target.x, this.target.y + 0.03, this.target.z);
    this.hasTarget = ok;
    return ok;
  }

  private finishAim(): void {
    this.arc.visible = false; this.marker.visible = false;
    this.lastTeleport.ok = this.hasTarget; this.lastTeleport.x = this.hasTarget ? this.target.x : 0; this.lastTeleport.z = this.hasTarget ? this.target.z : 0;
    if (this.hasTarget) this.setHeadXZ(this.target.x, this.target.z);
    this.hasTarget = false;
  }

  private walkable(x0: number, z0: number, x1: number, z1: number): boolean {
    const bl = this.h.blockers();
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.35));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      resolve(bl, x, z, x, z, 0.35, false, this.res);
      if (Math.hypot(this.res.x - x, this.res.z - z) > 0.02) return false;
    }
    return true;
  }

  // ---- performance: the headset needs ~72 fps. Lower foveation and shadows when frames run long; raise them again when there is room.
  // (The framebuffer scale cannot change during a session in WebXR/Three, so it is chosen at the start and remembered.)
  private perfTick(dt: number): void {
    const ms = dt * 1000;
    this.ema = this.ema * 0.9 + ms * 0.1;
    this.stats.ms = this.ema;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.stats.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    if (ms > this.stats.worst) this.stats.worst = ms;
    if (ms > 50) this.stats.stalls++;
    const rate = this.session?.frameRate ?? 72;
    const budget = 1000 / rate;
    if (this.ema > budget * 1.12) this.perfOver += dt; else this.perfOver = Math.max(0, this.perfOver - dt * 0.5);
    if (this.ema < budget * 0.7) this.perfUnder += dt; else this.perfUnder = 0;
    if (this.perfOver > 2 && this.perfLevel < 3) { this.perfLevel++; this.perfOver = 0; this.applyPerf(); }
    else if (this.perfUnder > 6 && this.perfLevel > 0) { this.perfLevel--; this.perfUnder = 0; this.applyPerf(); }
  }

  private applyPerf(): void {
    if (this.perfLevel > this.worstLevel) this.worstLevel = this.perfLevel;
    this.h.renderer.xr.setFoveation(PERF_FOVEATION[this.perfLevel]);
    this.h.setPerf(this.perfLevel);
  }

  // ---- per frame ----
  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    this.perfTick(dt);
    if (this.hidden) return; // the system is showing its own UI: the game is paused
    const { camera } = this.h;
    camera.updateMatrixWorld(true);
    this.head();
    this.h.setPlayer(this.hx, this.hz, this.hyaw);

    // Head inside a wall (the player walked in real life): fade to black and ask them to step back
    resolve(this.h.blockers(), this.hx, this.hz, this.hx, this.hz, 0.2, false, this.res);
    const inside = Math.hypot(this.res.x - this.hx, this.res.z - this.hz) > 0.04;
    const tf = inside ? 1 : 0;
    this.fade += (tf - this.fade) * Math.min(1, dt * 10);
    (this.fadeQuad.material as THREE.MeshBasicMaterial).opacity = this.fade;
    this.fadeQuad.visible = this.fade > 0.02;
    if (inside && this.clock - this.stepBackAt > 4) { this.stepBackAt = this.clock; this.toast(this.h.labels.stepBack); }

    // thumbsticks and buttons (read from the sources remembered when each controller connected)
    this.snapCool = Math.max(0, this.snapCool - dt);
    const loco = this.locoRec();
    const single = this.connectedCount() === 1;
    let aimRec: Rec | null = null;
    for (let i = 0; i < this.ctrls.length; i++) {
      const rec = this.ctrls[i];
      const gp = rec.connected ? rec.src?.gamepad : null;
      if (!gp) continue;
      if (rec === loco) {
        // standard layout has the thumbstick on axes 2 and 3; some devices only expose 0 and 1
        let ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] ?? 0;
        let ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] ?? 0;
        if (Math.hypot(ax, ay) < 0.15) { ax = 0; ay = 0; } // dead zone
        if (ay < -0.5 && !this.paused) aimRec = rec;
        else if (!this.aiming && !this.paused) {
          if (Math.abs(ax) < 0.3) this.snapArmed = true;
          else if (Math.abs(ax) > 0.7 && this.snapArmed && this.snapCool <= 0) { this.snapTurn(ax > 0 ? -30 : 30); this.snapCool = 0.2; this.snapArmed = false; } // one turn per flick
        }
      }
      // menu: the X or Y button on the left controller (A or B when there is only one controller)
      const b = gp.buttons;
      const p4 = !!b[4]?.pressed, p5 = !!b[5]?.pressed;
      if ((rec.hand === 'left' || single) && ((p4 && !rec.prev[4]) || (p5 && !rec.prev[5]))) {
        if (this.panel.mesh.visible) this.closeMenu(); else this.mainMenu();
      }
      rec.prev[4] = p4; rec.prev[5] = p5;
    }
    if (aimRec) { this.aiming = true; this.rayOf(aimRec, this.rayB); this.arcToGround(this.rayB); }
    else if (this.aiming) { this.aiming = false; this.finishAim(); }

    // panel hover, the work panel ray, and the hold progress ring
    const rc = this.pointerRec();
    let holding = 0;
    if (rc) {
      const ray = this.rayOf(rc, this.rayA);
      if (this.panel.mesh.visible) {
        const i = this.panel.hit(ray, this.ray3);
        if (i !== this.panel.hover) { this.panel.hover = i; this.redrawMenu(); }
      } else {
        const w = this.h.work();
        if (w) { w.autoTool(); w.pointerMoveRay(ray); } else holding = this.h.hold();
      }
      if (holding > 0) {
        this.ringBg.visible = true; this.ringFill.visible = true;
        this.tmpV3.copy(ray.direction).multiplyScalar(0.9).add(ray.origin);
        this.ringBg.position.copy(this.tmpV3); this.ringFill.position.copy(this.tmpV3);
        this.ringBg.lookAt(this.hx, this.hy, this.hz); this.ringFill.lookAt(this.hx, this.hy, this.hz);
        this.ringFill.scale.setScalar(Math.max(0.05, holding));
      } else { this.ringBg.visible = false; this.ringFill.visible = false; }
    }

    // wrist panel, storm chart and diagnostics (a few times a second); subtitles only when the text changes
    this.wristT -= dt;
    if (this.wristT <= 0) { this.wristT = 0.25; this.drawWrist(); }
    const showSub = this.clock < this.subUntil && !this.panel.mesh.visible;
    this.subs.mesh.visible = showSub;
    if (showSub) {
      if (this.subText !== this.subDrawn) { this.subDrawn = this.subText; this.subs.draw('', [this.subText], [], this.h.rtl()); }
      this.placeInFront(this.subs.mesh, 1.2, -0.45);
    }
    this.chartT -= dt;
    if (this.chartT <= 0) { this.chartT = 0.5; this.drawChart(); }
    if (this.chartPanel.mesh.visible) this.follow(this.chartPanel.mesh, 1.5, -0.05, 0.6);
    if (this.showDiag) {
      this.diagT -= dt;
      if (this.diagT <= 0) { this.diagT = 0.25; this.drawDiag(); }
      this.diag.mesh.visible = !this.panel.mesh.visible;
      if (this.diag.mesh.visible) this.follow(this.diag.mesh, 1.7, 0.1, -0.6);
    } else this.diag.mesh.visible = false;
  }

  private redrawMenu(): void {
    // Re-open the current screen so the hovered button is highlighted (cheap: one canvas)
    const s = this.menuState;
    const keep = this.panel.hover;
    const f = s === 'main' ? () => this.mainMenu() : s === 'crew' ? () => this.crewMenu() : s === 'tasks' ? () => this.tasks(this.crewIndex) : null;
    if (f) { const p = this.panel.mesh.position.clone(), q = this.panel.mesh.quaternion.clone(); f(); this.panel.hover = keep; this.panel.mesh.position.copy(p); this.panel.mesh.quaternion.copy(q); }
  }

  private drawWrist(): void {
    const hud = this.h.hud();
    const { g, w, h: hh, done } = this.wrist.raw();
    g.clearRect(0, 0, w, hh);
    g.fillStyle = 'rgba(10,18,32,0.92)'; g.beginPath(); g.roundRect(4, 4, w - 8, hh - 8, 30); g.fill();
    g.strokeStyle = '#7fb0ff'; g.lineWidth = 4; g.stroke();
    const rtl = this.h.rtl();
    g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'top';
    const x = rtl ? w - 24 : 24;
    g.fillStyle = '#ffd24a'; g.font = 'bold 32px system-ui, sans-serif'; g.fillText(`${hud.sol}  ${hud.timer}`, x, 16, w - 48);
    hud.bars.forEach((b, i) => {
      const y = 60 + i * 56;
      g.fillStyle = b.warn ? '#ff8a7a' : '#fff'; g.font = '27px system-ui, sans-serif'; g.fillText(b.label, x, y, w - 48);
      g.fillStyle = '#ffffff22'; g.fillRect(24, y + 29, w - 48, 12);
      g.fillStyle = b.color; g.fillRect(rtl ? w - 24 - (w - 48) * b.pct / 100 : 24, y + 29, (w - 48) * b.pct / 100, 12);
    });
    const yb = 60 + hud.bars.length * 56;
    g.fillStyle = '#ff9a8a'; g.font = '24px system-ui, sans-serif'; g.fillText(hud.dose, x, yb, w - 48);
    const msg = this.clock < this.toastUntil ? this.toastText : hud.prompt || hud.job || hud.banner;
    g.fillStyle = '#9fd0ff'; g.fillText(hud.hold > 0 ? `${this.h.labels.hold} ${Math.round(hud.hold * 100)}%` : msg, x, yb + 32, w - 48);
    done();
  }

  // The live storm chart with its source badges, as a panel (the DOM chart cannot be seen in VR)
  private drawChart(): void {
    const c = this.h.chart();
    if (!c) { this.chartPanel.mesh.visible = false; return; }
    const { g, w, h: hh, done } = this.chartPanel.raw();
    g.clearRect(0, 0, w, hh);
    g.fillStyle = 'rgba(11,29,68,0.95)'; g.beginPath(); g.roundRect(4, 4, w - 8, hh - 8, 26); g.fill();
    g.strokeStyle = '#7fb0ff'; g.lineWidth = 4; g.stroke();
    const rtl = this.h.rtl();
    g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'top';
    const x = rtl ? w - 30 : 30;
    g.fillStyle = '#9cc4ff'; g.font = 'bold 34px system-ui, sans-serif'; g.fillText(c.title, x, 22, w - 60);
    g.fillStyle = '#ffd24a'; g.font = 'bold 26px system-ui, sans-serif'; g.fillText(c.badges, x, 70, w - 60);
    g.drawImage(c.canvas, 30, 112, w - 60, (w - 60) * (c.canvas.height / c.canvas.width));
    g.fillStyle = '#dbe8ff'; g.font = '24px system-ui, sans-serif'; g.fillText(c.note, x, hh - 62, w - 60);
    done();
    this.chartPanel.mesh.visible = !this.panel.mesh.visible;
  }

  // ---- diagnostics (?vrdebug=1) ----
  private report(): string {
    const lines: string[] = [];
    const s = this.session;
    lines.push(`session: ${this.active ? 'active' : 'off'}  visibility: ${s?.visibilityState ?? '-'}  paused menu: ${this.paused}`);
    lines.push(`reference space: ${this.refType}  eye offset: ${this.eyeOffset} m`);
    lines.push(`refresh: ${s?.frameRate ?? 'n/a'} Hz  supported: ${s?.supportedFrameRates ? Array.from(s.supportedFrameRates).join(',') : 'n/a'}`);
    lines.push(`frame: ${this.stats.ms.toFixed(1)} ms  ${this.stats.fps.toFixed(0)} fps  worst ${this.stats.worst.toFixed(0)} ms  stalls>50ms: ${this.stats.stalls}`);
    lines.push(`framebuffer scale: ${this.h.scale}  perf level: ${this.perfLevel}  foveation: ${PERF_FOVEATION[this.perfLevel]}`);
    for (let i = 0; i < this.ctrls.length; i++) {
      const r = this.ctrls[i];
      if (!r.connected || !r.src) { lines.push(`input ${i}: not connected`); continue; }
      const gp = r.src.gamepad;
      lines.push(`input ${i}: ${r.hand || 'no hand'}  ${r.isHand ? 'hand tracking' : 'controller'}  ${r.src.profiles[0] ?? '-'}  gamepad: ${gp ? gp.axes.length + ' axes, ' + gp.buttons.length + ' buttons' : 'none'}`);
    }
    lines.push(`errors (${Vr.errors.length}):`);
    for (let i = Vr.errors.length - 1; i >= 0; i--) lines.push(' ' + Vr.errors[i].slice(0, 110));
    return lines.join('\n');
  }

  private copyReport(): void {
    this.diagReport = this.report();
    this.copyNote = 'Copy not available: read the text out loud.';
    try { void navigator.clipboard?.writeText(this.diagReport).then(() => { this.copyNote = 'Copied.'; }, () => { /* keep the read-aloud note */ }); } catch { /* no clipboard in this browser */ }
  }

  private drawDiag(): void {
    const { g, w, h: hh, done } = this.diag.raw();
    g.clearRect(0, 0, w, hh);
    g.fillStyle = 'rgba(8,14,26,0.95)'; g.beginPath(); g.roundRect(4, 4, w - 8, hh - 8, 24); g.fill();
    g.strokeStyle = '#55ff88'; g.lineWidth = 4; g.stroke();
    g.direction = 'ltr'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = '#55ff88'; g.font = 'bold 34px monospace'; g.fillText('VR diagnostics', 28, 18);
    g.fillStyle = '#e6f1ff'; g.font = '27px monospace';
    const text = this.report().split('\n');
    let y = 66;
    for (let i = 0; i < text.length && y < hh - 100; i++) { g.fillText(text[i], 28, y, w - 56); y += 31; }
    g.fillStyle = '#24344f'; g.beginPath(); g.roundRect(28, hh - 84, 300, 56, 14); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 28px system-ui, sans-serif'; g.fillText(this.h.labels.copy, 50, hh - 70);
    g.fillStyle = '#ffd24a'; g.font = '24px system-ui, sans-serif'; g.fillText(this.copyNote, 350, hh - 70, w - 380);
    done();
    this.diag.setBox(hh - 84, hh - 28, () => this.copyReport()); // one button: Copy report
  }
}
