// Static checks for the VR code: node scripts/vr-static-check.mjs   (npm run vr:static)
// Fails if code under src/vr/ breaks the rules that keep VR smooth and separate from the desktop game:
//  - no requestAnimationFrame (the game has exactly one render loop, renderer.setAnimationLoop)
//  - no window.innerWidth/innerHeight (the headset sets the size)
//  - no DOM access (document.*) except creating canvases for textures
//  - no pointer lock, fullscreen or orientation lock
//  - no console.log in the VR code
//  - no object allocation inside the per-frame functions (new Vector3/Quaternion/Matrix/Ray/Euler/Raycaster, .clone(), arrays/objects built with map/filter/spread)
// It also checks that main.ts never calls requestAnimationFrame for rendering.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dir = path.join(root, 'src/vr');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f));
const problems = [];
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

// Names of the functions that run every frame (called from update(), directly or indirectly)
const HOT = ['update', 'perfTick', 'head', 'placeInFront', 'follow', 'rayOf', 'arcToGround', 'finishAim', 'walkable', 'snapTurn', 'setHeadXZ', 'locoRec', 'pointerRec', 'connectedCount', 'hit'];

function bodyOf(src, name) {
  // finds "name(" declared as a method and returns its body by brace matching
  const re = new RegExp(`(^|\\n)\\s*(?:private |public |static |async )*${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^\\{;]+)?\\s*\\{`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, depth = 1;
    while (i < src.length && depth > 0) { const ch = src[i++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
    out.push({ start: m.index, text: src.slice(re.lastIndex - 1, i), line: src.slice(0, m.index).split('\n').length + 1 });
  }
  return out;
}

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  const src = stripComments(raw);
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const ban = (re, why) => { let m; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); while ((m = r.exec(src))) problems.push(`${rel}:${lineOf(m.index)}  ${why}: ${m[0].trim()}`); };
  ban(/requestAnimationFrame/, 'requestAnimationFrame is not allowed (use the single renderer.setAnimationLoop)');
  ban(/\binner(Width|Height)\b/, 'window size read in the VR path');
  ban(/\bdocument\.(?!createElement\('canvas'\))\w+/, 'DOM access in the VR path');
  ban(/requestPointerLock|exitPointerLock|requestFullscreen|orientation\.lock/, 'desktop-only API in the VR path');
  ban(/console\.(log|debug|info)/, 'console logging in the VR path');
  for (const name of HOT) {
    for (const b of bodyOf(src, name)) {
      const body = b.text;
      const lines = body.split('\n');
      lines.forEach((ln, k) => {
        const where = `${rel}:${b.line + k}  per-frame function "${name}" allocates`;
        if (/\bnew\s+THREE\.(Vector[234]|Quaternion|Matrix[34]|Ray|Euler|Raycaster|Box3|Sphere|Plane|Color)\b/.test(ln)) problems.push(`${where}: ${ln.trim()}`);
        else if (/\.clone\(\)/.test(ln)) problems.push(`${where}: ${ln.trim()}`);
        else if (/\.(map|filter|slice|concat)\(/.test(ln) && !/Array\.from/.test(ln)) problems.push(`${where}: ${ln.trim()}`);
        else if (/\[\.\.\./.test(ln) || /\{\s*\.\.\./.test(ln)) problems.push(`${where}: ${ln.trim()}`);
        else if (/=>\s*\{?/.test(ln) && /\b(forEach|find|some|every)\(/.test(ln)) problems.push(`${where} (closure): ${ln.trim()}`);
      });
    }
  }
}

// The game's own loop: exactly one setAnimationLoop and no rAF render loop in main.ts
const main = stripComments(fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8'));
const loops = (main.match(/setAnimationLoop\(/g) ?? []).length;
if (loops !== 1) problems.push(`src/main.ts: expected exactly one setAnimationLoop, found ${loops}`);
// The only allowed use is the DOM fade-from-black helper for the desktop work view (it is never used in VR: startWork returns early when presenting)
const rafLines = main.split('\n').filter((l) => /requestAnimationFrame/.test(l) && !/workFade/.test(l));
if (rafLines.length) problems.push('src/main.ts: requestAnimationFrame found outside the DOM fade helper (rendering must use renderer.setAnimationLoop): ' + rafLines[0].trim().slice(0, 80));

if (problems.length) { console.log(problems.join('\n')); console.log(`\nvr static check: ${problems.length} problem(s)`); process.exit(1); }
console.log(`vr static check passed: ${files.length} file(s) in src/vr/, one render loop, no banned APIs, no per-frame allocation in ${HOT.length} hot functions`);
