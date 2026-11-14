import * as THREE from 'three';
import type { LevelConfig, ModuleType, SimState } from '../sim/sim.ts';
import { createAlert, createModuleModel, createRockPile } from '../render/models';
import { heightAt } from '../render/terrain';
import type { Blocker } from './player';

interface ModuleView { group: THREE.Group; alert: THREE.Sprite; top: number }
interface Meteor { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }

const TOP: Record<ModuleType, number> = { habitat: 8.4, solar: 3.6, battery: 2.6, lifeSupport: 4.2, tank: 3.2, greenhouse: 3.4 };

// Keeps the 3D modules in step with the sim's module list, and owns the build ghost and meteors.
export class World {
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
      if (this.views.has(m.id)) continue;
      const group = createModuleModel(m.type);
      group.position.set(m.x, heightAt(m.x, m.z) - 0.05, m.z);
      const alert = createAlert();
      alert.position.y = TOP[m.type];
      alert.visible = false;
      group.add(alert);
      this.scene.add(group);
      this.views.set(m.id, { group, alert, top: TOP[m.type] });
    }
    this.blockers.length = 0;
    for (const m of sim.modules) this.blockers.push({ x: m.x, z: m.z, r: this.cfg.modules[m.type].radius });
    this.blockers.push({ x: this.cfg.rockPile.x, z: this.cfg.rockPile.z, r: this.cfg.rockPile.radius });
  }

  update(dt: number, sim: SimState, time: number): void {
    for (const m of sim.modules) {
      const v = this.views.get(m.id);
      if (!v) continue;
      v.alert.visible = m.broken;
      if (m.broken) {
        v.alert.position.y = v.top + Math.sin(time * 5) * 0.2;
        v.group.rotation.z = Math.sin(time * 30) * 0.004;
      } else {
        v.group.rotation.z = 0;
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const me = this.meteors[i];
      me.t += dt / 0.9;
      me.mesh.position.lerpVectors(me.from, me.to, Math.min(1, me.t));
      if (me.t >= 1.15) { this.scene.remove(me.mesh); this.meteors.splice(i, 1); }
      else if (me.t >= 1) me.mesh.scale.setScalar(1 + (me.t - 1) * 30);
    }
  }

  // Nearest broken module the player is close to and roughly facing.
  fixTarget(sim: SimState, px: number, pz: number, yaw: number): number | null {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best: number | null = null, bestD = Infinity;
    for (const m of sim.modules) {
      if (!m.broken) continue;
      const dx = m.x - px, dz = m.z - pz, d = Math.hypot(dx, dz);
      const reach = this.cfg.modules[m.type].radius + 3.5;
      if (d > reach) continue;
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (facing < 0.1 && d > this.cfg.modules[m.type].radius + 1.5) continue;
      if (d < bestD) { bestD = d; best = m.id; }
    }
    return best;
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

  modulePos(sim: SimState, id: number): { x: number; z: number } | null {
    const m = sim.modules.find((mod) => mod.id === id);
    return m ? { x: m.x, z: m.z } : null;
  }
}
