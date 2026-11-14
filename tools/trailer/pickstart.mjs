// Finds the best 29.6 s stretch of a song for the trailer: a build-up that peaks at the storm hit (17.5 s into the trailer).
// node pickstart.mjs <audio file>  -> prints the best start times; compose.mjs uses the first when musicStart is "auto".
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const tl = JSON.parse(fs.readFileSync(path.resolve(here, '../../src/trailer/trailer.timeline.json'), 'utf8'));
export function pickStart(file) {
  const SR = 8000, HOP = 0.25, HIT = 17.5, LEN = tl.totalSeconds;
  const r = spawnSync(process.env.FFMPEG ?? 'ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
  if (r.status !== 0) throw new Error('could not decode ' + file);
  const a = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const n = Math.floor(a.length / (SR * HOP)), env = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * SR * HOP; j < (i + 1) * SR * HOP; j++) s += a[j] * a[j]; env[i] = Math.sqrt(s / (SR * HOP)); }
  const mean = (x, y) => { let s = 0, c = 0; for (let i = Math.max(0, Math.round(x / HOP)); i < Math.min(n, Math.round(y / HOP)); i++) { s += env[i]; c++; } return c ? s / c : 0; };
  const total = a.length / SR, out = [];
  for (let s = 0; s + LEN <= total; s += HOP) {
    const before = mean(s + 11, s + 16.5), hit = mean(s + HIT, s + HIT + 3), start = mean(s, s + 4), calm = mean(s + 23.5, s + 26), end = mean(s + 26.5, s + 29);
    // reward: a quiet-ish build, a clear jump at the hit, and a strong ending; avoid starting loud
    const score = (hit / (before + 1e-6)) * 1.0 + (hit / (start + 1e-6)) * 0.3 + (end / (calm + 1e-6)) * 0.2 + hit * 2;
    out.push({ start: +s.toFixed(2), score: +score.toFixed(3), jump: +(hit / (before + 1e-6)).toFixed(2) });
  }
  out.sort((x, y) => y.score - x.score);
  const picked = [];
  for (const c of out) if (picked.every((p) => Math.abs(p.start - c.start) > 8)) picked.push(c);
  return picked.slice(0, 5);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { for (const p of pickStart(process.argv[2])) console.log(`start at ${p.start}s  (jump at the hit x${p.jump}, score ${p.score})`); }
