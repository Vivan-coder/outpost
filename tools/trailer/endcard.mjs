// Renders the end title card (1920x1080 PNG) with a locally generated QR code: node endcard.mjs <out.png>
import { chromium } from 'playwright-core';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.resolve(here, '../../docs/trailer/out/endcard.png');
const { url } = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'H', margin: 4, width: 560, color: { dark: '#000000', light: '#ffffff' } });
let stars = '';
let a = 7;
const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
for (let i = 0; i < 160; i++) stars += `<i style="left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 100).toFixed(2)}%;width:${(1 + rnd() * 2).toFixed(1)}px;height:${(1 + rnd() * 2).toFixed(1)}px;opacity:${(0.3 + rnd() * 0.7).toFixed(2)}"></i>`;
const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0} html,body{width:1920px;height:1080px;overflow:hidden;background:#02030a;color:#fff;font-family:system-ui,'Segoe UI',Arial,sans-serif}
  body{background:radial-gradient(ellipse at 50% 30%,#10204a 0%,#050a1c 55%,#02030a 100%);position:relative}
  i{position:absolute;background:#fff;border-radius:50%}
  .logo{position:absolute;top:70px;left:0;right:0;text-align:center;font-weight:900;font-size:170px;letter-spacing:.28em;text-indent:.28em;text-shadow:0 0 60px #5f9bff}
  .play{position:absolute;top:290px;left:0;right:0;text-align:center;font-size:66px;font-weight:800;color:#ffd24a}
  .url{position:absolute;top:410px;left:0;width:1130px;text-align:center;font-size:72px;font-weight:900;word-break:break-all;line-height:1.15;padding:0 40px}
  .qr{position:absolute;top:380px;right:150px;width:560px;height:560px;border-radius:24px;overflow:hidden;box-shadow:0 0 50px #5f9bff88}
  .qr img{width:100%;height:100%;display:block}
  .line{position:absolute;left:0;width:1130px;text-align:center;font-size:42px;font-weight:700;color:#cfe3ff;padding:0 30px}
  .l1{top:610px;font-size:56px;color:#fff;font-weight:800} .l2{top:690px} .l3{top:790px;font-size:36px;color:#9fb8e8;font-weight:600}
  .bar{position:absolute;left:0;right:0;height:3.2vh;background:#000} .t{top:0}.b{bottom:0}
</style><body>${stars}<div class="logo">OUTPOST</div><div class="play">Play free in your browser</div>
<div class="url">${url.replace(/^https?:\/\//, '')}</div><div class="qr"><img src="${qr}"></div>
<div class="line l1">Start your space journey</div><div class="line l2">NASA data: DONKI, RadLab, OSDR</div><div class="bar t"></div><div class="bar b"></div></body>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(300);
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out, 'for', url);
