import * as THREE from 'three';
import type { ModuleType } from '../sim/sim.ts';

// Chunky low-poly models built from primitives. Original art, no external assets.
const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, flatShading: true, ...opts });

const M = {
  hull: mat(0xe4e7ea),
  dark: mat(0x3a4048),
  panel: mat(0x1d3f8f, { roughness: 0.3, metalness: 0.5 }),
  yellow: mat(0xf2b632),
  cyan: mat(0x4fc3e8),
  green: mat(0x4caf50),
  glass: mat(0xa8f0c0, { transparent: true, opacity: 0.45, roughness: 0.2 }),
  rock: mat(0x77777c, { roughness: 1 }),
  visor: mat(0x1a1a22, { roughness: 0.15, metalness: 0.8 }),
  window: mat(0xffe9a8, { emissive: 0xffc860, emissiveIntensity: 0.8 }),
};

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

export function createModuleModel(type: ModuleType): THREE.Group {
  const g = new THREE.Group();
  switch (type) {
    case 'habitat': {
      add(g, new THREE.CylinderGeometry(4, 4.2, 3, 12), M.hull, 0, 1.5, 0);
      add(g, new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.hull, 0, 3, 0);
      add(g, new THREE.BoxGeometry(1.6, 2.3, 0.6), M.dark, 0, 1.15, 4);
      add(g, new THREE.BoxGeometry(1.0, 0.5, 0.2), M.window, 2.2, 2.0, 3.45).rotation.y = 0.55;
      add(g, new THREE.BoxGeometry(1.0, 0.5, 0.2), M.window, -2.2, 2.0, 3.45).rotation.y = -0.55;
      add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), M.dark, 1.5, 7.2, -1);
      break;
    }
    case 'solar': {
      add(g, new THREE.CylinderGeometry(0.16, 0.22, 1.8, 6), M.dark, 0, 0.9, 0);
      const p = add(g, new THREE.BoxGeometry(3.2, 0.12, 2), M.panel, 0, 1.95, 0);
      p.rotation.x = -0.5;
      const f = add(g, new THREE.BoxGeometry(3.4, 0.08, 2.2), M.hull, 0, 1.9, 0.03);
      f.rotation.x = -0.5;
      break;
    }
    case 'battery': {
      add(g, new THREE.BoxGeometry(1.7, 1.3, 1.2), M.dark, 0, 0.65, 0);
      add(g, new THREE.BoxGeometry(1.75, 0.3, 1.25), M.yellow, 0, 0.9, 0);
      add(g, new THREE.BoxGeometry(0.3, 0.25, 0.3), M.hull, -0.45, 1.42, 0);
      add(g, new THREE.BoxGeometry(0.3, 0.25, 0.3), M.hull, 0.45, 1.42, 0);
      break;
    }
    case 'lifeSupport': {
      add(g, new THREE.CylinderGeometry(1.0, 1.15, 2.4, 8), M.hull, 0, 1.2, 0);
      add(g, new THREE.CylinderGeometry(1.05, 1.05, 0.35, 8), M.cyan, 0, 1.6, 0);
      add(g, new THREE.SphereGeometry(0.55, 8, 6), M.cyan, 0, 2.7, 0);
      add(g, new THREE.BoxGeometry(0.5, 0.9, 0.5), M.dark, 1.15, 0.45, 0);
      break;
    }
    case 'tank': {
      const body = add(g, new THREE.CapsuleGeometry(0.85, 1.7, 3, 8), M.cyan, 0, 1.25, 0);
      body.rotation.z = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.25, 0.9, 1.5), M.dark, -0.8, 0.45, 0);
      add(g, new THREE.BoxGeometry(0.25, 0.9, 1.5), M.dark, 0.8, 0.45, 0);
      break;
    }
    case 'greenhouse': {
      add(g, new THREE.BoxGeometry(4.4, 0.4, 3.4), M.hull, 0, 0.2, 0);
      const dome = add(g, new THREE.CylinderGeometry(1.7, 1.7, 4.2, 10, 1, false, 0, Math.PI), M.glass, 0, 0.4, 0);
      dome.rotation.z = Math.PI / 2;
      dome.rotation.y = Math.PI / 2;
      dome.castShadow = false;
      for (let i = -1; i <= 1; i++) {
        add(g, new THREE.BoxGeometry(0.9, 0.3, 2.4), M.dark, i * 1.3, 0.55, 0).castShadow = false;
        add(g, new THREE.ConeGeometry(0.4, 0.9, 5), M.green, i * 1.3, 1.1, 0.5).castShadow = false;
        add(g, new THREE.ConeGeometry(0.35, 0.8, 5), M.green, i * 1.3, 1.05, -0.5).castShadow = false;
      }
      break;
    }
  }
  return g;
}

export function createRockPile(): THREE.Group {
  const g = new THREE.Group();
  const spots = [[0, 0.5, 0, 0.9], [0.9, 0.35, 0.4, 0.6], [-0.8, 0.3, 0.5, 0.55], [0.2, 0.3, -0.9, 0.6], [-0.5, 1.1, -0.1, 0.45]];
  for (const [x, y, z, r] of spots) {
    const m = add(g, new THREE.DodecahedronGeometry(r, 0), M.rock, x, y, z);
    m.rotation.set(x * 3, y * 5, z * 2);
  }
  return g;
}

export interface Astronaut {
  group: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
}

export function createAstronaut(suitColor: number): Astronaut {
  const group = new THREE.Group();
  const suit = mat(0xf0f0f0);
  const accent = mat(suitColor);
  add(group, new THREE.BoxGeometry(0.62, 0.7, 0.4), suit, 0, 1.15, 0);
  add(group, new THREE.BoxGeometry(0.64, 0.16, 0.42), accent, 0, 1.3, 0);
  add(group, new THREE.BoxGeometry(0.5, 0.6, 0.26), accent, 0, 1.2, -0.3);
  add(group, new THREE.SphereGeometry(0.3, 8, 6), suit, 0, 1.78, 0);
  add(group, new THREE.SphereGeometry(0.22, 8, 6), M.visor, 0, 1.78, 0.14);

  const limb = (x: number, y: number, w: number, len: number, m: THREE.Material): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    add(pivot, new THREE.BoxGeometry(w, len, w), m, 0, -len / 2, 0);
    group.add(pivot);
    return pivot;
  };
  const legL = limb(-0.17, 0.82, 0.24, 0.82, suit);
  const legR = limb(0.17, 0.82, 0.24, 0.82, suit);
  const armL = limb(-0.43, 1.45, 0.2, 0.65, accent);
  const armR = limb(0.43, 1.45, 0.2, 0.65, accent);
  return { group, legL, legR, armL, armR };
}

export function createLabel(text: string, color = '#ffffff', bg = 'rgba(10,16,30,0.7)'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(8, 8, 240, 48, 20); ctx.fill();
  ctx.fillStyle = color;
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1);
  return s;
}

export function createAlert(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 92px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Drawn on top of everything so a broken module can be spotted from across the base.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(1.5, 1.5, 1);
  s.renderOrder = 10;
  return s;
}
