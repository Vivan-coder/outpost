// Verifies the exported trailer: node check.mjs   (npm run trailer:check)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, 'docs/trailer/out');
const tl = JSON.parse(fs.readFileSync(path.join(root, 'src/trailer/trailer.timeline.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const ff = process.env.FFMPEG ?? 'ffmpeg', fp = process.env.FFPROBE ?? 'ffprobe';
const V = path.join(out, 'outpost-trailer-1080p.mp4'), V7 = path.join(out, 'outpost-trailer-720p.mp4');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`); };
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 });

// 1. ffprobe
const probe = JSON.parse(sh(fp, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels,duration,bit_rate', '-of', 'json', V]).stdout);
const vs = probe.streams.find((s) => s.codec_type === 'video'), as = probe.streams.find((s) => s.codec_type === 'audio');
const vd = Number(vs.duration), ad = Number(as.duration);
check('video duration <= 29.8 s (never over 30.0)', vd <= 29.8 && vd > 29.0, `${vd.toFixed(3)} s`);
check('audio duration <= 29.8 s', ad <= 29.8, `${ad.toFixed(3)} s`);
check('audio/video lengths differ by < 0.1 s', Math.abs(vd - ad) < 0.1, `${Math.abs(vd - ad).toFixed(3)} s`);
check('1920x1080, 30 fps, h264, yuv420p', vs.width === 1920 && vs.height === 1080 && vs.r_frame_rate === '30/1' && vs.codec_name === 'h264' && vs.pix_fmt === 'yuv420p', `${vs.width}x${vs.height} ${vs.r_frame_rate} ${vs.codec_name} ${vs.pix_fmt}`);
check('audio AAC stereo 48 kHz', as.codec_name === 'aac' && as.channels === 2 && as.sample_rate === '48000', `${as.codec_name} ${as.channels}ch ${as.sample_rate} Hz ${Math.round(as.bit_rate / 1000)} kbps`);
const head = fs.readFileSync(V).subarray(0, 65536).toString('latin1');
check('+faststart (moov before mdat)', head.indexOf('moov') > -1 && (head.indexOf('mdat') === -1 || head.indexOf('moov') < head.indexOf('mdat')));
const size720 = fs.statSync(V7).size;
check('720p file under 15 MB', size720 < 15e6, `${(size720 / 1e6).toFixed(1)} MB (1080p ${(fs.statSync(V).size / 1e6).toFixed(1)} MB)`);

// 2. black frames, silence, peak, loudness
const bd = sh(ff, ['-v', 'info', '-i', V, '-vf', 'blackdetect=d=0.1:pix_th=0.06', '-an', '-f', 'null', '-']).stderr;
const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const badBlack = blacks.filter(([s, e]) => !(s < 0.6 && e <= 0.8)); // the title fades in from black: allowed
check('no black frames (except the fade-in at the start)', badBlack.length === 0, blacks.length ? JSON.stringify(blacks) : 'none');
const sd = sh(ff, ['-v', 'info', '-i', V, '-af', 'silencedetect=noise=-50dB:d=0.4', '-vn', '-f', 'null', '-']).stderr;
const sil = [...sd.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
check('no long silence', sil.length === 0, sil.length ? `silence starts at ${sil.join(', ')} s` : 'none');
const st = sh(ff, ['-v', 'info', '-i', V, '-af', 'astats=metadata=0:measure_perchannel=none,ebur128=peak=true', '-vn', '-f', 'null', '-']).stderr;
const peakDb = Number((st.match(/Peak level dB:\s+(-?[\d.]+)/g) ?? []).pop()?.split(/\s+/).pop());
const truePeak = Number((st.match(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/) ?? [])[1] ?? NaN);
const lufs = Number((st.match(/Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/) ?? [])[1]);
check('peak level below -1 dBFS', peakDb < -1, `sample peak ${peakDb} dBFS${Number.isNaN(truePeak) ? '' : `, true peak ${truePeak} dBFS`}`);
check('integrated loudness about -16 LUFS (-17.5 to -14.5)', lufs > -17.5 && lufs < -14.5, `${lufs} LUFS`);

// 3. contact sheet at every shot boundary and midpoint (look at it)
const times = [];
for (const s of tl.shots) times.push(Math.min(vd - 0.1, s.start + 0.15), Math.min(vd - 0.1, (s.start + s.end) / 2), Math.min(vd - 0.1, s.end - 0.15));
const uniq = [...new Set(times.map((t) => t.toFixed(2)))];
const c = spawnSync('node', [path.join(here, 'contact.mjs'), V, path.join(out, 'contact-sheet.png'), '3', ...uniq], { encoding: 'utf8' });
check('contact sheet written (look at it)', c.status === 0, path.join(out, 'contact-sheet.png'));

// 4. QR code decoded from the video frame
const qrPng = path.join(out, 'qr-frame.png');
sh(ff, ['-y', '-v', 'error', '-ss', '28.5', '-i', V, '-frames:v', '1', qrPng]);
const png = PNG.sync.read(fs.readFileSync(qrPng));
const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
check('QR code in the video decodes to the exact URL', !!code && code.data === cfg.url, code ? `decoded "${code.data}"` : 'no QR found');
check('URL is the real Netlify link (not the placeholder)', !/YOUR-SITE/.test(cfg.url), cfg.url);

// 5. captions: words, size, SRT matches the timeline
const words = tl.captions.map((x) => x.text.trim().split(/\s+/).length);
check('every caption has at most 9 words', words.every((n) => n <= 9), words.join(','));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vh = Number((html.match(/#trCaption \{[^}]*font:\s*800\s+([\d.]+)vh/) ?? [])[1]);
check('caption text height >= 4.5% of the video height', vh >= 4.5, `${vh}%`);
const srt = fs.readFileSync(path.join(out, 'trailer.srt'), 'utf8');
check('SRT text and timings match the captions shown in the game', tl.captions.every((x) => srt.includes(x.text)) && (srt.match(/-->/g) ?? []).length === tl.captions.length);
check('captions end before the end card', tl.captions.every((x) => x.end <= tl.footageSeconds));

// 6. nothing leaked into normal play or the deployed build
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const dist = walk(path.join(root, 'dist'));
const media = dist.filter((f) => /\.(mp4|wav|srt|mov|webm)$/i.test(f));
check('no trailer media in dist/ (the deployed build)', media.length === 0, media.join(', ') || `${dist.length} files`);
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:4181/?nointro=1');
await page.waitForTimeout(2500);
const normal = await page.evaluate(() => ({ trailer: document.body.classList.contains('trailer'), caption: !!document.getElementById('trCaption'), ready: window.__trailerReady === true, start: typeof window.__trailerStart }));
check('normal play (no ?trailer=1) has no trailer mode', !normal.trailer && !normal.caption && !normal.ready && normal.start === 'undefined', JSON.stringify(normal));
check('normal play has no console errors', errs.length === 0, errs.join(' | ') || 'none');
await browser.close();
server.close();

// 7. recorded takes
const rawDir = path.join(out, 'raw');
const takes = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((f) => /^take\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'))) : [];
for (const t of takes) console.log(`      take ${t.take}: ${t.avgFps} fps avg, ${t.slowFrames} frames > 40 ms, worst ${t.worstFrameMs} ms, console errors ${t.errors.length}`);

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(out, 'check-report.json'), JSON.stringify({ results, loudness: lufs, peak: peakDb, duration: vd }, null, 2));
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : '\nAll checks passed');
process.exit(failed.length ? 1 : 0);
