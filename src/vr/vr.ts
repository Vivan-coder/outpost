import * as THREE from 'three';
import { resolve, type Blocker } from '../game/collide';
import type { WorkSession } from '../game/work';

// WebXR mode. Loaded only when the player presses "Enter VR", so it never touches the desktop or phone game.
// Comfort first: teleport with an arc, snap turns, no camera movement forced on the player, and the HUD lives on
// world-space panels (a wrist panel, a floating menu and a subtitle panel) because screen overlays do not show in VR.

export interface VrBar { label: string; pct: number; color: string; warn?: boolean }
export interface VrHud { bars: VrBar[]; timer: string; sol: string; dose: string; banner: string; prompt: string; hold: number; job: string }
export interface VrLabels { resume: string; crew: string; shelter: string; fastForward: string; data: string; log: string; exit: string; back: string; ok: string; rest: string; menu: string; hold: string }
export interface VrCrewEntry { name: string; doing: string; options: { id: string; label: string }[] }

export interface VrHost {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; rig: THREE.Group;
  heightAt(x: number, z: number): number;
  blockers(): Blocker[];
  setPlayer(x: number, z: number, yaw: number): void;
  press(on: boolean): void;
  work(): WorkSession | null;
  hud(): VrHud;
  labels: VrLabels;
  crew(): VrCrewEntry[];
  assign(i: number, id: string | null): void;
  callShelter(): void;
  toggleFF(): void;
  dataLines(): string[];
  logLines(): string[];
  setPaused(on: boolean): void;
  rtl(): boolean;
  onStart(): void;
  onEnd(): void;
}

interface Btn { label: string; fn: () => void }

// A flat canvas panel in the world. Buttons are hit with a controller ray.
class Panel {
  mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private boxes: { y0: number; y1: number; fn: () => void }[] = [];
  hover = -1;
  constructor(public wM: number, public hM: number, private pw = 800, private ph = 600) {
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 20;
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

  // Title, paragraphs and a column of big buttons. Text is at least about 3 cm tall at 1 m.
  draw(title: string, lines: string[], buttons: Btn[], rtl: boolean): void {
    const g = this.ctx, W = this.pw, H = this.ph;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,20,36,0.94)'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 28); g.fill();
    g.strokeStyle = '#7fb0ff'; g.lineWidth = 4; g.stroke();
    g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'top';
    const x = rtl ? W - 36 : 36;
    g.fillStyle = '#ffd24a'; g.font = 'bold 40px system-ui, sans-serif';
    g.fillText(title, x, 26, W - 72);
    g.fillStyle = '#ffffff'; g.font = '29px system-ui, sans-serif';
    let y = 86;
    for (const p of lines) for (const l of this.wrap(p, W - 72)) { if (y > H - 80 - buttons.length * 66) break; g.fillText(l, x, y); y += 37; }
    this.boxes = [];
    const bh = 56, gap = 10;
    let by = H - 28 - buttons.length * (bh + gap) + gap;
    buttons.forEach((b, i) => {
      g.fillStyle = i === this.hover ? '#3a7bd5' : '#24344f';
      g.beginPath(); g.roundRect(30, by, W - 60, bh, 16); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 30px system-ui, sans-serif';
      g.fillText(b.label, W / 2, by + 10, W - 90);
      this.boxes.push({ y0: by, y1: by + bh, fn: b.fn });
      by += bh + gap;
    });
    this.tex.needsUpdate = true;
  }

  raw(): { g: CanvasRenderingContext2D; w: number; h: number; done: () => void } { return { g: this.ctx, w: this.pw, h: this.ph, done: () => { this.tex.needsUpdate = true; } }; }

  // Which button the ray is pointing at (and a redraw hint when the hover changes).
  hit(ray: THREE.Ray, ray3: THREE.Raycaster): number {
    ray3.ray.copy(ray);
    const h = ray3.intersectObject(this.mesh, false)[0];
    if (!h || !h.uv) return -1;
    const py = (1 - h.uv.y) * this.ph;
    return this.boxes.findIndex((b) => py >= b.y0 && py <= b.y1);
  }
  click(i: number): void { this.boxes[i]?.fn(); }
}


