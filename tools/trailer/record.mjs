// Records one take of the trailer footage: node record.mjs <take-number> [url-suffix]
// Opens a headed, GPU-rendered, full-screen Chrome (1920x1080 on this machine), starts ffmpeg screen capture,
// starts the in-game director (?trailer=1) and stops when it is done. Output: docs/trailer/out/raw/takeN.json + takeN.mp4
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../docs/trailer/out/raw');
fs.mkdirSync(outDir, { recursive: true });
const take = process.argv[2] ?? '1';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const file = path.join(outDir, `take${take}.mp4`);
const timeline = JSON.parse(fs.readFileSync(path.resolve(here, '../../src/trailer/trailer.timeline.json'), 'utf8'));

const server = await serve(4180);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--force-device-scale-factor=1', '--window-position=0,0', '--use-angle=d3d11', '--force_high_performance_gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--disable-infobars', '--no-first-run', '--disable-features=Translate', '--hide-scrollbars'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
await page.addInitScript(() => {
  window.__fts = []; let last = performance.now();
  const f = (n) => { window.__fts.push(n - last); last = n; requestAnimationFrame(f); }; requestAnimationFrame(f);
});
await page.goto('http://127.0.0.1:4180/?trailer=1' + (process.env.EXTRA ?? ''));
await page.waitForFunction(() => window.__trailerReady === true, null, { timeout: 60000 });
await page.bringToFront();
const foc = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'focus.ps1'), 'Outpost'], { encoding: 'utf8' });
console.log('focus:', foc.stdout.trim());
await page.waitForTimeout(4000); // let the game finish loading and compiling shaders
const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }));
if (size.w !== 1920 || size.h !== 1080) console.warn('WARNING: viewport is', size);

const ff = spawn(ffmpeg, ['-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0', '-offset_x', '0', '-offset_y', '0', '-video_size', '1920x1080', '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30', file], { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = ''; ff.stderr.on('data', (d) => { ffErr += d; });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { window.__fts.length = 0; window.__trailerStart(); });
await page.waitForFunction(() => window.__trailerDone === true, null, { timeout: (timeline.footageSeconds + 30) * 1000 });
await page.waitForTimeout(600);
const stats = await page.evaluate(() => ({ fts: window.__fts.slice(), log: window.__trailerLog }));
ff.stdin.write('q');
await new Promise((r) => ff.on('close', r));
await browser.close(); server.close();

const fts = stats.fts.slice(5);
const sorted = [...fts].sort((a, b) => a - b);
const report = {
  take, file, viewport: size, errors, log: stats.log,
  frames: fts.length, avgFps: +(1000 / (fts.reduce((a, b) => a + b, 0) / fts.length)).toFixed(1),
  p99FrameMs: +sorted[Math.floor(sorted.length * 0.99)].toFixed(1), worstFrameMs: +sorted[sorted.length - 1].toFixed(1),
  slowFrames: fts.filter((x) => x > 40).length,
  slowAt: (() => { let t = 0; const o = []; for (const x of fts) { t += x; if (x > 40) o.push(+(t / 1000).toFixed(2) + '/' + Math.round(x) + 'ms'); } return o; })(),
};
fs.writeFileSync(file.replace('.mp4', '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
