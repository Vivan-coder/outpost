import * as THREE from 'three';
import type { LevelConfig, SimState, TaskId } from '../sim/sim.ts';
import { createAstronaut, type Astronaut } from '../render/models';
import { createTag, createBubble } from '../render/building';
import { heightAt } from '../render/terrain';
import { resolve, type Blocker } from './collide';
import { STATION, TASK_SPOT } from './layout';
import type { World } from './world';
import { t, type TextKey } from '../i18n/en';

export type Activity = 'walking' | 'running' | 'watering' | 'wiping' | 'carrying' | 'tablet' | 'break' | 'sheltering' | 'waiting' | 'greeting' | 'exercising' | 'window';

interface Stop { key: string; x: number; z: number; reach: number; inside: number; act: Activity; moduleId: number | null }
interface Member {
  model: Astronaut; crate: THREE.Mesh; tag: ReturnType<typeof createTag>;
  x: number; z: number; facing: number; anim: number;
  activity: Activity;
  goalKey: string; path: { x: number; z: number }[]; stop: Stop | null; arrived: boolean;
  bubble: ReturnType<typeof createBubble>; sayUntil: number;
  routineIndex: number; dwell: number; greet: number; greetCooldown: number; startedInside: boolean;
}

const SPEED = 2.6;
const SUITS = [0xff8a3d, 0x4fc3e8, 0xc77dff];
// By default the crew relax inside the station: they only go outside when sent.
const ROUTINE = ['galley', 'tablet', 'exercise', 'window'] as const;
// What a crew member looks like while doing each task.
const TASK_ACT: Record<TaskId, Activity> = {
  o2gen: 'tablet', water: 'carrying', co2: 'carrying', thermal: 'tablet', solar: 'wiping', greenhouse: 'watering',
  exercise: 'exercising', medical: 'tablet', radmon: 'tablet', comms: 'tablet', regolith: 'carrying', supplies: 'carrying',
};

// Crew live in the habitat: they sit in the galley, read a tablet, work out and look out of the window.
// The player sends them to a task from the crew menu; they walk there, do it for its full time, then return.
export class Crew {
  members: Member[] = [];