export class Vr {
  active = false;
  paused = false;
  private ctrls: { c: THREE.Group; grip: THREE.Group; hand: string; line: THREE.Line; prev: boolean[]; selecting: boolean }[] = [];
  private panel = new Panel(1.2, 0.9);
  private wrist = new Panel(0.24, 0.24, 512, 512);
  private subs = new Panel(1.0, 0.2, 1000, 200);
  private ray3 = new THREE.Raycaster();
  private arc!: THREE.Line;
  private marker!: THREE.Mesh;
  private aiming = false;
  private target: THREE.Vector3 | null = null;
  private snapCool = 0;
  private wristT = 0;
  private menuState: 'none' | 'main' | 'crew' | 'tasks' | 'text' | 'card' = 'none';
  private crewIndex = 0;
  private cardClose: (() => void) | null = null;
  private subText = ''; private subUntil = 0;
  private toastText = ''; private toastUntil = 0;
  private clock = 0;
  private session: XRSession | null = null;
  private tmpV = new THREE.Vector3(); private tmpQ = new THREE.Quaternion();
  lastTeleport = { ok: false, x: 0, z: 0 }; // read by the emulator test
  get menuVisible(): boolean { return this.panel.mesh.visible; }
  get aimingNow(): boolean { return this.aiming && this.arc.visible; }
  // Test helpers: where the menu panel is, and a way to move the head for the emulator test (the real game uses teleport)
  panelWorld(): { c: number[]; up: number[] } { const c = this.panel.mesh.getWorldPosition(new THREE.Vector3()); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.panel.mesh.getWorldQuaternion(new THREE.Quaternion())); return { c: [c.x, c.y, c.z], up: [up.x, up.y, up.z] }; }
  debugSetHead(x: number, z: number): void { this.setHeadXZ(x, z); }

  constructor(private h: VrHost) {}

  static async supported(): Promise<boolean> {
    try { return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr')); } catch { return false; }
  }

  async enter(): Promise<void> {
    if (this.active) return;
    const h = this.h;
    const session = await navigator.xr!.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'bounded-floor'] });
    this.session = session;
    h.renderer.xr.enabled = true;
    h.renderer.xr.setReferenceSpaceType('local-floor');
    h.renderer.xr.setFramebufferScaleFactor(0.9);
    h.renderer.xr.setFoveation(1);
    // The headset adds its real position on top of the rig; start with the rig where the player stands
    h.camera.position.set(0, 1.6, 0); h.camera.quaternion.identity(); h.camera.rotation.set(0, 0, 0);
    this.buildScene();
    await h.renderer.xr.setSession(session);
    this.active = true;
    session.addEventListener('end', () => this.cleanup());
    h.onStart();
  }

  async exit(): Promise<void> { await this.session?.end(); }

  private buildScene(): void {
    const { scene, rig, renderer } = this.h;
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.7 }));
      c.add(line);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.5 }));
      grip.add(body);
      const rec = { c, grip, hand: '', line, prev: [] as boolean[], selecting: false };
      c.addEventListener('connected', (e: unknown) => { rec.hand = (e as { data: XRInputSource }).data.handedness; if (rec.hand === 'left') this.attachWrist(grip); });
      c.addEventListener('selectstart', () => this.trigger(rec, true));
      c.addEventListener('selectend', () => this.trigger(rec, false));
      rig.add(c, grip);
      this.ctrls.push(rec);
    }
    // teleport arc and landing marker
    this.arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x55ff88 }));
    this.arc.visible = false; this.arc.frustumCulled = false;
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x55ff88, side: THREE.DoubleSide }));
    this.marker.visible = false;
    scene.add(this.arc, this.marker, this.panel.mesh, this.subs.mesh);
    this.panel.mesh.visible = false; this.subs.mesh.visible = false;
    this.wrist.mesh.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
    this.wrist.mesh.position.set(0, 0.06, 0.02);
  }

  private attachWrist(grip: THREE.Group): void { grip.add(this.wrist.mesh); }

  private cleanup(): void {
    const { scene, rig, renderer, camera } = this.h;
    this.active = false; this.session = null;
    for (const r of this.ctrls) { rig.remove(r.c, r.grip); }
    this.ctrls = [];
    scene.remove(this.arc, this.marker, this.panel.mesh, this.subs.mesh);
    this.wrist.mesh.removeFromParent();
    renderer.xr.enabled = false;
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    this.menuState = 'none'; this.paused = false; this.h.setPaused(false);
    this.h.onEnd();
  }

  // ---- panels ----
  private head(): { pos: THREE.Vector3; yaw: number } {
    const pos = this.h.camera.getWorldPosition(this.tmpV.clone());
    const q = this.h.camera.getWorldQuaternion(this.tmpQ);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return { pos, yaw: Math.atan2(-f.x, -f.z) };
  }

  private placeInFront(mesh: THREE.Object3D, dist: number, dy: number): void {
    const { pos, yaw } = this.head();
    mesh.position.set(pos.x - Math.sin(yaw) * dist, pos.y + dy, pos.z - Math.cos(yaw) * dist);
    mesh.lookAt(pos.x, pos.y + dy, pos.z);
  }

  private show(title: string, lines: string[], buttons: Btn[]): void {
    this.panel.draw(title, lines, buttons, this.h.rtl());
    this.panel.mesh.visible = true;
    this.placeInFront(this.panel.mesh, 1.3, -0.1);
    this.paused = true; this.h.setPaused(true);
  }

  closeMenu(): void {
    this.panel.mesh.visible = false; this.menuState = 'none'; this.paused = false; this.h.setPaused(false);
    this.cardClose = null;
  }

  mainMenu(): void {
    const L = this.h.labels;
    this.menuState = 'main';
    this.show(L.menu, [], [
      { label: L.resume, fn: () => this.closeMenu() },
      { label: L.crew, fn: () => this.crewMenu() },
      { label: L.shelter, fn: () => { this.h.callShelter(); this.closeMenu(); } },
      { label: L.fastForward, fn: () => { this.h.toggleFF(); this.closeMenu(); } },
      { label: L.data, fn: () => this.text(L.data, this.h.dataLines()) },
      { label: L.log, fn: () => this.text(L.log, this.h.logLines()) },
      { label: L.exit, fn: () => { void this.exit(); } },
    ]);
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
    const { pos, yaw } = this.head();
    group.scale.setScalar(0.34);
    group.position.set(pos.x - Math.sin(yaw) * 0.95, pos.y - 0.4, pos.z - Math.cos(yaw) * 0.95);
    group.rotation.set(0, yaw, 0);
  }

  // ---- input ----
  private rightCtrl() { return this.ctrls.find((c) => c.hand === 'right') ?? this.ctrls[1] ?? this.ctrls[0]; }

  private rayOf(c: { c: THREE.Group }): THREE.Ray {
    c.c.updateMatrixWorld(true);
    const o = new THREE.Vector3().setFromMatrixPosition(c.c.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(c.c.matrixWorld);
    return new THREE.Ray(o, d);
  }

  private trigger(rec: { selecting: boolean; c: THREE.Group }, down: boolean): void {
    rec.selecting = down;
    if (this.aiming) return;
    const ray = this.rayOf(rec);
    if (this.panel.mesh.visible) {
      if (down) { const i = this.panel.hit(ray, this.ray3); if (i >= 0) this.panel.click(i); }
      return;
    }
    const w = this.h.work();
    if (w) { if (down) w.pointerDownRay(ray); else w.pointerUp(); }
    if (!w || !down) this.h.press(down && !w);
  }

  // ---- movement ----
  private setHeadXZ(x: number, z: number): void {
    const { rig, camera, heightAt } = this.h;
    const th = rig.rotation.y, c = Math.cos(th), s = Math.sin(th);
    const hx = c * camera.position.x + s * camera.position.z, hz = -s * camera.position.x + c * camera.position.z;
    rig.position.set(x - hx, heightAt(x, z), z - hz);
  }

  private snapTurn(deg: number): void {
    const { rig } = this.h;
    const { pos } = this.head();
    rig.rotation.y += (deg * Math.PI) / 180;
    this.setHeadXZ(pos.x, pos.z);
  }

  // Arc from the controller to the ground. Valid only on open floor with no wall in between.
  private aim(rec: { c: THREE.Group }): void {
    const ray = this.rayOf(rec);
    const pts: THREE.Vector3[] = [];
    const v = ray.direction.clone().multiplyScalar(9);
    const p = ray.origin.clone();
    let hit: THREE.Vector3 | null = null;
    for (let i = 0; i < 40; i++) {
      pts.push(p.clone());
      const nx = p.clone().addScaledVector(v, 0.05); v.y -= 9.8 * 0.05;
      const gy = this.h.heightAt(nx.x, nx.z);
      if (nx.y <= gy) { hit = new THREE.Vector3(nx.x, gy, nx.z); pts.push(hit.clone()); break; }
      p.copy(nx);
    }
    let ok = false;
    if (hit) {
      const { pos } = this.head();
      const dist = Math.hypot(hit.x - pos.x, hit.z - pos.z);
      ok = dist < 14 && this.walkable(pos.x, pos.z, hit.x, hit.z);
    }
    this.arc.geometry.setFromPoints(pts);
    (this.arc.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x55ff88 : 0xff5555);
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x55ff88 : 0xff5555);
    this.arc.visible = true;
    this.marker.visible = !!hit;
    if (hit) this.marker.position.set(hit.x, hit.y + 0.03, hit.z);
    this.target = ok ? hit : null;
  }

  private walkable(x0: number, z0: number, x1: number, z1: number): boolean {
    const bl = this.h.blockers();
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.35));
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const r = resolve(bl, x, z, x, z, 0.35, false);
      if (Math.hypot(r.x - x, r.z - z) > 0.02) return false;
    }
    return true;
  }

  // ---- per frame ----
  update(dt: number): void {
    if (!this.active) return;
    this.clock += dt;
    const { camera } = this.h;
    camera.updateMatrixWorld(true);
    const { pos, yaw } = this.head();
    this.h.setPlayer(pos.x, pos.z, yaw);

    // thumbsticks and buttons
    const src = this.session?.inputSources ?? [];
    let aimRec: (typeof this.ctrls)[number] | null = null;
    this.snapCool = Math.max(0, this.snapCool - dt);
    for (const s of src) {
      const gp = s.gamepad;
      if (!gp) continue;
      const rec = this.ctrls.find((c) => c.hand === s.handedness);
      if (!rec) continue;
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] ?? 0, ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] ?? 0;
      if (s.handedness === 'right') {
        if (ay < -0.6 && !this.paused) aimRec = rec;
        else if (!this.aiming && Math.abs(ax) > 0.7 && this.snapCool <= 0 && !this.paused) { this.snapTurn(ax > 0 ? -30 : 30); this.snapCool = 0.35; }
      }
      // menu: the X or Y button on the left controller
      const pressed = gp.buttons.map((b) => b.pressed);
      if (s.handedness === 'left' && ((pressed[4] && !rec.prev[4]) || (pressed[5] && !rec.prev[5]))) {
        if (this.panel.mesh.visible) this.closeMenu(); else this.mainMenu();
      }
      rec.prev = pressed;
    }
    if (aimRec) { this.aiming = true; this.aim(aimRec); }
    else if (this.aiming) {
      this.aiming = false; this.arc.visible = false; this.marker.visible = false;
      this.lastTeleport = { ok: !!this.target, x: this.target?.x ?? 0, z: this.target?.z ?? 0 };
      if (this.target) this.setHeadXZ(this.target.x, this.target.z);
      this.target = null;
    }

    // panel hover and the work panel ray
    const rc = this.rightCtrl();
    if (rc) {
      const ray = this.rayOf(rc);
      if (this.panel.mesh.visible) {
        const i = this.panel.hit(ray, this.ray3);
        if (i !== this.panel.hover) { this.panel.hover = i; this.redrawMenu(); }
      } else {
        const w = this.h.work();
        if (w) { w.autoTool(); w.pointerMoveRay(ray); }
      }
    }

    // wrist panel (4 times a second) and subtitles
    this.wristT -= dt;
    if (this.wristT <= 0) { this.wristT = 0.25; this.drawWrist(); }
    const showSub = this.clock < this.subUntil && !this.panel.mesh.visible;
    this.subs.mesh.visible = showSub;
    if (showSub) {
      this.subs.draw('', [this.subText], [], this.h.rtl());
      this.placeInFront(this.subs.mesh, 1.2, -0.45);
    }
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
    g.fillStyle = '#ffd24a'; g.font = 'bold 30px system-ui, sans-serif'; g.fillText(`${hud.sol}  ${hud.timer}`, x, 18, w - 48);
    hud.bars.forEach((b, i) => {
      const y = 62 + i * 52;
      g.fillStyle = b.warn ? '#ff8a7a' : '#fff'; g.font = '24px system-ui, sans-serif'; g.fillText(b.label, x, y, w - 48);
      g.fillStyle = '#ffffff22'; g.fillRect(24, y + 26, w - 48, 12);
      g.fillStyle = b.color; g.fillRect(rtl ? w - 24 - (w - 48) * b.pct / 100 : 24, y + 26, (w - 48) * b.pct / 100, 12);
    });
    const yb = 62 + hud.bars.length * 52;
    g.fillStyle = '#ff9a8a'; g.font = '22px system-ui, sans-serif'; g.fillText(hud.dose, x, yb, w - 48);
    const msg = this.clock < this.toastUntil ? this.toastText : hud.prompt || hud.job || hud.banner;
    g.fillStyle = '#9fd0ff'; g.fillText(hud.hold > 0 ? `${this.h.labels.hold} ${Math.round(hud.hold * 100)}%` : msg, x, yb + 30, w - 48);
    done();
  }
}
