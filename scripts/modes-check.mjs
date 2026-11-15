// Each game mode must reach its end screen. Steps the simulation with the game's own fixed-step function (debug hook stepSim),
// so it does not depend on how fast the browser draws. node scripts/modes-check.mjs [url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const URL0 = (process.argv[2] ?? 'http://localhost:4190').replace(/\/$/, '') + '/';
mkdirSync('docs/prod-check', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const [name, q, len] of [['?judge=1', '?debug&judge=1&nodash', 700], ['?classic', '?debug&classic&nodash', 700], ['random seed (424242)', '?debug&seed=424242&nodash', 700], ['?mars=1', '?debug&mars=1&nodash', 260]]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('outpost.cine.stormForming', '1'); localStorage.setItem('outpost.guide.seen', '1'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(URL0 + q, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector('#overlayCard .main') && !!window.outpost, null, { timeout: 90000 });
  for (let i = 0; i < 3; i++) { const on = await page.evaluate(() => document.getElementById('overlay').classList.contains('on')); if (!on) break; await page.evaluate(() => document.querySelector('#overlayCard .main')?.click()); await page.waitForTimeout(400); }
  const before = await page.evaluate(() => ({ t: window.outpost.sim.time, status: window.outpost.sim.status }));
  await page.evaluate((l) => window.outpost.stepSim(l), len); // the whole mission, one fixed step at a time
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ t: Math.round(window.outpost.sim.time), status: window.outpost.sim.status, day: window.outpost.sim.day, overlay: document.getElementById('overlay').classList.contains('on'), title: document.querySelector('#overlayCard h2')?.textContent ?? '' }));
  await page.screenshot({ path: `docs/prod-check/mode-end-${name.replace(/[^a-z0-9]/gi, '')}.png` });
  const ok = after.status !== 'running' && after.overlay && errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: reaches its end screen - started at ${Math.round(before.t)} s, ended at ${after.t} s as "${after.status}", screen "${after.title}"${errors.length ? ' ERRORS: ' + errors.slice(0, 2).join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
