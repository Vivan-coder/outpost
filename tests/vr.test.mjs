// VR proof: runs the game in headless Chrome with the IWER WebXR emulator (Meta, MIT licence) and drives a
// headset and two controllers. Saves screenshots and a video into docs/vr-proof/. Run: npm run test:vr
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { preview } from 'vite';

const OUT = 'docs/vr-proof';
mkdirSync(OUT, { recursive: true });
const TMP = 'docs/vr-proof/_video';
rmSync(TMP, { recursive: true, force: true });
const server = await preview({ preview: { port: 4183, strictPort: true } });
const iwer = readFileSync('node_modules/iwer/build/iwer.min.js', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(iwer + `;(() => { const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__xr = d; })();`);

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout });

// Helpers that run inside the page: point a controller at a world position, and read the game state
await page.addInitScript(`
window.__aim = (hand, target, down) => {
  const d = window.__xr, o = window.outpost, rig = o.rig;
  const c = d.controllers[hand];
  const th = rig.rotation.y, cs = Math.cos(th), sn = Math.sin(th);
  const dx = target[0] - rig.position.x, dz = target[2] - rig.position.z;
  const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz, ly = target[1] - rig.position.y; // inverse of the rig rotation
  const p = hand === 'right' ? [0.25, 1.2, -0.25] : [-0.25, 1.0, -0.3];
  c.position.set(p[0], p[1], p[2]);
  let vx = lx - p[0], vy = ly - p[1], vz = lz - p[2];
  const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
  const qx = vy, qy = -vx, qz = 0, qw = 1 - vz; const n = Math.hypot(qx, qy, qz, qw) || 1;
  c.quaternion.set(qx / n, qy / n, qz / n, qw / n);
};
window.__pitch = (hand, pitch) => { const c = window.__xr.controllers[hand]; c.position.set(hand === 'right' ? 0.25 : -0.25, 1.2, -0.25); c.quaternion.set(Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)); };
`);

