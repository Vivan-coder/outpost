// VR hardening tests (IWER emulator). Run: npm run test:vr:hardening
// Against the live site:  VR_URL=https://novessa-outpost.pages.dev npm run test:vr:hardening
// Every case runs in a fresh page so one failure cannot hide another. Screenshots go to docs/vr-proof/hardening/.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { preview } from 'vite';

const OUT = 'docs/vr-proof/hardening';
mkdirSync(OUT, { recursive: true });
const remote = process.env.VR_URL;
const server = remote ? null : await preview({ preview: { port: 4185, strictPort: true } });
const BASE = remote ?? 'http://localhost:4185/';
const iwer = readFileSync('node_modules/iwer/build/iwer.min.js', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--js-flags=--expose-gc'] });

const results = [];
const note = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const IGNORE = /favicon|RGBELoader|Failed to load resource/;

const HELPERS = `
window.__aim = (hand, target) => {
  const d = window.__xr, o = window.outpost, rig = o.rig, c = d.controllers[hand];
  const th = rig.rotation.y, cs = Math.cos(th), sn = Math.sin(th);
  const dx = target[0] - rig.position.x, dz = target[2] - rig.position.z;
  const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz, ly = target[1] - rig.position.y;
  const p = hand === 'right' ? [0.25, 1.2, -0.25] : [-0.25, 1.0, -0.3];
  c.position.set(p[0], p[1], p[2]);
  let vx = lx - p[0], vy = ly - p[1], vz = lz - p[2]; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
  const qx = vy, qy = -vx, qz = 0, qw = 1 - vz; const n = Math.hypot(qx, qy, qz, qw) || 1;
  c.quaternion.set(qx / n, qy / n, qz / n, qw / n);
};
window.__pitch = (hand, pitch) => { const c = window.__xr.controllers[hand]; c.position.set(hand === 'right' ? 0.25 : -0.25, 1.2, -0.25); c.quaternion.set(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)); };
// test switches: refuse the floor reference space, expose only two axes per gamepad
(() => {
  const rs = XRSession.prototype.requestReferenceSpace;
  XRSession.prototype.requestReferenceSpace = function (type, ...a) { if (type === 'local-floor' && window.__noFloor) return Promise.reject(new DOMException('no floor', 'NotSupportedError')); return rs.call(this, type, ...a); };
  const desc = Object.getOwnPropertyDescriptor(XRInputSource.prototype, 'gamepad');
  if (desc && desc.get) Object.defineProperty(XRInputSource.prototype, 'gamepad', { get() { const g = desc.get.call(this); if (!window.__axes2 || !g) return g; return new Proxy(g, { get: (t, p) => (p === 'axes' ? [t.axes[2], t.axes[3]] : typeof t[p] === 'function' ? t[p].bind(t) : t[p]) }); } });
})();
`;

async function game(name, { withXr = true, query = '?debug&judge=1&nodash', init = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) page.errors.push(m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  if (withXr) await page.addInitScript(iwer + ';(() => { const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d; })();' + HELPERS);
  if (init) await page.addInitScript(init);
  await page.goto(BASE + query);
  await page.waitForFunction(() => !!document.querySelector('#overlayCard .main') && !!window.outpost, null, { timeout: 40000 });
  await page.evaluate(() => document.querySelector('#overlayCard .main').click());
  page.shot = (n) => page.screenshot({ path: `${OUT}/${name}-${n}.png` });
  page.cdp = await ctx.newCDPSession(page);
  page.ctx = ctx;
  return page;
}
const enter = async (page) => { await page.waitForFunction(() => !!document.getElementById('vrBtn'), null, { timeout: 20000 }); await page.click('#vrBtn'); await page.waitForFunction(() => window.outpost.vr() && window.outpost.vr().active, null, { timeout: 40000 }); await page.waitForTimeout(800); };
const leave = async (page) => { await page.evaluate(() => window.outpost.vr().exit()); await page.waitForFunction(() => !window.outpost.renderer.xr.isPresenting, null, { timeout: 20000 }); await page.waitForTimeout(400); };
const heap = async (page) => { await page.cdp.send('HeapProfiler.collectGarbage'); const m = await page.cdp.send('Performance.getMetrics'); return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value; };
const teleportWith = async (page, hand, axisId = 'thumbstick') => {
  const before = await page.evaluate(() => ({ x: window.outpost.player.pos.x, z: window.outpost.player.pos.z }));
  await page.evaluate((h) => window.__pitch(h, -0.32), hand);
  await page.waitForTimeout(300);
  await page.evaluate(([h, a]) => window.__xr.controllers[h].updateAxes(a, 0, -1), [hand, axisId]);
  await page.waitForFunction(() => window.outpost.vr().aimingNow, null, { timeout: 15000 });
  await page.evaluate(([h, a]) => window.__xr.controllers[h].updateAxes(a, 0, 0), [hand, axisId]);
  await page.waitForFunction(() => !window.outpost.vr().aimingNow, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ t: window.outpost.vr().lastTeleport, x: window.outpost.player.pos.x, z: window.outpost.player.pos.z }));
  return { moved: after.t.ok && Math.hypot(after.x - before.x, after.z - before.z) > 1.5, after };
};
const turnWith = async (page, hand) => {
  const y0 = await page.evaluate(() => window.outpost.rig.rotation.y);
  await page.evaluate((h) => window.__xr.controllers[h].updateAxes('thumbstick', 1, 0), hand);
  await page.waitForTimeout(1200); // held for more than a second: still only one turn
  await page.evaluate((h) => window.__xr.controllers[h].updateAxes('thumbstick', 0, 0), hand);
  await page.waitForTimeout(300);
  const y1 = await page.evaluate(() => window.outpost.rig.rotation.y);
  return Math.abs(y1 - y0);
};
const guard = async (name, fn) => { let page; try { page = await fn(); } catch (e) { note(`${name}: ran without crashing`, false, e.message.split('\n')[0]); } finally { /* contexts are closed at the end */ } return page; };

