// Phone layout test (Chromium emulating an iPhone-sized touch screen). Simulates Safari's bars by setting the overlap
// variables, then reports whether every fixed UI element is fully inside the visible area. node phonetest.mjs [w h overlapBottom overlapTop]
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [W, H, OB, OT] = [Number(process.argv[2] ?? 390), Number(process.argv[3] ?? 664), Number(process.argv[4] ?? 0), Number(process.argv[5] ?? 0)];
const server = await serve(4182);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:4182/?judge=1&nodash');
await page.waitForTimeout(2500);
await page.evaluate(([ob, ot]) => { // pretend Safari's bars cover this much of the layout viewport
  const r = document.documentElement; r.style.setProperty('--vo-b', ob + 'px'); r.style.setProperty('--vo-t', ot + 'px');
}, [OB, OT]);
await page.evaluate(() => document.querySelector('#overlayCard .main')?.click());
await page.waitForTimeout(800);
const report = await page.evaluate(([ob, ot]) => {
  const visTop = ot, visBottom = innerHeight - ob, out = [];
  for (const id of ['hud', 'left', 'buttons', 'toasts', 'judgeBar', 'banner']) {
    const el = document.getElementById(id); if (!el) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none') continue;
    const b = el.getBoundingClientRect(); if (!b.width) continue;
    out.push({ id, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), hidden: b.bottom > visBottom + 1 || b.top < visTop - 1 || b.right > innerWidth + 1 || b.left < -1 });
  }
  return { inner: [innerWidth, innerHeight], visible: [visTop, visBottom], appH: getComputedStyle(document.documentElement).getPropertyValue('--app-h'), out };
}, [OB, OT]);
console.log(JSON.stringify(report));
await page.screenshot({ path: path.resolve(here, `../../docs/phone-test-${W}x${H}-b${OB}.png`) });
console.log('console errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close(); server.close();
