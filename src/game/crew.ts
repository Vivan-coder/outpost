import * as THREE from 'three';
import type { LevelConfig, SimState } from '../sim/sim.ts';
import { createAstronaut, createLabel, type Astronaut } from '../render/models';
import { heightAt } from '../render/terrain';
import type { Blocker } from './player';

export type CrewPhase = 'idle' | 'walking' | 'working' | 'waiting' | 'sheltered' | 'noModule';

interface Member { model: Astronaut; x: number; z: number; facing: number; phase: CrewPhase; anim: number; idleX: number; idleZ: number }

const SPEED = 3.2;
const SUITS = [0xff8a3d, 0x4fc3e8, 0xc77dff];

// Walks each crew member to their chore, the shelter or their rest spot, and tells the sim when they arrive.
export class Crew {
  members: Member[] = [];

  constructor(scene: THREE.Scene, sim: SimState, private cfg: LevelConfig, private blockers: Blocker[]) {
    sim.crew.forEach((c, i) => {
      const model = createAstronaut(SUITS[i % SUITS.length]);
      const label = createLabel(c.name);
      label.position.y = 2.45;
      model.group.add(label);
      const idleX = (i - 1) * 2.6, idleZ = 8.5 + (i % 2) * 1.5;
      model.group.position.set(idleX, heightAt(idleX, idleZ), idleZ);
      scene.add(model.group);
      this.members.push({ model, x: idleX, z: idleZ, facing: 0, phase: 'idle', anim: i, idleX, idleZ });
    });
  }

  update(dt: number, sim: SimState): void {
    this.members.forEach((m, i) => {
      const c = sim.crew[i];
      let tx = m.idleX, tz = m.idleZ, stopAt = 0.3;
      let onArrive: CrewPhase = 'idle';
      let targetBroken = false;

      if (sim.shelterCall) {
        tx = 0; tz = 0; stopAt = this.cfg.modules.habitat.radius + 1.0; onArrive = 'sheltered';
      } else if (c.chore) {
        const def = this.cfg.chores.find((ch) => ch.id === c.chore)!;
        if (def.at === 'rockPile') {
          tx = this.cfg.rockPile.x; tz = this.cfg.rockPile.z; stopAt = this.cfg.rockPile.radius + 1.0; onArrive = 'working';
        } else {
          // Prefer a working module, nearest first; fall back to a broken one and wait beside it.
          let best = null as null | { id: number; x: number; z: number; broken: boolean };
          let bestScore = Infinity;
          for (const mod of sim.modules) {
            if (mod.type !== def.at) continue;
            const score = Math.hypot(mod.x - m.x, mod.z - m.z) + (mod.broken ? 1000 : 0) + (mod.id === c.moduleId ? -5 : 0);
            if (score < bestScore) { bestScore = score; best = mod; }
          }
          if (best) {
            c.moduleId = best.id;
            tx = best.x; tz = best.z; stopAt = this.cfg.modules[def.at].radius + 1.0;
            targetBroken = best.broken;
            onArrive = targetBroken ? 'waiting' : 'working';
          } else {
            onArrive = 'noModule';
          }
        }
      }

      const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
      if (d > stopAt) {
        m.phase = 'walking';
        let nx = m.x + (dx / d) * SPEED * dt, nz = m.z + (dz / d) * SPEED * dt;
        for (const b of this.blockers) {
          const bx = nx - b.x, bz = nz - b.z, bd = Math.hypot(bx, bz), min = b.r + 0.6;
          if (bd < min && bd > 1e-4) {
            // Slide around the obstacle instead of stopping against it.
            nx = b.x + (bx / bd) * min - (bz / bd) * SPEED * dt * 0.6;
            nz = b.z + (bz / bd) * min + (bx / bd) * SPEED * dt * 0.6;
          }
        }
        m.facing = Math.atan2(nx - m.x, nz - m.z);
        m.x = nx; m.z = nz;
      } else {
        m.phase = onArrive;
        if (d > 0.01 && onArrive !== 'idle') m.facing = Math.atan2(dx, dz);
      }

      c.working = m.phase === 'working';
      c.sheltered = m.phase === 'sheltered';

      // Animation
      const g = m.model;
      g.group.visible = m.phase !== 'sheltered';
      g.group.position.set(m.x, heightAt(m.x, m.z), m.z);
      g.group.rotation.y = m.facing;
      m.anim += dt;
      if (m.phase === 'walking') {
        const s = Math.sin(m.anim * 9) * 0.7;
        g.legL.rotation.x = s; g.legR.rotation.x = -s; g.armL.rotation.x = -s * 0.7; g.armR.rotation.x = s * 0.7;
        g.group.position.y += Math.abs(Math.sin(m.anim * 9)) * 0.06;
      } else if (m.phase === 'working') {
        const s = Math.sin(m.anim * 7);
        g.legL.rotation.x = 0; g.legR.rotation.x = 0;
        g.armL.rotation.x = -1.6 + s * 0.5; g.armR.rotation.x = -1.6 - s * 0.5;
      } else {
        const s = Math.sin(m.anim * 2) * 0.06;
        g.legL.rotation.x = 0; g.legR.rotation.x = 0; g.armL.rotation.x = s; g.armR.rotation.x = -s;
      }
    });
  }
}