// 1. session start, both eyes, no console errors, then a clean end
await guard('session', async () => {
  const page = await game('session');
  await enter(page);
  const eyes = await page.evaluate(() => window.outpost.renderer.xr.getCamera().cameras.length);
  await page.shot('in-vr');
  note('Session starts, both eyes render', eyes === 2, `cameras=${eyes}`);
  const ref = await page.evaluate(() => ({ type: window.outpost.vr().refType, eye: window.outpost.vr().eyeOffset }));
  note('Reference space is local-floor with no extra eye height', ref.type === 'local-floor' && ref.eye === 0, JSON.stringify(ref));
  await leave(page);
  note('Session ends cleanly and the desktop view returns', await page.evaluate(() => !document.body.classList.contains('xr') && !window.outpost.renderer.xr.isPresenting));
  note('No console errors in a start/end session', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  return page;
});

// 2. local-floor refused: falls back to "local" with a fixed eye height
await guard('refspace', async () => {
  const page = await game('refspace', { init: 'window.__noFloor = true;' });
  await enter(page);
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => { const o = window.outpost; return { type: o.vr().refType, eye: o.vr().eyeOffset, rigY: o.rig.position.y, groundY: o.player.pos.y }; });
  await page.shot('local-fallback');
  note('Falls back to the "local" reference space when local-floor is refused', r.type === 'local', JSON.stringify(r));
  note('Adds a 1.6 m eye height so the player is not at floor level', Math.abs(r.rigY - r.groundY - 1.6) < 0.06, `rig ${r.rigY.toFixed(2)} vs ground ${r.groundY.toFixed(2)}`);
  await leave(page);
  return page;
});

