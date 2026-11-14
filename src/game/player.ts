import * as THREE from 'three';
import type { InputState } from './input';
import { heightAt, TERRAIN_SIZE } from '../render/terrain';
import { resolve, type Blocker } from './collide';

export type { Blocker };

const EYE = 1.7;
const SPEED = 4.2;
const SPRINT = 1.6;
const MOON_G = 1.62; // m/s^2, lunar surface gravity
const JUMP_V = 2.6;
const BOUND = TERRAIN_SIZE / 2 - 4;

export class Player {
  gravity = MOON_G; // Mars sets this to 3.73
  pos = new THREE.Vector3(0, 0, 22);
  yaw = 0;
  pitch = 0;
  private vy = 0;
  private grounded = true;
  private bob = 0;

  constructor(private camera: THREE.PerspectiveCamera, private blockers: Blocker[]) {
    this.pos.y = heightAt(this.pos.x, this.pos.z);
  }

  update(dt: number, input: InputState, sprint = false): void {
    this.yaw += input.lookDX;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + input.lookDY));

    let mx = input.moveX, my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    // On touch there is no sprint key: pushing the stick all the way runs.
    const speed = SPEED * (sprint || (input.isTouch && len > 0.95) ? SPRINT : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const nx = this.pos.x + (mx * cos - my * sin) * speed * dt;
    const nz = this.pos.z + (-mx * sin - my * cos) * speed * dt;
    const r = resolve(this.blockers, this.pos.x, this.pos.z, nx, nz, 0.45);
    this.pos.x = Math.max(-BOUND, Math.min(BOUND, r.x));
    this.pos.z = Math.max(-BOUND, Math.min(BOUND, r.z));

    const ground = heightAt(this.pos.x, this.pos.z);
    if (this.grounded && input.jump) { this.vy = JUMP_V; this.grounded = false; }
    if (this.grounded) {
      this.pos.y = ground;
    } else {
      this.vy -= this.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.grounded = true; }
    }

    if (this.grounded && len > 0.05) this.bob += dt * 7 * Math.min(1, len);
    this.camera.position.set(this.pos.x, this.pos.y + EYE + Math.sin(this.bob) * 0.04, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
