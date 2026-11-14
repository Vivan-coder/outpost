// Composes the final trailer: node compose.mjs <take-number>
// footage (trimmed take) + end card (crossfade) + original music -> MP4 1080p, MP4 720p, SRT, thumbnail.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, 'docs/trailer/out');
const take = process.argv[2] ?? '1';
const tl = JSON.parse(fs.readFileSync(path.join(root, 'src/trailer/trailer.timeline.json'), 'utf8'));
const ff = process.env.FFMPEG ?? 'ffmpeg';
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) { console.error('FAILED:', cmd, args.join(' ').slice(0, 200)); process.exit(1); } };

// 1. End card and music (always regenerated so the URL and timeline are current)
run('node', [path.join(here, 'endcard.mjs'), path.join(out, 'endcard.png')]);
// Music: your own file if you drop one at tools/trailer/music-override.* (or set "musicFile" in config.json); otherwise the original generated track.
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const dropped = fs.readdirSync(here).find((f) => /^music-override.(mp3|wav|m4a|ogg|flac|aac)$/i.test(f));
const custom = cfg.musicFile ? path.resolve(root, cfg.musicFile) : dropped ? path.join(here, dropped) : null;
if (custom) {
  console.log('Using your music file:', custom);
  let start = String(process.env.MUSIC_START ?? cfg.musicStart ?? 'auto');
  if (start === 'auto') { const { pickStart } = await import('./pickstart.mjs'); const best = pickStart(custom); start = String(best[0].start); console.log('Best part of the song starts at', start, 's (the build-up peaks on the storm hit). Others:', best.slice(1).map((b) => b.start).join(', ')); }
  run(ff, ['-y', '-v', 'error', '-ss', start, '-i', custom, '-t', String(tl.totalSeconds), '-af', `afade=t=in:d=0.4,afade=t=out:st=${tl.totalSeconds - 1.0}:d=1.0`, '-ar', '48000', '-ac', '2', path.join(out, 'music.wav')]);
} else run('python', [path.join(here, 'music.py'), path.join(root, 'src/trailer/trailer.timeline.json'), path.join(out, 'music.wav')]);

// 2. SRT from the same captions the game shows
const stamp = (s) => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
fs.writeFileSync(path.join(out, 'trailer.srt'), tl.captions.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));

// 3a. Two-pass loudness (target -16 LUFS, true peak -2 dBFS) measured on the music
const m = spawnSync(ff, ['-v', 'info', '-i', path.join(out, 'music.wav'), '-af', 'loudnorm=I=-16:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const meas = JSON.parse(m.slice(m.lastIndexOf('{'), m.lastIndexOf('}') + 1));
const ln = `loudnorm=I=-16:TP=-2:LRA=7:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true`;
// 3. Video + audio
const footage = path.join(out, 'raw', `take${take}.trim.mp4`);
const endLen = +(tl.totalSeconds - tl.footageSeconds + 0.3).toFixed(3); // end card length including the 0.3 s crossfade
const off = +(tl.footageSeconds - 0.3).toFixed(3);
const fc = [
  `[0:v]fps=30,format=yuv420p,eq=contrast=1.05:saturation=1.1,vignette=angle=PI/5,setsar=1[v0]`,
  `[1:v]fps=30,format=yuv420p,setsar=1[v1]`,
  `[v0][v1]xfade=transition=fade:duration=0.3:offset=${off}[v]`,
  `[2:a]${ln},aresample=48000,atrim=0:${tl.totalSeconds},asetpts=N/SR/TB[a]`,
].join(';');
const base = ['-y', '-v', 'error', '-i', footage, '-loop', '1', '-framerate', '30', '-t', String(endLen), '-i', path.join(out, 'endcard.png'), '-i', path.join(out, 'music.wav'), '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', String(tl.totalSeconds)];
run(ff, [...base, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', path.join(out, 'outpost-trailer-1080p.mp4')]);
run(ff, ['-y', '-v', 'error', '-i', path.join(out, 'outpost-trailer-1080p.mp4'), '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-maxrate', '3000k', '-bufsize', '6000k', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', path.join(out, 'outpost-trailer-720p.mp4')]);
run(ff, ['-y', '-v', 'error', '-ss', '19.6', '-i', path.join(out, 'outpost-trailer-1080p.mp4'), '-frames:v', '1', path.join(out, 'outpost-trailer-thumbnail.png')]);
console.log('composed from take', take);