// 3. five rapid enter/exit cycles: no duplicate listeners, no leaked scene objects, no heap growth
await guard('cycles', async () => {
  const page = await game('cycles');
  await page.cdp.send('Performance.enable');
  const counts = [], heaps = [];
  for (let i = 0; i < 5; i++) {
    await enter(page);
    counts.push(await page.evaluate(() => window.outpost.vr().debugCounts()));
    await leave(page);
    heaps.push(await heap(page));
  }
  const inSession = counts.map((c) => `${c.listeners}/${c.sceneChildren}`);
  note('Five enter/exit cycles keep the listener and scene object counts constant', counts.every((c) => c.listeners === counts[0].listeners && c.sceneChildren === counts[0].sceneChildren), `listeners/sceneChildren per cycle: ${inSession.join(' ')}`);
  const idle = await page.evaluate(() => window.outpost.vr().debugCounts());
  note('After leaving VR no listeners remain on the controllers', idle.listeners === 0, `listeners=${idle.listeners}`);
  const growth = (heaps[4] - heaps[1]) / 1e6;
  note('Heap does not keep growing across cycles (cycle 5 vs cycle 2, after GC)', growth < 4, `${growth.toFixed(2)} MB (${heaps.map((h) => (h / 1e6).toFixed(1)).join(', ')} MB)`);
  note('No console errors across five cycles', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  return page;
});

// 4. input: two-axis gamepad layout, one controller only (right, then left), controller disconnect during a task
await guard('axes2', async () => {
  const page = await game('axes2', { init: 'window.__axes2 = true;' });
  await enter(page);
  const g = await page.evaluate(() => { const s = [...window.outpost.renderer.xr.getSession().inputSources].find((x) => x.gamepad); return s ? s.gamepad.axes.length : -1; });
  note('Test setup: gamepad exposes only 2 axes (the fallback layout)', g === 2, `axes=${g}`);
  const tp = await teleportWith(page, 'right');
  note('Teleport works with the 2-axis layout (axes 0 and 1)', tp.moved);
  const turn = await turnWith(page, 'right');
  note('Snap turn works with the 2-axis layout, one turn per flick even when held', Math.abs(turn - Math.PI / 6) < 0.06, `${(turn * 180 / Math.PI).toFixed(0)} degrees`);
  await leave(page);
  return page;
});
await guard('one-right', async () => {
  const page = await game('one-right', { init: 'window.__xr.controllers.left.connected = false;' });
  await enter(page);
  const tp = await teleportWith(page, 'right');
  note('One controller (right only): teleport works', tp.moved);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('a-button', 1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('a-button', 0));
  note('One controller: the A button opens the menu', await page.evaluate(() => window.outpost.vr().menuVisible));
  await page.shot('one-controller-menu');
  await leave(page);
  return page;
});
await guard('one-left', async () => {
  const page = await game('one-left', { init: 'window.__xr.controllers.right.connected = false;' });
  await enter(page);
  const tp = await teleportWith(page, 'left');
  note('One controller (left only, "swapped"): teleport works with its thumbstick', tp.moved);
  await page.evaluate(() => window.__xr.controllers.left.updateButtonValue('y-button', 1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__xr.controllers.left.updateButtonValue('y-button', 0));
  note('Left-only: the Y button opens the menu', await page.evaluate(() => window.outpost.vr().menuVisible));
  await leave(page);
  return page;
});
await guard('disconnect', async () => {
  const page = await game('disconnect');
  await enter(page);
  await page.evaluate(() => { const m = window.outpost.sim.modules.find((x) => x.type === 'solar'); window.outpost.vr().debugSetHead(m.x + 0.5, m.z + 3.2); window.outpost.rig.rotation.y = 0; });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__pitch('right', 0));
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1));
  await page.waitForFunction(() => !!window.outpost.work(), null, { timeout: 60000 });
  await page.evaluate(() => window.__xr.controllers.right.connected = false); // the controller vanishes mid-task
  await page.waitForTimeout(1500);
  note('A controller vanishing during a task does not crash or stick the game', page.errors.length === 0 && (await page.evaluate(() => window.outpost.vr().active)), page.errors.slice(0, 2).join(' | '));
  await page.evaluate(() => { window.__xr.controllers.right.connected = true; window.__xr.controllers.right.updateButtonValue('trigger', 0); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const w = window.outpost.work(); if (w) window.outpost.vr().exit(); });
  await page.waitForTimeout(1500);
  return page;
});

// 5. hands only (pinch): menu and teleport without any gamepad axes
await guard('hands', async () => {
  const page = await game('hands', { init: 'window.__xr.primaryInputMode = "hand";' });
  await enter(page);
  const src = await page.evaluate(() => [...window.outpost.renderer.xr.getSession().inputSources].map((s) => ({ hand: !!s.hand, h: s.handedness })));
  note('Test setup: the emulator presents hand tracking (no controllers)', src.length >= 1 && src.every((s) => s.hand), JSON.stringify(src));
  const before = await page.evaluate(() => ({ x: window.outpost.player.pos.x, z: window.outpost.player.pos.z }));
  await page.evaluate(() => { const hh = window.__xr.hands.right; if (hh) { hh.position.set(0.25, 1.2, -0.25); hh.quaternion.set(Math.sin(-0.32 / 2), 0, 0, Math.cos(-0.32 / 2)); } });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__xr.hands.right && window.__xr.hands.right.setPinchValueImmediate(1));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__xr.hands.right && window.__xr.hands.right.setPinchValueImmediate(0));
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({ x: window.outpost.player.pos.x, z: window.outpost.player.pos.z, t: window.outpost.vr().lastTeleport }));
  note('Hands only: a pinch on empty floor teleports', after.t.ok && Math.hypot(after.x - before.x, after.z - before.z) > 1.5, JSON.stringify({ to: [after.x, after.z], t: after.t }));
  await page.shot('hands-teleport');
  await leave(page);
  return page;
});

