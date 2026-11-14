import * as THREE from 'three';
import type { LevelConfig, ModuleType, SimState } from '../sim/sim.ts';
import { createModuleModel, createRockPile } from '../render/models';
import { createBuilding, createMarker, createTag, type Building } from '../render/building';
import { heightAt } from '../render/terrain';
import type { Blocker } from './collide';

interface ModuleView { group: THREE.Group; alert: THREE.Sprite; job: THREE.Sprite; top: number; ring: THREE.Mesh; badge: ReturnType<typeof createTag> }

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
      this.scene.add(group);
      this.views.set(m.id, { group, alert, job, top: TOP[m.type], ring, badge });
    }
    this.blockers.length = 0;
    for (const v of this.buildings) this.blockers.push(v.blocker);
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
