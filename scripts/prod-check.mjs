// Production checks against the live site (or any URL): node scripts/prod-check.mjs [url]
// Desktop 1280x720 and phone 390x844 (touch). Loads, errors, 404s, manifest and icons, a network audit of a full playthrough
// (start, a day, a storm, the Mars preview), all game modes, English and Arabic screens (screenshots in docs/prod-check/),
// and the first-load size and time on a throttled connection.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL0 = (process.argv[2] ?? 'https://novessa-outpost.pages.dev').replace(/\/$/, '') + '/';
const ORIGIN = new URL(URL0).origin;
const OUT = 'docs/prod-check';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' - ' + extra : ''}`); };
const IGNORE_ERR = /favicon/i;

// This machine's network drops out now and then (DNS/disconnect errors): retry the load a few times
async function goto(page, url) {
  for (let i = 0; i < 4; i++) { try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); return; } catch (e) { if (i === 3 || !/ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION)/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
}
async function open(kind, query, { lang = 'en' } = {}) {
  const phone = kind === 'phone';
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('outpost.lang', l); localStorage.setItem('outpost.cine.stormForming', '1'); localStorage.setItem('outpost.guide.seen', '1'); } catch { /* ignore */ } }, lang);
  const page = await ctx.newPage();
  const log = { errors: [], bad: [], origins: new Set(), requests: [] };
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE_ERR.test(m.text()) && !/Failed to load resource/.test(m.text())) log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (/^(data|blob):/.test(u)) return; log.requests.push(u); try { log.origins.add(new URL(u).origin); } catch { /* ignore */ } });
  page.on('response', (r) => { if (r.status() >= 400) log.bad.push(`${r.status()} ${r.url()}`); });
  page.ctx = ctx; page.log = log;
  await goto(page, URL0 + query);
  return page;
}
const click = (page, text) => page.evaluate((t) => { const b = [...document.querySelectorAll('#overlayCard button')].find((x) => x.textContent.includes(t)) ?? document.querySelector('#overlayCard .main'); b?.click(); return b?.textContent ?? null; }, text);
const ready = (page, needHooks = true) => page.waitForFunction((hooks) => !!document.querySelector('#overlayCard .main') && (!hooks || !!window.outpost), needHooks, { timeout: 90000 });
const noClip = (page) => page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('#overlayCard, #hud, #left, #banner, #buttons')) { if (getComputedStyle(el).display === 'none') continue; const r = el.getBoundingClientRect(); if (r.width && (r.left < -2 || r.right > innerWidth + 2)) bad.push(`${el.id || el.className} outside the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth})`); }
  const card = document.getElementById('overlayCard'); if (card && card.scrollWidth > card.clientWidth + 2) bad.push('overlay card is wider than itself (clipped text)');
  return { bad, dir: document.documentElement.dir, lang: document.documentElement.lang };
});

// ---- 1. load, errors, 404s, manifest and icons (desktop and phone) ----
for (const kind of ['desktop', 'phone']) {
  const page = await open(kind, '');
  await ready(page, false); // a plain production load has no debug hooks
  await page.waitForTimeout(1500);
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); const j = await r.json(); const icons = await Promise.all(j.icons.map(async (i) => (await fetch(new URL(i.src, l.href))).status)); return { ok: r.ok, name: j.name, icons }; });
  check(`${kind}: loads over HTTPS`, page.url().startsWith('https://') || URL0.startsWith('http://localhost'), page.url());
  check(`${kind}: no meaningful console errors`, page.log.errors.length === 0, page.log.errors.slice(0, 2).join(' | '));
  check(`${kind}: no 404s or failed requests`, page.log.bad.length === 0, page.log.bad.slice(0, 3).join(' | '));
  check(`${kind}: manifest and icons are found`, man.ok && man.icons.every((s) => s === 200), JSON.stringify(man));
  await page.screenshot({ path: `${OUT}/${kind}-title.png` });
  await page.ctx.close();
}

// ---- 2. network audit of a full playthrough: start, a day, a storm, the Mars preview ----
{
  const page = await open('desktop', '?debug&judge=1&classic');
  await ready(page);
  await click(page, 'Start mission'); await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { const t = await page.evaluate(() => [...document.querySelectorAll('#overlayCard button')].map((b) => b.textContent).join('|')); if (/Start the day/.test(t)) break; await page.evaluate(() => document.querySelectorAll('#overlayCard button')[0]?.click()); await page.waitForTimeout(500); }
  await click(page, 'Start the day'); await page.waitForTimeout(800);
  await page.keyboard.press('Space'); await page.waitForTimeout(600); // skip the storm cutscene
  await page.evaluate(() => { window.outpost.sim.time = 262; }); await page.waitForTimeout(2500); // storm warning
  await page.evaluate(() => { window.outpost.sim.time = 352; }); await page.waitForTimeout(2500); // storm
  await page.evaluate(() => { window.outpost.sim.day = 2; window.outpost.sim.time = 395.9; }); await page.waitForTimeout(2500); // evening report
  await page.screenshot({ path: `${OUT}/desktop-report.png` });
  const moon = [...page.log.origins];
  await goto(page, URL0 + '?debug&mars=1'); await ready(page); await click(page, 'Start mission'); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.outpost.sim.time = 72; }); await page.waitForTimeout(2000);
  const all = [...page.log.origins];
  const foreign = all.filter((o) => o !== ORIGIN);
  check('Network audit (start, a day, a storm, the Mars preview): every request is same-origin', foreign.length === 0, foreign.length ? 'OTHER ORIGINS: ' + foreign.join(', ') : `${page.log.requests.length} requests, origin ${all.join(', ')}`);
  check('Playthrough has no console errors', page.log.errors.length === 0, page.log.errors.slice(0, 2).join(' | '));
  void moon;
  writeFileSync(`${OUT}/network-audit.txt`, page.log.requests.join('\n'));
  await page.ctx.close();
}

// ---- 3. modes start and finish without errors ----
for (const [name, q] of [['?judge=1', '?debug&judge=1&nodash'], ['?classic', '?debug&classic&nodash'], ['random seed', '?debug&seed=424242&nodash'], ['?mars=1', '?debug&mars=1&nodash']]) {
  const page = await open('desktop', q);
  await ready(page);
  await click(page, name === '?mars=1' ? 'Start mission' : 'Start mission');
  await page.waitForTimeout(800);
  const len = name === '?mars=1' ? 240 : 660;
  for (let i = 0; i < 3; i++) { const on = await page.evaluate(() => document.getElementById('overlay').classList.contains('on')); if (!on) break; await page.evaluate(() => document.querySelector('#overlayCard .main')?.click()); await page.waitForTimeout(500); }
  // the headless browser draws only a few frames a second and the game moves at most 0.05 s per frame, so jump to just before the end
  await page.evaluate((l) => { window.outpost.sim.time = l - 0.2; }, len);
  await page.waitForTimeout(8000);
  const ended = await page.evaluate(() => ({ status: window.outpost.sim.status, overlay: document.getElementById('overlay').classList.contains('on') }));
  check(`${name}: starts and finishes (win or lose screen) with no errors`, page.log.errors.length === 0 && ended.status !== 'running' && ended.overlay, JSON.stringify(ended) + ' ' + page.log.errors.slice(0, 2).join(' | '));
  await page.ctx.close();
}

// ---- 4. English and Arabic: title, Mission Control, the cutscene, the evening report ----
for (const lang of ['en', 'ar']) {
  for (const kind of ['desktop', 'phone']) {
    const page = await open(kind, '?debug&judge=1&classic', { lang });
    await page.addInitScript(() => localStorage.removeItem('outpost.cine.stormForming'));
    await ready(page);
    const title = await noClip(page);
    await page.screenshot({ path: `${OUT}/${lang}-${kind}-1-title.png` });
    await click(page, '');
    await page.waitForTimeout(900);
    const mc1 = await noClip(page);
    await page.screenshot({ path: `${OUT}/${lang}-${kind}-2-mission-control.png` });
    for (let i = 0; i < 4; i++) { const hasBudget = await page.evaluate(() => !!document.querySelector('#overlayCard input[type=range]')); if (hasBudget) break; await page.evaluate(() => document.querySelectorAll('#overlayCard button')[0]?.click()); await page.waitForTimeout(500); }
    const mc2 = await noClip(page);
    await page.screenshot({ path: `${OUT}/${lang}-${kind}-3-power-plan.png` });
    await page.evaluate(() => { const b = [...document.querySelectorAll('#overlayCard button')].pop(); b?.click(); });
    await page.waitForTimeout(1500);
    const cine = await page.evaluate(() => document.body.classList.contains('cine'));
    await page.screenshot({ path: `${OUT}/${lang}-${kind}-4-cutscene.png` });
    await page.keyboard.press('Space'); await page.waitForTimeout(600);
    await page.evaluate(() => window.outpost.sim.time && (window.outpost.sim.day = 2, window.outpost.sim.time = 395.9));
    await page.waitForTimeout(2500);
    const rep = await noClip(page);
    await page.screenshot({ path: `${OUT}/${lang}-${kind}-5-report.png` });
    const bad = [...title.bad, ...mc1.bad, ...mc2.bad, ...rep.bad];
    const dirOk = lang === 'ar' ? title.dir === 'rtl' : title.dir !== 'rtl';
    check(`${lang.toUpperCase()} ${kind}: title, Mission Control, cutscene and report open with no clipping`, bad.length === 0 && dirOk && cine && page.log.errors.length === 0, JSON.stringify({ dir: title.dir, cutscene: cine, problems: bad.slice(0, 3), errors: page.log.errors.slice(0, 1) }));
    await page.ctx.close();
  }
}

// ---- 5. first load on a throttled connection (Fast 3G, CPU x4) ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0, files = 0, raw = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; files++; });
  cdp.on('Network.dataReceived', (e) => { raw += e.dataLength; });
  const t0 = Date.now();
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => { const b = document.querySelector('#overlayCard .main'); return !!b && b.offsetParent !== null; }, null, { timeout: 120000 });
  const tti = (Date.now() - t0) / 1000;
  await page.waitForTimeout(3000); // the lazy textures and sky load after the first screen
  const total = (bytes / 1e6).toFixed(2);
  console.log(`      first load on Fast 3G + CPU x4: title playable after ${tti.toFixed(1)} s; downloaded ${total} MB (${(raw / 1e6).toFixed(2)} MB uncompressed) in ${files} files`);
  check('First load: the title is usable within 30 s on Fast 3G with a slowed CPU', tti < 30, `${tti.toFixed(1)} s, ${total} MB transferred`);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ url: URL0, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} production checks passed against ${URL0}`);
process.exit(failed.length ? 1 : 0);