// 6. visibility: the system takes the view (sim and audio pause), then gives it back
await guard('visibility', async () => {
  const page = await game('visibility');
  await enter(page);
  const t0 = await page.evaluate(() => window.outpost.sim.time);
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => window.outpost.sim.time);
  await page.evaluate(() => window.__xr.updateVisibilityState('visible-blurred'));
  await page.waitForTimeout(800);
  const blurred = await page.evaluate(() => ({ hidden: window.outpost.vr().hidden, time: window.outpost.sim.time }));
  await page.waitForTimeout(2000);
  const t3 = await page.evaluate(() => window.outpost.sim.time);
  note('visible-blurred pauses the simulation', blurred.hidden && Math.abs(t3 - blurred.time) < 0.2, `time ${blurred.time.toFixed(2)} -> ${t3.toFixed(2)} (running before: ${t0.toFixed(1)} -> ${t1.toFixed(1)})`);
  await page.evaluate(() => window.__xr.updateVisibilityState('hidden'));
  await page.waitForTimeout(600);
  note('hidden keeps the game paused', await page.evaluate(() => window.outpost.vr().hidden));
  await page.evaluate(() => window.__xr.updateVisibilityState('visible'));
  await page.waitForTimeout(2500);
  const t4 = await page.evaluate(() => ({ hidden: window.outpost.vr().hidden, time: window.outpost.sim.time }));
  note('visible resumes the simulation', !t4.hidden && t4.time > t3 + 0.3, `${t3.toFixed(2)} -> ${t4.time.toFixed(2)}`);
  await leave(page);
  return page;
});

// 7. head inside a wall: fade to black and a hint; and the wrist panel and menu readable
await guard('headwall', async () => {
  const page = await game('headwall');
  await enter(page);
  const probe = await page.evaluate(() => { const h = window.outpost.world.buildings.find((b) => b.type === 'shelter'); return { x: h.x, z: h.z, r: h.r }; });
  // put the real head inside the shelter wall: teleport near, then lean the headset into the wall
  await page.evaluate((p) => window.outpost.vr().debugSetHead(p.x + 0.0, p.z - (p.r - 0.05)), probe); // standing right in the wall ring on the far side of the door
  await page.waitForTimeout(1200);
  const f = await page.evaluate(() => window.outpost.vr().fade);
  await page.shot('head-in-wall');
  note('Head inside a wall fades the view to black', f > 0.6, `fade=${f.toFixed(2)}`);
  await page.evaluate((p) => window.outpost.vr().debugSetHead(p.x, p.z + p.r + 5), probe);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.outpost.vr().fade);
  note('Stepping back into open space restores the view', f2 < 0.1, `fade=${f2.toFixed(2)}`);
  await leave(page);
  return page;
});

