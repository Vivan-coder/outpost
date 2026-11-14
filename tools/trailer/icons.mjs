// Draws the home-screen icons (original art: a Moon with a base dome under a star field) into public/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../../public');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0"><canvas id=c width=${size} height=${size}></canvas></body>`);
  await page.evaluate((S) => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    const bg = g.createRadialGradient(S * .5, S * .35, 0, S * .5, S * .5, S * .8); bg.addColorStop(0, '#14275a'); bg.addColorStop(1, '#02030a');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    let a = 11; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; g.beginPath(); g.arc(rnd() * S, rnd() * S * 0.7, S * 0.004 + rnd() * S * 0.006, 0, 7); g.fill(); }
    const sun = g.createRadialGradient(S * .78, S * .22, 0, S * .78, S * .22, S * .2); sun.addColorStop(0, '#fff6c8'); sun.addColorStop(.35, '#ffb030'); sun.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = sun; g.beginPath(); g.arc(S * .78, S * .22, S * .2, 0, 7); g.fill();
    g.fillStyle = '#8d8a84'; g.beginPath(); g.ellipse(S * .5, S * 1.35, S * 1.1, S * .66, 0, 0, 7); g.fill(); // the Moon
    g.fillStyle = '#e4e7ea'; g.beginPath(); g.arc(S * .42, S * .72, S * .2, Math.PI, 0); g.fill(); // base dome
    g.fillStyle = '#4fc3e8'; g.fillRect(S * .4, S * .66, S * .05, S * .06);
    g.fillStyle = '#fff'; g.font = `900 ${S * .15}px system-ui, Arial`; g.textAlign = 'center'; g.letterSpacing = `${S * .02}px`;
    g.fillText('OUTPOST', S * .5, S * .93);
  }, size);
  const data = await page.locator('#c').screenshot({ type: 'png' });
  fs.writeFileSync(path.join(pub, `icon-${size}.png`), data);
  await page.close();
}
await browser.close();
console.log('icons written to', pub);
