// npm run trailer: build the game, record 3 takes, score them, keep the best, compose and export.
//   node tools/trailer/run.mjs [--takes 3] [--skip-build] [--reuse]   (--reuse = compose from the best existing takes, no new recording)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const raw = path.join(root, 'docs/trailer/out/raw');
const args = process.argv.slice(2);
const takes = Number(args[args.indexOf('--takes') + 1]) || 3;
const ff = process.env.FFMPEG ?? 'ffmpeg';
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' && cmd === 'npm', ...opts });

if (!args.includes('--skip-build')) { const b = run('npm', ['run', 'build']); if (b.status !== 0) process.exit(1); }
fs.mkdirSync(raw, { recursive: true });

const score = (n) => {
  const j = path.join(raw, `take${n}.json`), v = path.join(raw, `take${n}.trim.mp4`);
  if (!fs.existsSync(j) || !fs.existsSync(v)) return { n, score: Infinity, why: 'missing' };
  const r = JSON.parse(fs.readFileSync(j, 'utf8'));
  const bd = spawnSync(ff, ['-v', 'info', '-i', v, '-vf', 'blackdetect=d=0.1:pix_th=0.06', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]).filter(([s, e]) => !(s < 0.6 && e <= 0.8));
  const solarOk = (r.log ?? []).some((l) => l.startsWith('solar finished'));
  const gaps = r.slowFrames; // frames over 40 ms in the page (dropped-frame gaps)
  const s = r.errors.length * 100 + gaps * 3 + (r.worstFrameMs > 150 ? 5 : 0) + blacks.length * 20 + (solarOk ? 0 : 200) + (r.avgFps < 30 ? 100 : 0);
  return { n, score: s, errors: r.errors.length, slowFrames: gaps, worstFrameMs: r.worstFrameMs, blacks: blacks.length, solarOk, avgFps: r.avgFps };
};

if (!args.includes('--reuse')) {
  for (let n = 1; n <= takes; n++) {
    console.log(`\n=== take ${n} of ${takes}: the screen will be used for about 30 seconds; do not touch the mouse or keyboard ===`);
    const r = run('node', [path.join(here, 'record.mjs'), String(n)]);
    if (r.status !== 0) { console.error(`take ${n} failed to record`); continue; }
    const t = run('node', [path.join(here, 'trim.mjs'), String(n)]);
    if (t.status !== 0) console.error(`take ${n}: could not find the sync frame (the browser window was probably not in front)`);
  }
}
const scored = fs.readdirSync(raw).map((f) => (f.match(/^take(\d+)\.json$/) ?? [])[1]).filter(Boolean).map((n) => score(Number(n))).sort((a, b) => a.score - b.score);
console.log('\nTake scores (lower is better):');
for (const s of scored) console.log(' ', JSON.stringify(s));
const best = scored[0];
if (!best || !Number.isFinite(best.score)) { console.error('No usable take. See docs/trailer/README.md for the manual recording kit.'); process.exit(1); }
if (best.errors > 0 || best.blacks > 0) console.warn(`WARNING: the best take (${best.n}) still has ${best.errors} console error(s) and ${best.blacks} black frame run(s).`);
console.log(`\nBest take: ${best.n}`);
const c = run('node', [path.join(here, 'compose.mjs'), String(best.n)]);
process.exit(c.status ?? 1);
