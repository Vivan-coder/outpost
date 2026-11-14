import * as THREE from 'three';

// Cutscene engine: a cutscene is a list of shots (data). Each shot has a camera move, a duration, a caption,
// badges for the data it shows, an optional big overlay and a named action for the 3D stage to animate.
// Built in Three.js from primitives, drawn on the game canvas. No video files, no network.
// The game clock is paused by the caller while a cutscene runs.
type V3 = [number, number, number];

export interface ShotBadge { kind: 'real' | 'arch' | 'game' | 'live'; text: string; url?: string }
export type ShotOverlay =
  | { type: 'flare'; cls: string; label: string; time: string }
  | { type: 'number'; value: string; unit: string; label: string };

export interface Shot {
  dur: number; // seconds, 1.5 to 4
  from: V3; to: V3; // camera position at the start and at the end
  lookFrom: V3; lookTo: V3;
  caption: string; // at most about 12 words
  badges: ShotBadge[];
  act: string; // what the stage animates in this shot
  overlay?: ShotOverlay;
  sound?: 'hiss' | 'thud' | 'alarm' | 'click';
}

export interface Stage {
  scene: THREE.Scene;
  update(act: string, u: number, time: number): void;
  dispose(): void;
}

const ease = (u: number) => u * u * (3 - 2 * u);
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export interface CutsceneDeps {
  camera: THREE.PerspectiveCamera;
  root: HTMLElement; // #cineUi
  reduceMotion: boolean;
  skipLabel: string;
  fx: { hiss(): void; thud(): void; alarm(): void; click(): void };
  onEnd(): void;
}

export const MAX_CUTSCENE_SECONDS_PER_DAY = 25;
export const shotsLength = (shots: Shot[]): number => shots.reduce((n, s) => n + s.dur, 0);

export class CutscenePlayer {
  readonly scene: THREE.Scene;
  elapsed = 0;
  done = false;
  private index = -1;
  private t = 0;
  private time = 0;
  private cap: HTMLElement;
  private badges: HTMLElement;
  private over: HTMLElement;
  private fov: number;

  constructor(private stage: Stage, private shots: Shot[], private d: CutsceneDeps) {
    this.scene = stage.scene;
    this.fov = d.camera.fov;
    d.camera.fov = 55; d.camera.updateProjectionMatrix();
    d.root.replaceChildren();
    const bars = (c: string) => { const b = document.createElement('div'); b.className = `bar ${c}`; return b; };
    this.cap = document.createElement('div'); this.cap.className = 'cineCap';
    this.badges = document.createElement('div'); this.badges.className = 'cineBadges';
    this.over = document.createElement('div'); this.over.className = 'cineOver';
    const skip = document.createElement('button'); skip.className = 'cineSkip'; skip.textContent = d.skipLabel;
    skip.addEventListener('click', () => this.finish());
    d.root.append(bars('top'), bars('bottom'), this.over, this.cap, this.badges, skip);
    document.body.classList.add('cine');
    this.enter(0);
  }

  private enter(i: number): void {
    this.index = i; this.t = 0;
    const s = this.shots[i];
    this.cap.textContent = s.caption;
    this.cap.classList.remove('on'); void this.cap.offsetWidth; this.cap.classList.add('on');
    this.badges.replaceChildren();
    for (const b of s.badges) {
      const node = document.createElement(b.url ? 'a' : 'span');
      node.className = `badge ${b.kind}`; node.textContent = b.text;
      if (b.url) { (node as HTMLAnchorElement).href = b.url; (node as HTMLAnchorElement).target = '_blank'; (node as HTMLAnchorElement).rel = 'noopener noreferrer'; }
      this.badges.appendChild(node);
    }
    this.over.replaceChildren();
    if (s.overlay?.type === 'flare') {
      const o = s.overlay;
      const bar = document.createElement('div'); bar.className = 'scale';
      for (const letter of ['C', 'M', 'X']) { const seg = document.createElement('i'); seg.textContent = letter; if (o.cls.startsWith(letter)) seg.className = 'hit'; bar.appendChild(seg); }
      const big = document.createElement('b'); big.textContent = o.cls;
      const small = document.createElement('small'); small.textContent = `${o.label} · ${o.time}`;
      this.over.append(big, bar, small);
    } else if (s.overlay?.type === 'number') {
      const o = s.overlay;
      const big = document.createElement('b'); big.textContent = o.value;
      const unit = document.createElement('span'); unit.textContent = o.unit;
      const small = document.createElement('small'); small.textContent = o.label;
      this.over.append(big, unit, small);
    }
    if (s.sound) this.d.fx[s.sound]();
  }

  update(dt: number): void {
    if (this.done) return;
    this.time += dt; this.elapsed += dt; this.t += dt;
    let s = this.shots[this.index];
    if (this.t >= s.dur) {
      if (this.index + 1 >= this.shots.length) { this.finish(); return; }
      this.enter(this.index + 1);
      s = this.shots[this.index];
    }
    const u = Math.min(1, this.t / s.dur);
    // Reduce motion: no camera moves; the stage shows the end of each shot as a still picture that fades in.
    const k = this.d.reduceMotion ? 1 : ease(u);
    const p = lerp3(s.from, s.to, k), l = lerp3(s.lookFrom, s.lookTo, k);
    this.d.camera.position.set(p[0], p[1], p[2]);
    this.d.camera.lookAt(l[0], l[1], l[2]);
    this.stage.update(s.act, this.d.reduceMotion ? 0.8 : u, this.time);
  }

  finish(): void {
    if (this.done) return;
    this.done = true;
    document.body.classList.remove('cine');
    this.d.root.replaceChildren();
    this.d.camera.fov = this.fov; this.d.camera.updateProjectionMatrix();
    this.stage.dispose();
    this.d.onEnd();
  }
}

// A soft round glow, drawn once into a canvas (no image files)
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,160,40,0)'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, 'rgba(255,190,90,0.55)'); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