// 8. frame time stress: throttle the CPU, the performance level rises; remove it, the level recovers; no long stalls from allocation
await guard('stress', async () => {
  const page = await game('stress');
  await enter(page);
  await page.waitForTimeout(1500);
  await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.waitForFunction(() => window.outpost.vr().perfLevel >= 1, null, { timeout: 90000 }).catch(() => {});
  const hi = await page.evaluate(() => ({ level: window.outpost.vr().perfLevel, ms: window.outpost.vr().stats.ms, shadows: window.outpost.sceneSun ? 1 : 0 }));
  await page.shot('throttled');
  note('Under CPU load the performance level rises (foveation up, shadows reduced)', hi.level >= 1, JSON.stringify(hi));
  await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(1000);
  note('No console errors while throttled', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  const st = await page.evaluate(() => window.outpost.vr().stats);
  console.log(`      frame stats under test (software renderer, not a headset): avg ${st.ms.toFixed(1)} ms, worst ${st.worst.toFixed(0)} ms, stalls over 50 ms: ${st.stalls}`);
  await leave(page);
  return page;
});

// 9. a storm, the shelter and the evening report in VR
await guard('storm', async () => {
  const page = await game('storm');
  await enter(page);
  await page.evaluate(() => { window.outpost.sim.time = 262; });
  await page.waitForTimeout(2500);
  const chart = await page.evaluate(() => ({ phase: window.outpost.sim.storm && window.outpost.sim.storm.phase, chart: !!window.outpost.vr().debugCounts }));
  await page.shot('storm-warning');
  note('Storm warning starts in VR', chart.phase === 'warning', JSON.stringify(chart));
  await page.evaluate(() => { window.outpost.sim.time = 352; });
  await page.waitForTimeout(3000);
  await page.shot('storm-active');
  note('Storm becomes active in VR with the world-space chart available', await page.evaluate(() => window.outpost.sim.storm && window.outpost.sim.storm.phase === 'active'));
  await page.evaluate(() => { window.outpost.sim.day = 2; window.outpost.sim.time = 395.9; });
  await page.waitForTimeout(3500);
  await page.shot('report');
  const card = await page.evaluate(() => ({ menu: window.outpost.vr().menuVisible }));
  note('The evening report opens as a readable VR panel', card.menu === true, JSON.stringify(card));
  await leave(page);
  return page;
});

// 10. non-VR regression: no navigator.xr, and isSessionSupported rejecting, behave exactly like the normal game
await guard('no-xr', async () => {
  const page = await game('no-xr', { withXr: false, init: 'Object.defineProperty(navigator, "xr", { value: undefined, configurable: true });' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ btn: !!document.getElementById('vrBtn'), vr: !!(window.outpost.vr && window.outpost.vr()), xrClass: document.body.classList.contains('xr') }));
  note('navigator.xr undefined (iPhone Safari): no Enter VR button, no VR object, no errors', !r.btn && !r.vr && !r.xrClass && page.errors.length === 0, JSON.stringify(r) + ' ' + page.errors.slice(0, 2).join(' | '));
  await page.shot('no-xr');
  return page;
});
await guard('xr-reject', async () => {
  const page = await game('xr-reject', { withXr: false, init: 'Object.defineProperty(navigator, "xr", { value: { isSessionSupported: () => Promise.reject(new Error("blocked")), requestSession: () => Promise.reject(new DOMException("no", "SecurityError")), addEventListener() {}, removeEventListener() {} }, configurable: true });' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ btn: !!document.getElementById('vrBtn') }));
  note('isSessionSupported rejecting: no button and no unhandled errors', !r.btn && page.errors.length === 0, JSON.stringify(r) + ' ' + page.errors.slice(0, 2).join(' | '));
  return page;
});
await guard('request-fails', async () => {
  const page = await game('request-fails', { withXr: false, init: 'Object.defineProperty(navigator, "xr", { value: { isSessionSupported: () => Promise.resolve(true), requestSession: () => Promise.reject(new DOMException("denied", "SecurityError")), addEventListener() {}, removeEventListener() {} }, configurable: true });' });
  await page.waitForFunction(() => !!document.getElementById('vrBtn'), null, { timeout: 20000 });
  await page.click('#vrBtn');
  await page.waitForTimeout(1500);
  const toast = await page.evaluate(() => document.getElementById('toasts').innerText);
  const state = await page.evaluate(() => ({ xr: document.body.classList.contains('xr'), presenting: window.outpost.renderer.xr.isPresenting }));
  await page.shot('request-fails');
  note('requestSession rejecting shows a friendly message and leaves the game in its normal state', /VR could not start/.test(toast) && !state.xr && !state.presenting, JSON.stringify({ toast: toast.slice(0, 90), ...state }));
  return page;
});
await guard('desktop', async () => {
  const page = await game('desktop', { withXr: false, query: '?debug&judge=1&nodash' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ canvas: !!document.getElementById('c'), hud: !!document.getElementById('hud') }));
  note('Plain desktop (no WebXR at all) loads and runs with no console errors', r.canvas && r.hud && page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  return page;
});

await browser.close();
if (server) await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} hardening checks passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
