import * as THREE from 'three';
import type { LevelConfig, ModuleType, SimState } from '../sim/sim.ts';
import { createModuleModel, createRockPile } from '../render/models';
import { createBuilding, createMarker, createTag, type Building } from '../render/building';
import { heightAt } from '../render/terrain';
import { caps } from '../sim/sim.ts';
import { CONTAINERS, LANDER_PAD, MODULE_POS, SHELTER_AT, STATION_R, STATION_PROPS, SHELTER_PROPS } from '../data/layout';
import { t, type TextKey } from '../i18n/en';
import type { Blocker } from './collide';

interface ModuleView { group: THREE.Group; alert: THREE.Sprite; job: THREE.Sprite; top: number; ring: THREE.Mesh; badge: ReturnType<typeof createTag>; fill?: THREE.Mesh }

// Upgrade levels show as a glowing ring on the ground and an Mk label: cyan for Mk2, gold for Mk3.
const RING = [0x000000, 0x4fd8ff, 0xffc840];
const makeRing = (r: number) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 5, 28), new THREE.MeshBasicMaterial({ color: 0x4fd8ff }));
  m.rotation.x = Math.PI / 2; m.position.y = 0.12; m.visible = false;
  return m;
};
interface Meteor { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }

export interface BuildingView {
  id: number; type: 'habitat' | 'shelter'; x: number; z: number; r: number; inner: number;
  b: Building; blocker: Blocker; slide: number; // slide: 0 closed .. 1 open
  ring: THREE.Mesh;
}

const TOP: Record<ModuleType, number> = { habitat: 0, shelter: 0, solar: 3.6, battery: 2.6, lifeSupport: 4.2, tank: 3.2, greenhouse: 3.4 };
const isBuilding = (type: ModuleType): type is 'habitat' | 'shelter' => type === 'habitat' || type === 'shelter';

