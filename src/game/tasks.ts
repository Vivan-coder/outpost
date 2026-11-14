// Hands-on tasks: hold to start (progress ring), then a short mini-step that depends on the task.
// Pure game logic: no DOM, no three.js. The UI draws from the public fields.

import type { MiniType, TaskId } from '../sim/sim.ts';

export type TaskKind = 'repair' | TaskId;
export type { MiniType };
export type TaskResult = 'done' | 'failed' | 'moved' | 'storm';

export interface TaskTarget { kind: TaskKind; mini: MiniType; moduleId: number; jobId: number | null; x: number; z: number; reach: number }

export const HOLD_SECONDS = 1.2;
const SEQ_LENGTH = 3;
const GAUGE_NEED = 4, GAUGE_LIMIT = 14;
export const GAUGE_ZONE: [number, number] = [0.52, 0.8];
const WIPE_NEED = 5; // radians of look movement in total

export class TaskRunner {
  stage: 'idle' | 'hold' | 'mini' = 'idle';
  target: TaskTarget | null = null;
  hold = 0; // 0..1 ring
  mini: MiniType = 'sequence';
  progress = 0; // 0..1 of the mini-step
  // sequence
  order: number[] = [];
  index = 0;
  mistakes = 0;
  flash = 0; // > 0 just after a wrong press
  // gauge
  level = 0.2;
  private timer = 0;
  private wipeDir = 0;
  strokes = 0;
  speed = 1; // engineering upgrades make this larger: shorter holds and mini-steps

  get active(): boolean { return this.stage !== 'idle'; }

  private reset(): void { this.stage = 'idle'; this.target = null; this.hold = 0; this.progress = 0; }

  cancel(reason: TaskResult): TaskResult | null {
    if (!this.active) return null;
    const hadMini = this.stage === 'mini';
    this.reset();
    return hadMini ? reason : null;
  }

  // Called every frame. `target` is what the player is aiming at while idle or holding.
  update(dt: number, holding: boolean, lookDX: number, target: TaskTarget | null, px: number, pz: number): TaskResult | null {
    this.flash = Math.max(0, this.flash - dt);
    if (this.stage === 'idle' || this.stage === 'hold') {
      if (!target) { this.reset(); return null; }
      if (!this.target || this.target.moduleId !== target.moduleId || this.target.kind !== target.kind) { this.hold = 0; }
      this.target = target;
      this.hold = Math.max(0, Math.min(1, this.hold + (holding ? (dt * this.speed) / HOLD_SECONDS : -dt * 1.5)));
      this.stage = this.hold > 0 ? 'hold' : 'idle';
      if (this.hold >= 1) this.startMini();
      return null;
    }

    const tg = this.target!;
    if (Math.hypot(px - tg.x, pz - tg.z) > tg.reach + 1.5) return this.cancel('moved');

    this.timer += dt;
    if (this.mini === 'gauge') {
      this.level = Math.max(0, Math.min(1, this.level + (holding ? 0.5 : -0.42) * dt));
      if (this.level >= GAUGE_ZONE[0] && this.level <= GAUGE_ZONE[1]) this.progress += (dt * this.speed) / GAUGE_NEED;
      if (this.timer > GAUGE_LIMIT && this.progress < 1) { this.reset(); return 'failed'; }
    } else if (this.mini === 'wipe') {
      const amount = Math.min(Math.abs(lookDX), 0.25);
      this.progress += (amount * this.speed) / WIPE_NEED;
      const dir = Math.sign(lookDX);
      if (dir !== 0 && dir !== this.wipeDir && amount > 0.004) { this.wipeDir = dir; this.strokes++; }
    }
    if (this.progress >= 1) { this.reset(); return 'done'; }
    return null;
  }

  private startMini(): void {
    this.stage = 'mini';
    this.mini = this.target!.mini;
    this.progress = 0; this.timer = 0; this.mistakes = 0; this.index = 0; this.level = 0.2; this.strokes = 0; this.wipeDir = 0;
    this.order = Array.from({ length: SEQ_LENGTH }, () => 1 + Math.floor(Math.random() * 3));
    for (let i = 1; i < this.order.length; i++) if (this.order[i] === this.order[i - 1]) this.order[i] = (this.order[i] % 3) + 1;
  }

  // Sequence mini-step: the player pressed button n (1..3). Returns a result when it ends.
  press(n: number): TaskResult | 'ok' | 'wrong' | null {
    if (this.stage !== 'mini' || this.mini !== 'sequence') return null;
    if (n === this.order[this.index]) {
      this.index++;
      this.progress = this.index / this.order.length;
      if (this.index >= this.order.length) { this.reset(); return 'done'; }
      return 'ok';
    }
    this.mistakes++;
    this.index = 0; this.progress = 0; this.flash = 0.4;
    if (this.mistakes >= 3) { this.reset(); return 'failed'; }
    return 'wrong';
  }
}
