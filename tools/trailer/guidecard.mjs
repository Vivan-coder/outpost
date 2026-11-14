// After the first storm cutscene the player gets a "What to do now" card (once).
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
const server = await serve(4184);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:4184/?judge=1&classic');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(2500);
const click = (txt) => page.evaluate((t) => { const b = [...document.querySelectorAll('#overlayCard button')].find((x) => x.textContent.includes(t)) ?? document.querySelector('#overlayCard .main'); b?.click(); return b?.textContent; }, txt);
console.log('1', await click('Start mission'));
await page.waitForTimeout(800);
for (let i = 0; i < 3; i++) { const t = await page.evaluate(() => [...document.querySelectorAll('#overlayCard button')].map((b) => b.textContent.slice(0, 20)).join(' | ')); console.log('buttons:', t); if (/Start the day/.test(t)) break; await page.evaluate(() => document.querySelectorAll('#overlayCard button')[0]?.click()); await page.waitForTimeout(600); }
console.log('2', await click('Start the day'));
await page.waitForTimeout(1500);
console.log('cutscene playing:', await page.evaluate(() => document.body.classList.contains('cine')));
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
const card = await page.evaluate(() => ({ cine: document.body.classList.contains('cine'), open: document.getElementById('overlay').classList.contains('on'), title: document.querySelector('#overlayCard h2')?.textContent, text: document.getElementById('overlayCard').innerText.slice(0, 260) }));
console.log(JSON.stringify(card, null, 1));
await page.screenshot({ path: 'docs/phone-guide-card.png' });
console.log('console errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close(); server.close();
