// Measures the real frame rate of the game in a headed, GPU-rendered Chrome (full screen).
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
const extra = (process.env.FLAGS ?? '').split(' ').filter(Boolean);
const server = await serve(4180);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false,
  args: ['--force-device-scale-factor=1', '--window-position=0,0', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--disable-infobars', '--no-first-run', ...extra],
  ignoreDefaultArgs: ['--enable-automation'],
});
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } });
await page.goto('http://127.0.0.1:4180/?judge=1&classic');
await page.waitForTimeout(3500);
const info = await page.evaluate(async () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const n = await new Promise((res) => { let c = 0, t0 = performance.now(); const f = () => { c++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(c / 5); }; requestAnimationFrame(f); });
  return { w: innerWidth, h: innerHeight, dpr: devicePixelRatio, fps: n, gpu: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).slice(0, 60) };
});
console.log(process.env.FLAGS ?? '(none)', JSON.stringify(info));
await browser.close(); server.close();