// Keeps the 3D base in step with the sim's module list. Owns buildings, doors, markers, the build ghost and meteors.
export class World {
  buildings: BuildingView[] = [];
  extraBlockers: Blocker[] = []; // things added by the intro, such as the parked lander
  markersHidden = false; // the close-up work mode hides the floating markers
  private views = new Map<number, ModuleView>();
  private ghost: THREE.Group | null = null;
  private ghostType: ModuleType | null = null;
  private ghostOk = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false });
  private ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.45, depthWrite: false });
  private meteors: Meteor[] = [];
  private meteorGeo = new THREE.IcosahedronGeometry(0.5, 0);
  private meteorMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });

  constructor(private scene: THREE.Scene, private blockers: Blocker[], private cfg: LevelConfig) {
    const rocks = createRockPile();
    const r = cfg.rockPile;
    rocks.position.set(r.x, heightAt(r.x, r.z), r.z);
    scene.add(rocks);
    this.buildOutdoors();
  }

  // Outdoor scenery from the layout data: landing pad, storage containers, path markers and conduits.
  private buildOutdoors(): void {
    const std = (c: number, e = 0, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: e, roughness: 0.7, metalness: 0.3, flatShading: true, ...o });
    const put = (m: THREE.Object3D, x: number, z: number, dy = 0) => { m.position.set(x, heightAt(x, z) + dy, z); this.scene.add(m); return m; };
    const tag = (key: TextKey, x: number, z: number, y: number, color = '#ffffff') => { const g = createTag(); g.set(t(key), color); g.sprite.position.set(x, heightAt(x, z) + y, z); g.sprite.scale.multiplyScalar(1.5); this.scene.add(g.sprite); };
    // landing pad: a flat ring with a lit edge
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(LANDER_PAD.r, LANDER_PAD.r, 0.1, 24), std(0x39404a));
    put(pad, LANDER_PAD.x, LANDER_PAD.z, 0.05);
    const padRing = new THREE.Mesh(new THREE.TorusGeometry(LANDER_PAD.r, 0.08, 6, 32), std(0xf2b632, 0xf2b632)); padRing.rotation.x = Math.PI / 2;
    put(padRing, LANDER_PAD.x, LANDER_PAD.z, 0.14);
    tag('lbl_pad', LANDER_PAD.x, LANDER_PAD.z, 3.2, '#ffd24a');
    // storage containers
    CONTAINERS.forEach((c) => {
      const cont = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.6), std(0x586a8a)); cont.castShadow = true; cont.receiveShadow = true;
      put(cont, c.x, c.z, 0.8);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 1.62), std(0xf2b632)); put(stripe, c.x, c.z, 1.2);
      this.extraBlockers.push({ x: c.x, z: c.z, r: c.r });
    });
    tag('lbl_storage', CONTAINERS[0].x, CONTAINERS[0].z, 2.6);
    tag('lbl_solarfield', MODULE_POS.solar.x, MODULE_POS.solar.z, 4.4, '#9fd0ff');
    tag('lbl_power', MODULE_POS.battery.x, MODULE_POS.battery.z, 3.4, '#ffd24a');
    tag('lbl_rocks', this.cfg.rockPile.x, this.cfg.rockPile.z, 3.2);
    // path markers: amber posts every 4 m from the station door to the pad, the shelter and the solar field
    const post = (x: number, z: number) => {
      const p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), std(0x39404a)); pole.position.y = 0.4; p.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), std(0xffb040, 0xffa020)); lamp.position.y = 0.85; p.add(lamp);
      put(p, x, z);
    };
    const path = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 4);
      for (let i = 1; i <= n; i++) { const u = (i * 4) / len; const px = x1 + (x2 - x1) * u, pz = z1 + (z2 - z1) * u; post(px - (z2 - z1) / len * 1.4, pz + (x2 - x1) / len * 1.4); }
    };
    const dz = STATION_R + 1.5;
    path(0, dz, LANDER_PAD.x - 2, LANDER_PAD.z - 3);
    path(2, dz, SHELTER_AT.x - 3, SHELTER_AT.z + 2);
    path(-2, dz - 1, MODULE_POS.solar.x + 2, MODULE_POS.solar.z + 3);
    // conduits: power (yellow) and water (blue) from the station wall to the machines, laid in short pieces that follow the ground
    const conduit = (x1: number, z1: number, x2: number, z2: number, color: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const a = new THREE.Vector3(x1 + (x2 - x1) * (i / n), 0, z1 + (z2 - z1) * (i / n)); a.y = heightAt(a.x, a.z) + 0.12;
        const b = new THREE.Vector3(x1 + (x2 - x1) * ((i + 1) / n), 0, z1 + (z2 - z1) * ((i + 1) / n)); b.y = heightAt(b.x, b.z) + 0.12;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, a.distanceTo(b) + 0.04, 6), std(color, color, { emissiveIntensity: 0.2 }));
        seg.position.copy(a).add(b).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        this.scene.add(seg);
      }
    };
    const edge = (x: number, z: number) => { const d = Math.hypot(x, z) || 1; return { x: (x / d) * (STATION_R + 0.1), z: (z / d) * (STATION_R + 0.1) }; };
    const toward = (x: number, z: number, r: number) => { const d = Math.hypot(x, z) || 1; return { x: x - (x / d) * (r + 0.3), z: z - (z / d) * (r + 0.3) }; };
    for (const [k, color] of [['solar', 0xf2c832], ['battery', 0xf2c832], ['greenhouse', 0xf2c832], ['lifeSupport', 0xf2c832], ['tank', 0x4fa8ff], ['lifeSupport', 0x4fa8ff]] as const) {
      const p = MODULE_POS[k]; const e = edge(p.x, p.z); const m = toward(p.x, p.z, k === 'solar' ? 1.8 : k === 'greenhouse' ? 2.6 : k === 'tank' ? 1.6 : k === 'lifeSupport' ? 1.5 : 1.2);
      const off = color === 0x4fa8ff ? 0.35 : 0;
      conduit(e.x + off, e.z - off, m.x + off, m.z - off, color);
    }
  }

  sync(sim: SimState): void {
    for (const m of sim.modules) {
      if (isBuilding(m.type)) {
        if (this.buildings.some((v) => v.id === m.id)) continue;
        const r = this.cfg.modules[m.type].radius;
        const b = createBuilding(m.type, r);
        b.group.position.set(m.x, heightAt(m.x, m.z), m.z);
        this.scene.add(b.group);
        const blocker: Blocker = { x: m.x, z: m.z, r, ring: { inner: r - 0.35, doorHalf: b.doorHalf, open: true } };
        const ring = makeRing(r + 0.8);
        b.group.add(ring);
        this.buildings.push({ id: m.id, type: m.type, x: m.x, z: m.z, r, inner: r - 0.35, b, blocker, slide: 1, ring });
        continue;
      }
      if (this.views.has(m.id)) continue;
      const group = createModuleModel(m.type);
      group.position.set(m.x, heightAt(m.x, m.z) - 0.05, m.z);
      const alert = createMarker('!', '#e53935');
      const job = createMarker('★', '#e0a020');
      for (const s of [alert, job]) { s.position.y = TOP[m.type]; s.visible = false; group.add(s); }
      const ring = makeRing(this.cfg.modules[m.type].radius + 0.5);
      const badge = createTag();
      badge.sprite.position.y = TOP[m.type] + 1.1; badge.sprite.visible = false;
      group.add(ring, badge.sprite);
      let fill: THREE.Mesh | undefined;
      if (m.type === 'battery' || m.type === 'tank') {
        const geo = new THREE.BoxGeometry(0.14, 1.0, 0.06); geo.translate(0, 0.5, 0);
        fill = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: m.type === 'battery' ? 0xffd24a : 0x5ad1ff, emissive: m.type === 'battery' ? 0xffd24a : 0x5ad1ff, emissiveIntensity: 0.8 }));
        fill.position.set(0, 0.35, m.type === 'battery' ? 0.64 : 0.9);
        group.add(fill);
      }
      this.scene.add(group);
      this.views.set(m.id, { group, alert, job, top: TOP[m.type], ring, badge, fill });
    }
    this.blockers.length = 0;
    for (const v of this.buildings) this.blockers.push(v.blocker);
    // Furniture and machines inside the station and the shelter are solid too, so nothing can be walked through
    for (const v of this.buildings) for (const p of (v.type === 'habitat' ? STATION_PROPS : v.type === 'shelter' ? SHELTER_PROPS : [])) this.blockers.push({ x: v.x + p.x, z: v.z + p.z, r: p.r * 0.85, playerOnly: true });
    for (const m of sim.modules) if (!isBuilding(m.type)) this.blockers.push({ x: m.x, z: m.z, r: this.cfg.modules[m.type].radius });
    this.blockers.push({ x: this.cfg.rockPile.x, z: this.cfg.rockPile.z, r: this.cfg.rockPile.radius });
    for (const b of this.extraBlockers) this.blockers.push(b);
  }

  // Which building (index) a point is inside, or -1.
  buildingAt(x: number, z: number): number {
    return this.buildings.findIndex((v) => Math.hypot(x - v.x, z - v.z) < v.inner);
  }

  // Building whose doorway the point is next to, or null.
  doorNear(x: number, z: number): BuildingView | null {
    for (const v of this.buildings) if (Math.hypot(x - v.x, z - (v.z + v.r)) < 2.6) return v;
    return null;
  }

  toggleDoor(v: BuildingView): boolean {
    v.blocker.ring!.open = !v.blocker.ring!.open;
    return v.blocker.ring!.open;
  }

  update(dt: number, sim: SimState, time: number, px: number, pz: number, crew: { x: number; z: number }[]): void {
    for (const m of sim.modules) {
      const v = this.views.get(m.id);
      if (!v) continue;
      const hasJob = !m.broken && sim.jobs.some((j) => j.moduleId === m.id);
      v.alert.visible = m.broken && !this.markersHidden;
      v.job.visible = hasJob && !this.markersHidden;
      const bob = v.top + Math.sin(time * 4) * 0.18;
      v.alert.position.y = bob; v.job.position.y = bob;
      v.group.rotation.z = m.broken ? Math.sin(time * 30) * 0.004 : 0;
      const lvl = sim.levels[m.type as 'solar'] ?? 1;
      v.ring.visible = lvl > 1; v.badge.sprite.visible = lvl > 1;
      if (lvl > 1) { (v.ring.material as THREE.MeshBasicMaterial).color.setHex(RING[lvl - 1]); v.badge.set(`Mk${lvl}`, lvl > 2 ? '#ffd24a' : '#9fe8ff'); }
    }

    // Storage you can see: gauges and crates follow the meters
    const cap = caps(sim, this.cfg);
    const airF = Math.max(0.02, sim.air / cap.air), foodF = Math.max(0.02, sim.food / cap.food), powF = Math.max(0.02, sim.power / cap.power);
    for (const v of this.buildings) {
      v.b.fills.air.forEach((m) => { m.scale.y = airF; (m.material as THREE.MeshStandardMaterial).color.setHex(airF < 0.25 ? 0xff6b5a : 0x5ad1ff); });
      v.b.fills.food.forEach((m) => { m.scale.y = foodF; (m.material as THREE.MeshStandardMaterial).color.setHex(foodF < 0.25 ? 0xff6b5a : 0x7be07b); });
      v.b.tags.air.forEach((tg) => tg.set(t('lvl_oxygen', { p: Math.round(airF * 100) }), airF < 0.25 ? '#ff8a7a' : '#9fe0ff'));
      v.b.tags.food.forEach((tg) => tg.set(t('lvl_food', { p: Math.round(foodF * 100) }), foodF < 0.25 ? '#ff8a7a' : '#9fe8b8'));
      v.b.fills.crates.forEach((m, i) => { m.visible = i < sim.parts; });
    }
    for (const m of sim.modules) {
      const v = this.views.get(m.id);
      if (v?.fill) v.fill.scale.y = m.type === 'battery' ? powF : airF;
    }
    for (const v of this.buildings) {
      // Doors open by themselves for the crew, so nobody is ever locked out in a storm.
      const dz = v.z + v.r;
      if (!v.blocker.ring!.open && crew.some((c) => Math.hypot(c.x - v.x, c.z - dz) < 2.4)) v.blocker.ring!.open = true;
      v.slide += ((v.blocker.ring!.open ? 1 : 0) - v.slide) * Math.min(1, dt * 6);
      v.b.door.position.x = v.slide * 2.5;
      const lvl = v.type === 'habitat' ? sim.levels.station : 1;
      v.ring.visible = lvl > 1;
      if (lvl > 1) (v.ring.material as THREE.MeshBasicMaterial).color.setHex(RING[lvl - 1]);

      // Cut-away: fade the roof and wall when the player is inside or close, so the interior reads.
      const d = Math.hypot(px - v.x, pz - v.z);
      const inside = d < v.inner;
      const near = d < v.r + 9;
      this.fade(v.b.roof, inside ? 0.3 : near ? 0.14 : 1, dt);
      this.fade(v.b.wall, inside ? 1 : near ? 0.38 : 1, dt);
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const me = this.meteors[i];
      me.t += dt / 0.9;
      me.mesh.position.lerpVectors(me.from, me.to, Math.min(1, me.t));
      if (me.t >= 1.15) { this.scene.remove(me.mesh); this.meteors.splice(i, 1); }
      else if (me.t >= 1) me.mesh.scale.setScalar(1 + (me.t - 1) * 30);
    }
  }

  private fade(m: THREE.MeshStandardMaterial, target: number, dt: number): void {
    m.opacity += (target - m.opacity) * Math.min(1, dt * 5);
    const solid = m.opacity > 0.97;
    if (m.depthWrite !== solid) { m.depthWrite = solid; m.needsUpdate = true; }
  }

  // Briefly pops a module, as feedback when a task on it finishes.
  pulse(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.group.scale.setScalar(1.12);
    setTimeout(() => v.group.scale.setScalar(1), 180);
  }

  // Upgrade animation: every machine of this kind (or the station) swells and settles.
  pulseType(sim: SimState, type: string): void {
    for (const m of sim.modules) if (m.type === type) {
      const v = this.views.get(m.id);
      if (v) { v.group.scale.setScalar(1.3); setTimeout(() => v.group.scale.setScalar(1.05), 220); setTimeout(() => v.group.scale.setScalar(1), 440); }
      const b = this.buildings.find((x) => x.id === m.id);
      if (b) { b.ring.scale.setScalar(1.25); setTimeout(() => b.ring.scale.setScalar(1), 400); }
    }
  }

  setGhost(type: ModuleType | null, x = 0, z = 0, ok = true): void {
    if (type !== this.ghostType) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostType = type;
      if (type) {
        this.ghost = createModuleModel(type);
        this.ghost.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
        this.scene.add(this.ghost);
      }
    }
    if (!this.ghost) return;
    this.ghost.position.set(x, heightAt(x, z), z);
    const m = ok ? this.ghostOk : this.ghostBad;
    this.ghost.traverse((o) => { if (o instanceof THREE.Mesh) o.material = m; });
  }

  meteorAt(x: number, z: number): void {
    const to = new THREE.Vector3(x, heightAt(x, z) + 1, z);
    const from = to.clone().add(new THREE.Vector3(30, 55, -20));
    const mesh = new THREE.Mesh(this.meteorGeo, this.meteorMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.meteors.push({ mesh, from, to, t: 0 });
  }
}
