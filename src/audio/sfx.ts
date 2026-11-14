// All sounds are synthesised with WebAudio at runtime: no audio files, nothing to license.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo = freq, delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  click: () => tone(660, 0.06, 'square', 0.15),
  fix: () => { tone(440, 0.08, 'square', 0.25); tone(660, 0.08, 'square', 0.25, 660, 0.09); tone(880, 0.14, 'square', 0.25, 880, 0.18); },
  build: () => { tone(220, 0.12, 'triangle', 0.5, 330); tone(440, 0.2, 'triangle', 0.4, 660, 0.12); },
  broke: () => tone(300, 0.35, 'sawtooth', 0.3, 90),
  part: () => tone(990, 0.1, 'sine', 0.3, 1320),
  alarm: () => { for (let i = 0; i < 3; i++) { tone(880, 0.18, 'square', 0.3, 880, i * 0.4); tone(620, 0.18, 'square', 0.3, 620, i * 0.4 + 0.2); } },
  geiger: () => tone(2400 + Math.random() * 800, 0.012, 'square', 0.2),
  meteor: () => tone(120, 0.5, 'sawtooth', 0.5, 40),
  allClear: () => { tone(523, 0.15, 'sine', 0.4); tone(784, 0.3, 'sine', 0.4, 784, 0.15); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.45, f, i * 0.16)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.3, f * 0.9, i * 0.25)); },
};