  constructor(scene: THREE.Scene, sim: SimState, private cfg: LevelConfig, private blockers: Blocker[], private world: World) {
    const hab = world.buildings.find((b) => b.type === 'habitat');
    sim.crew.forEach((_, i) => {
      const model = createAstronaut(SUITS[i % SUITS.length]);
      const tag = createTag();
      tag.sprite.position.y = 2.5;
      model.group.add(tag.sprite);
      const bubble = createBubble();
      bubble.sprite.position.y = 3.35; bubble.sprite.visible = false;
      model.group.add(bubble.sprite);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xb58a4a, flatShading: true }));
      crate.position.set(0, 1.1, 0.5); crate.visible = false;
      model.group.add(crate);
      const x = hab ? hab.x - 1.6 + i * 1.6 : i * 2, z = hab ? hab.z + 0.5 : 8;
      scene.add(model.group);
      this.members.push({
        model, crate, tag, bubble, sayUntil: 0, x, z, facing: 0, anim: i * 1.7, activity: 'walking',
        goalKey: '', path: [], stop: null, arrived: false,
        routineIndex: i % ROUTINE.length, dwell: 0, greet: 0, greetCooldown: 4 + i * 3, startedInside: true,
      });
    });
  }

  positions(): { x: number; z: number }[] { return this.members; }

  // Speech bubble above a crew member's head.
  say(i: number, text: string, seconds: number, now: number): void {
    const m = this.members[i];
    m.bubble.set(text);
    m.bubble.sprite.visible = true;
    m.sayUntil = now + seconds;
  }

  tickSpeech(now: number): void {
    for (const m of this.members) if (m.bubble.sprite.visible && now > m.sayUntil) m.bubble.sprite.visible = false;
  }

  safeCount(sim: SimState): number { return sim.crew.filter((c) => c.sheltered).length; }

  private moduleStop(sim: SimState, type: string, act: Activity, m: Member, key: string): Stop | null {
    let best = null as null | { id: number; x: number; z: number }, bestScore = Infinity;
    for (const mod of sim.modules) {
      if (mod.type !== type) continue;
      const score = Math.hypot(mod.x - m.x, mod.z - m.z) + (mod.broken ? 1000 : 0);
      if (score < bestScore) { bestScore = score; best = mod; }
    }
    if (!best) return null;
    return { key: `${key}:${best.id}`, x: best.x, z: best.z, reach: this.cfg.modules[type as 'solar'].radius + 1.0, inside: -1, act, moduleId: best.id };
  }

  // A standing spot inside a building.
  private inside(type: 'habitat' | 'shelter', rel: { x: number; z: number }, key: string, act: Activity, reach = 0.35): Stop | null {
    const idx = this.world.buildings.findIndex((b) => b.type === type);
    if (idx < 0) return null;
    const b = this.world.buildings[idx];
    return { key, x: b.x + rel.x, z: b.z + rel.z, reach, inside: idx, act, moduleId: null };
  }

  private stopFor(sim: SimState, name: string, i: number, m: Member): Stop | null {
    switch (name) {
      case 'galley': {
        const a = 0.6 + i * 2.1; // seats around the table
        return this.inside('habitat', { x: STATION.canteen.x + Math.sin(a) * 1.3, z: STATION.canteen.z + Math.cos(a) * 1.3 }, name, 'break');
      }
      case 'tablet': return this.inside('habitat', { x: STATION.control.x + 1.3 * (i - 1) + 0.6, z: STATION.control.z + 1.4 }, name, 'tablet');
      case 'exercise': return this.inside('habitat', TASK_SPOT.exercise, name, 'exercising');
      case 'window': return this.inside('habitat', { x: STATION.window.x + (i - 1) * 1.2, z: STATION.window.z }, name, 'window');
      case 'shelter': {
        const idx = this.world.buildings.findIndex((b) => b.type === 'shelter');
        if (idx < 0) return null;
        const b = this.world.buildings[idx];
        return { key: name, x: b.x + (i - 1) * 1.7, z: b.z - 1.5 - (i === 1 ? 0.6 : 0), reach: 0.35, inside: idx, act: 'sheltering', moduleId: null };
      }
    }
    // Otherwise it is a task id.
    const task = this.cfg.tasks.find((tk) => tk.id === name);
    if (!task) return null;
    const act = TASK_ACT[task.id];
    if (task.at === 'rockPile') {
      const r = this.cfg.rockPile;
      return { key: name, x: r.x, z: r.z, reach: r.radius + 1.0, inside: -1, act, moduleId: null };
    }
    if (task.at === 'habitat') return this.inside('habitat', TASK_SPOT[task.id], name, act);
    if (task.at === 'shelter') return this.inside('shelter', TASK_SPOT[task.id], name, act);
    return this.moduleStop(sim, task.at, act, m, name);
  }

  // Route through doorways: leave the building we are in, then enter the one we want.
  private route(m: Member, stop: Stop): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = [];
    const cur = this.world.buildingAt(m.x, m.z);
    const doorOut = (i: number) => ({ x: this.world.buildings[i].x, z: this.world.buildings[i].z + this.world.buildings[i].r + 1.3 });
    const doorIn = (i: number) => ({ x: this.world.buildings[i].x, z: this.world.buildings[i].z + this.world.buildings[i].r - 1.5 });
    if (cur >= 0 && cur !== stop.inside) pts.push(doorIn(cur), doorOut(cur));
    if (stop.inside >= 0 && cur !== stop.inside) pts.push(doorOut(stop.inside), doorIn(stop.inside));
    pts.push({ x: stop.x, z: stop.z });
    return pts;
  }

  update(dt: number, sim: SimState, px: number, pz: number): void {
    const storm = sim.storm?.phase === 'active';
    this.members.forEach((m, i) => {
      const c = sim.crew[i];
      m.greetCooldown -= dt;

      // What should this crew member be doing right now?
      let stop: Stop | null;
      const mode = sim.shelterCall ? 'shelter' : c.chore ? 'chore' : 'routine';
      if (mode === 'shelter') stop = this.stopFor(sim, 'shelter', i, m);
      else if (mode === 'chore') stop = this.stopFor(sim, c.chore!, i, m);
      else {
        stop = this.stopFor(sim, ROUTINE[m.routineIndex], i, m);
        if (!stop) { m.routineIndex = (m.routineIndex + 1) % ROUTINE.length; stop = this.stopFor(sim, 'window', i, m); }
      }
      const key = stop ? `${mode}:${stop.key}` : `${mode}:none`;
      if (key !== m.goalKey) {
        m.goalKey = key; m.stop = stop; m.arrived = false; m.dwell = 0;
        m.path = stop ? this.route(m, stop) : [];
      }

      // Stop and wave when the player walks up, unless there is a storm or a task to do.
      const dPlayer = Math.hypot(px - m.x, pz - m.z);
      if (mode === 'routine' && !sim.storm && dPlayer < 3 && m.greetCooldown <= 0 && m.greet <= 0) { m.greet = 2.6; m.greetCooldown = 18; }

      let moving = false;
      if (m.greet > 0) {
        m.greet -= dt;
        m.facing = Math.atan2(px - m.x, pz - m.z);
      } else if (m.stop && !m.arrived) {
        const last = m.path.length === 1;
        const tgt = m.path[0];
        const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz);
        if (d <= (last ? m.stop.reach : 0.5)) {
          if (last) m.arrived = true; else m.path.shift();
        } else {
          moving = true;
          const speed = SPEED * (mode === 'shelter' ? 1.7 : 1);
          const ux = dx / d, uz = dz / d;
          const r = resolve(this.blockers, m.x, m.z, m.x + ux * speed * dt, m.z + uz * speed * dt, 0.5, true);
          let nx = r.x, nz = r.z;
          if (r.hit) {
            // Slide around the obstacle, on the side that leads towards the target.
            const ox = nx - r.hit.x, oz = nz - r.hit.z, ol = Math.hypot(ox, oz) || 1;
            let tx = -oz / ol, tz = ox / ol;
            if (tx * ux + tz * uz < 0) { tx = -tx; tz = -tz; }
            const s = resolve(this.blockers, nx, nz, nx + tx * speed * dt, nz + tz * speed * dt, 0.5, true);
            nx = s.x; nz = s.z;
          }
          if (Math.hypot(nx - m.x, nz - m.z) > 1e-4) m.facing = Math.atan2(nx - m.x, nz - m.z);
          m.x = nx; m.z = nz;
        }
      }

      // Keep crew from standing inside each other or the player.
      for (const o of this.members) {
        if (o === m) continue;
        const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz);
        if (d < 0.9 && d > 1e-4 && moving) { m.x += (dx / d) * (0.9 - d) * 0.5; m.z += (dz / d) * (0.9 - d) * 0.5; }
      }
      if (dPlayer < 0.8 && dPlayer > 1e-4) { m.x += ((m.x - px) / dPlayer) * (0.8 - dPlayer); m.z += ((m.z - pz) / dPlayer) * (0.8 - dPlayer); }

      // Arrival: do the activity, then move on with the routine.
      const targetBroken = !!m.stop && m.stop.moduleId !== null && !!sim.modules.find((mod) => mod.id === m.stop!.moduleId)?.broken;
      if (m.greet > 0) m.activity = 'greeting';
      else if (moving) m.activity = mode === 'shelter' ? 'running' : 'walking';
      else if (m.arrived && m.stop) {
        m.activity = mode === 'chore' && targetBroken ? 'waiting' : m.stop.act;
        if (m.stop.moduleId !== null) m.facing = Math.atan2(m.stop.x - m.x, m.stop.z - m.z);
        else if (m.stop.act === 'window' || m.stop.act === 'tablet') m.facing = Math.PI; // face the back wall
        if (mode === 'routine') {
          m.dwell += dt;
          if (m.dwell > 10 + i * 2) { m.routineIndex = (m.routineIndex + 1) % ROUTINE.length; m.goalKey = ''; }
        }
      } else m.activity = 'waiting';

      c.working = mode === 'chore' && m.arrived && !targetBroken;
      // Safe only once actually inside the shelter walls.
      const shelterIdx = this.world.buildings.findIndex((b) => b.type === 'shelter');
      c.sheltered = sim.shelterCall && shelterIdx >= 0 && this.world.buildingAt(m.x, m.z) === shelterIdx;

      this.animate(m, dt, storm);
      // Keep name tags and speech bubbles a readable size, near or far.
      const k = Math.max(0.4, Math.min(1.3, dPlayer * 0.14));
      m.tag.sprite.scale.set(2.6 * k, 0.49 * k, 1);
      m.bubble.sprite.scale.set(4.6 * k, 1.34 * k, 1);
      const near = dPlayer < 14;
      m.tag.set(near ? `${c.name} · ${t(`act_${m.activity}` as TextKey)}` : c.name);
    });
  }

  private animate(m: Member, dt: number, storm: boolean): void {
    const g = m.model;
    m.anim += dt;
    let y = heightAt(m.x, m.z);
    let legL = 0, legR = 0, aLx = 0, aRx = 0, aLz = 0, aRz = 0;
    const s = Math.sin(m.anim * 2) * 0.06;
    switch (m.activity) {
      case 'walking': case 'running': {
        const k = m.activity === 'running' ? 13 : 9;
        const w = Math.sin(m.anim * k) * 0.7;
        legL = w; legR = -w; aLx = -w * 0.7; aRx = w * 0.7;
        y += Math.abs(Math.sin(m.anim * k)) * 0.06;
        break;
      }
      case 'watering': aRx = -1.1 + Math.sin(m.anim * 3) * 0.25; aLx = s; break;
      case 'wiping': aLx = -1.4; aRx = -1.4; aLz = -Math.sin(m.anim * 5) * 0.5; aRz = -Math.sin(m.anim * 5) * 0.5; break;
      case 'carrying': aLx = -1.15; aRx = -1.15; y += Math.abs(Math.sin(m.anim * 2)) * 0.04; break;
      case 'tablet': aLx = -0.95; aRx = -0.8 + Math.sin(m.anim * 6) * 0.08; break;
      case 'exercising': {
        const p = Math.sin(m.anim * 4);
        legL = p * 0.8; legR = -p * 0.8; aLx = -p * 0.9; aRx = p * 0.9;
        y += Math.abs(p) * 0.05;
        break;
      }
      case 'window': aLx = s; aRx = -s; break;
      case 'break': case 'sheltering': legL = -1.5; legR = -1.5; y -= 0.4; aLx = -0.4 + s; aRx = -0.4 - s; break;
      case 'greeting': aRz = 2.5 + Math.sin(m.anim * 9) * 0.35; aLx = s; break;
      default: aLx = s; aRx = -s; if (storm) aLx = -2.6;
    }
    g.legL.rotation.x = legL; g.legR.rotation.x = legR;
    g.armL.rotation.set(aLx, 0, aLz); g.armR.rotation.set(aRx, 0, aRz);
    m.crate.visible = m.activity === 'carrying';
    g.group.position.set(m.x, y, m.z);
    g.group.rotation.y = m.facing;
  }
}