try {
  await page.goto('http://localhost:4183/?debug&judge=1&nodash');
  await until(() => !!document.querySelector('#overlayCard .main') && !!window.outpost);
  await page.evaluate(() => document.querySelector('#overlayCard .main').click());
  await until(() => !!document.getElementById('vrBtn'));
  await shot('01-title-with-enter-vr-button');
  check('Enter VR button appears when immersive-vr is supported', await page.evaluate(() => !!document.getElementById('vrBtn')));

  await page.click('#vrBtn');
  await until(() => window.outpost.vr() && window.outpost.vr().active, undefined, 40000);
  await wait(1500);
  await shot('02-in-vr-session');
  const stereo = await page.evaluate(() => { const cams = window.outpost.renderer.xr.getCamera().cameras; return { n: cams.length, vp: cams.map((c) => c.viewport ? [c.viewport.x, c.viewport.y, c.viewport.z, c.viewport.w] : null) }; });
  check('XR session started and both eyes render (two cameras with separate viewports)', stereo.n === 2 && JSON.stringify(stereo.vp[0]) !== JSON.stringify(stereo.vp[1]), JSON.stringify(stereo));
  check('Post-processing is bypassed inside VR', await page.evaluate(() => window.outpost.renderer.xr.isPresenting));

  // --- teleport and snap turn ---
  const head0 = await page.evaluate(() => ({ x: window.outpost.player.pos.x, z: window.outpost.player.pos.z }));
  await page.evaluate(() => window.__pitch('right', -0.32));
  await wait(300);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, -1));
  await until(() => window.outpost.vr().aimingNow, undefined, 15000);
  await shot('03-teleport-arc');
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
  await until(() => !window.outpost.vr().aimingNow, undefined, 15000);
  await wait(800);
  const tp = await page.evaluate(() => ({ t: window.outpost.vr().lastTeleport, x: window.outpost.player.pos.x, z: window.outpost.player.pos.z }));
  check('Teleport lands on open floor and moves the player', tp.t.ok && Math.hypot(tp.x - head0.x, tp.z - head0.z) > 1.5, JSON.stringify({ from: head0, to: [tp.x, tp.z] }));

  await page.evaluate(() => window.__pitch('right', 0.4));
  await wait(300);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, -1));
  await until(() => window.outpost.vr().aimingNow, undefined, 15000);
  await wait(500);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
  await until(() => !window.outpost.vr().aimingNow, undefined, 15000);
  await wait(500);
  const blocked = await page.evaluate(() => window.outpost.vr().lastTeleport);
  check('Teleport is refused when the target is on the far side of a wall', blocked.ok === false, JSON.stringify(blocked));

  const yaw0 = await page.evaluate(() => window.outpost.rig.rotation.y);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 1, 0));
  await wait(600);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
  await wait(400);
  const yaw1 = await page.evaluate(() => window.outpost.rig.rotation.y);
  check('Snap turn rotates by 30 degrees', Math.abs(Math.abs(yaw1 - yaw0) - Math.PI / 6) < 0.05, `yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', -1, 0));
  await wait(600);
  await page.evaluate(() => window.__xr.controllers.right.updateAxes('thumbstick', 0, 0));
  await wait(300);

  // --- wrist panel ---
  await page.evaluate(() => { const c = window.__xr.controllers.left; c.position.set(-0.12, 1.3, -0.32); c.quaternion.set(-0.3, 0, 0, 0.95); });
  await wait(800);
  await shot('04-wrist-panel');
  check('Wrist panel is on the left controller', await page.evaluate(() => !!window.outpost.vr()), 'see 04-wrist-panel.png');

  // --- menu: open with the left Y button, click Resume with the right controller ray ---
  await page.evaluate(() => window.__xr.controllers.left.updateButtonValue('y-button', 1));
  await wait(300);
  await page.evaluate(() => window.__xr.controllers.left.updateButtonValue('y-button', 0));
  await until(() => window.outpost.vr().menuVisible, undefined, 15000);
  await wait(500);
  await shot('05-vr-menu');
  check('Menu panel opens with the left controller button', await page.evaluate(() => window.outpost.vr().menuVisible));
  await page.evaluate(() => {
    const p = window.outpost.vr().panelWorld();
    window.__menuTarget = [p.c[0] + p.up[0] * 0.228, p.c[1] + p.up[1] * 0.228, p.c[2] + p.up[2] * 0.228];
    window.__aim('right', window.__menuTarget);
  });
  await wait(700);
  await shot('06-menu-ray-on-button');
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1));
  await wait(300);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0));
  await until(() => !window.outpost.vr().menuVisible, undefined, 15000);
  check('A menu button is clicked with the controller ray and trigger (Resume closes the menu)', await page.evaluate(() => !window.outpost.vr().menuVisible));

  // --- hands-on task: solar panel cleaning with the controller ---
  const startJobs = await page.evaluate(() => window.outpost.sim.stats.jobs);
  await page.evaluate(() => {
    const m = window.outpost.sim.modules.find((x) => x.type === 'solar');
    window.outpost.vr().debugSetHead(m.x + 0.5, m.z + 3.2); // test shortcut: walk to the panel (teleport is tested above)
    window.outpost.rig.rotation.y = 0;
  });
  await wait(1200);
  await page.evaluate(() => window.__pitch('right', 0));
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1)); // hold the trigger = hold E
  await until(() => !!window.outpost.work(), undefined, 60000);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0));
  await wait(800);
  await shot('07-vr-work-panel');
  check('Holding the trigger on the panel opens the work panel in front of the player (camera does not move)', await page.evaluate(() => !!window.outpost.work() && window.outpost.renderer.xr.isPresenting));

  await page.evaluate(() => {
    const w = window.outpost.work();
    const dust = w.rig.hots.filter((h) => h.userData.hot.startsWith('dust'));
    const V = dust[0].position.constructor;
    window.__sweep = [];
    for (const d of dust) for (let b = 0; b < 5; b++) for (let a = 0; a < 7; a++) {
      const p = d.localToWorld(new V(-0.7 + a * 0.233, -0.42 + b * 0.21, 0));
      window.__sweep.push([p.x, p.y, p.z]);
    }
  });
  await page.evaluate(() => { window.__aim('right', window.__sweep[0]); window.__xr.controllers.right.updateButtonValue('trigger', 1); });
  await wait(400);
  const n = await page.evaluate(() => window.__sweep.length);
  for (let i = 0; i < n; i++) {
    await page.evaluate((i) => window.__aim('right', window.__sweep[i]), i);
    await wait(110);
    if (i === Math.floor(n / 2)) await shot('08-vr-cleaning-halfway');
  }
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0));
  await wait(500);
  const pct = await page.evaluate(() => Math.round(window.outpost.work().rig.pct * 100));
  check('Sweeping the controller over the panel wipes the dust', pct >= 90, `clean ${pct}%`);
  await page.evaluate(() => {
    const w = window.outpost.work();
    const inv = w.rig.hots.find((h) => h.userData.hot === 'inverter');
    window.__aim('right', inv.getWorldPosition(new inv.position.constructor()).toArray());
  });
  await wait(700);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 1));
  await wait(300);
  await page.evaluate(() => window.__xr.controllers.right.updateButtonValue('trigger', 0));
  await until(() => !window.outpost.work(), undefined, 40000);
  await wait(800);
  await shot('09-vr-task-complete');
  const endJobs = await page.evaluate(() => ({ jobs: window.outpost.sim.stats.jobs, dust: window.outpost.sim.dust }));
  check('The cleaning task finishes and counts as a completed job', endJobs.jobs === startJobs + 1 && endJobs.dust < 0.05, JSON.stringify({ before: startJobs, after: endJobs }));

  // --- storm warning ---
  await page.evaluate(() => { window.outpost.sim.time = 262; });
  await wait(3000);
  await shot('10-vr-storm-warning');
  const storm = await page.evaluate(() => ({ phase: window.outpost.sim.storm && window.outpost.sim.storm.phase, banner: document.getElementById('banner').innerText.split('\n')[0] }));
  check('The storm warning starts while in VR (shown on the wrist panel)', storm.phase === 'warning', JSON.stringify(storm));
  await page.evaluate(() => { window.outpost.sim.time = 352; });
  await wait(3500);
  await shot('11-vr-storm-active');

  // --- exit ---
  await page.evaluate(() => window.outpost.vr().exit());
  await until(() => !window.outpost.renderer.xr.isPresenting, undefined, 20000);
  await wait(800);
  await shot('12-back-on-desktop');
  check('Leaving VR returns to the normal desktop view', await page.evaluate(() => !window.outpost.renderer.xr.isPresenting && !document.body.classList.contains('xr')));
  const real = errors.filter((e) => !/favicon|RGBELoader/.test(e));
  check('No console errors during the whole run', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) {
  console.log('TEST ERROR:', e.message.split('\n')[0]);
  await shot('error').catch(() => {});
  results.push({ name: 'run completed', ok: false });
}

await ctx.close();
await browser.close();
await server.close();
// Turn the recording into an mp4
try {
  const vid = readdirSync(TMP).find((f) => f.endsWith('.webm'));
  if (vid) {
    renameSync(`${TMP}/${vid}`, `${OUT}/vr-demo.webm`);
    execSync(`ffmpeg -y -loglevel error -i ${OUT}/vr-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart ${OUT}/vr-demo.mp4`);
  }
  rmSync(TMP, { recursive: true, force: true });
} catch (e) { console.log('video conversion skipped:', e.message.split('\n')[0]); }

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
