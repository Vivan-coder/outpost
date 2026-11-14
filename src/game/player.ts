import * as THREE from 'three';
import type { InputState } from './input';
import { heightAt, TERRAIN_SIZE } from '../render/terrain';

const EYE = 1.7;
const SPEED = 4.2;
const MOON_G = 1.62; // m/s^2, lunar surface gravity
const JUMP_V = 2.6;
const BOUND = TERRAIN_SIZE / 2 - 4;

export interface Blocker { x: number; z: number; r: number }

export class Player {
  pos = new THREE.Vector3(0, 0, 14);
  yaw = 0;
  pitch = 0;
  private vy = 0;
  private grounded = true;
  private bob = 0;

  constructor(private camera: THREE.PerspectiveCamera, private blockers: Blocker[]) {
    this.pos.y = heightAt(this.pos.x, this.pos.z);
  }

  update(dt: number, input: InputState): void {
    this.yaw += input.lookDX;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + input.lookDY));

    let mx = input.moveX, my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let nx = this.pos.x + (mx * cos - my * sin) * SPEED * dt;
    let nz = this.pos.z + (-mx * sin - my * cos) * SPEED * dt;

    for (const b of this.blockers) {
      const dx = nx - b.x, dz = nz - b.z, d = Math.hypot(dx, dz), min = b.r + 0.5;
      if (d < min && d > 1e-4) { nx = b.x + (dx / d) * min; nz = b.z + (dz / d) * min; }
    }
    this.pos.x = Math.max(-BOUND, Math.min(BOUND, nx));
    this.pos.z = Math.max(-BOUND, Math.min(BOUND, nz));

    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.grounded && input.jump) { this.vy = JUMP_V; this.grounded = false; }
    if (this.grounded) {
      this.pos.y = ground;
    } else {
      this.vy -= MOON_G * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.grounded = true; }
    }

    if (this.grounded && len > 0.05) this.bob += dt * 7 * Math.min(1, len);
    const bobY = Math.sin(this.bob) * 0.04;

    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
