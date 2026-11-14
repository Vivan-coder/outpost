// Checks: shelter rocks are solid, the shelter door stays open, the objective line shows, the phone toggles hide/show panels.
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
const server = await serve(4183);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:4183/?debug&judge=1&nodash');
await page.waitForTimeout(2500);
await page.evaluate(() => document.querySelector('#overlayCard .main')?.click());
await page.waitForTimeout(600);
const R = {};
// 1. rocks: stand outside a rock on the east side of the shelter and walk west into it (real key presses)
const hold = async (ms) => { await page.keyboard.down('w'); await page.waitForTimeout(ms); await page.keyboard.up('w'); };
await page.evaluate(() => { const w = window.outpost, h = w.world.buildings.find((b) => b.type === 'shelter'); w.player.pos.set(h.x + h.r + 0.5 + 2.2, 0, h.z); w.player.yaw = Math.PI / 2; w.player.pitch = 0; });
await hold(4000);
R.rock = await page.evaluate(() => { const w = window.outpost, h = w.world.buildings.find((b) => b.type === 'shelter'); return { eastOfRockCentre: +(w.player.pos.x - (h.x + h.r + 0.5)).toFixed(2), z: +(w.player.pos.z - h.z).toFixed(2), note: 'started 2.2 east of the rock centre walking west: stopping at about 0.8-1.3 means the rock is solid (0 or negative means walked through)' }; });
// 2. the doorway: walk straight to the door from the south
await page.evaluate(() => { const w = window.outpost, h = w.world.buildings.find((b) => b.type === 'shelter'); w.player.pos.set(h.x, 0, h.z + h.r + 3.5); w.player.yaw = 0; w.player.pitch = 0; });
await hold(6000);
R.door = await page.evaluate(() => { const w = window.outpost, h = w.world.buildings.find((b) => b.type === 'shelter'); return { dz: +(w.player.pos.z - h.z).toFixed(2), r: h.r, reachedDoorOrInside: w.player.pos.z - h.z < h.r + 0.6 }; });
// 3. the objective line
await page.evaluate(() => { const w = window.outpost; w.player.pos.set(0, 0, 2); });
await page.waitForTimeout(1500);
R.banner = await page.evaluate(() => ({ text: document.getElementById('banner').innerText.slice(0, 120), shown: getComputedStyle(document.getElementById('banner')).display }));
// 4. toggles
const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
R.toggles = { tglMenuVisible: await vis('#tglMenu'), before: { buttons: await vis('#buttons'), pills: await vis('.pills'), jobs: await vis('#jobs') } };
await page.tap('#tglMenu'); await page.tap('#tglTasks');
R.toggles.after = { buttons: await vis('#buttons'), pills: await vis('.pills'), jobs: await vis('#jobs'), tglStillThere: await vis('#tglMenu') };
await page.screenshot({ path: 'docs/phone-guide-hidden.png' });
await page.tap('#tglMenu'); await page.tap('#tglTasks');
R.toggles.restored = { buttons: await vis('#buttons'), jobs: await vis('#jobs') };
await page.screenshot({ path: 'docs/phone-guide-shown.png' });
console.log(JSON.stringify(R, null, 1)); console.log('console errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close(); server.close();
