// Contact sheet: node contact.mjs <video> <out.png> <cols> <t1> <t2> ...  (frames labelled with their time)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [video, out, colsArg, ...times] = process.argv.slice(2);
const cols = Number(colsArg), ff = process.env.FFMPEG ?? 'ffmpeg';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-'));
const font = 'C\:/Windows/Fonts/arial.ttf';
times.forEach((t, i) => {
  const r = spawnSync(ff, ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', `scale=640:-1`, path.join(tmp, `f_${String(i + 1).padStart(3, '0')}.png`)], { encoding: 'utf8' });
  if (r.status !== 0) console.error(r.stderr);
});
const rows = Math.ceil(times.length / cols);
const r = spawnSync(ff, ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f_%03d.png'), '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
