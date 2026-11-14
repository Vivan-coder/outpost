// Trims a raw take at the magenta sync frame: node trim.mjs <take-number>. Output: takeN.trim.mp4 (exact footage length)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../docs/trailer/out/raw');
const take = process.argv[2] ?? '1';
const timeline = JSON.parse(fs.readFileSync(path.resolve(here, '../../src/trailer/trailer.timeline.json'), 'utf8'));
const src = path.join(dir, `take${take}.mp4`), dst = path.join(dir, `take${take}.trim.mp4`);
const W = 32, H = 18, FS = W * H * 3;
const p = spawn(process.env.FFMPEG ?? 'ffmpeg', ['-v', 'error', '-i', src, '-vf', `scale=${W}:${H}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
let buf = Buffer.alloc(0), idx = 0, first = -1, lastMag = -1;
p.stdout.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= FS) {
    const f = buf.subarray(0, FS); buf = buf.subarray(FS);
    let r = 0, g = 0, b = 0; for (let i = 0; i < FS; i += 3) { r += f[i]; g += f[i + 1]; b += f[i + 2]; }
    r /= W * H; g /= W * H; b /= W * H;
    const mag = r > 200 && g < 70 && b > 200;
    if (mag) { if (first < 0) first = idx; lastMag = idx; }
    idx++;
  }
});
await new Promise((r) => p.on('close', r));
if (first < 0) { console.error('no magenta sync frame found'); process.exit(1); }
const start = (lastMag + 1) / 30;
console.log(`sync frames ${first}-${lastMag} of ${idx}; footage starts at ${start.toFixed(3)} s`);
const res = spawnSync(process.env.FFMPEG ?? 'ffmpeg', ['-y', '-v', 'error', '-ss', start.toFixed(3), '-i', src, '-t', String(timeline.footageSeconds), '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '30', dst], { stdio: 'inherit' });
process.exit(res.status ?? 1);
