import * as THREE from 'three';
import { t, type TextKey } from '../i18n/en';

// Enterable round buildings (station and radiation shelter): floor, wall with a doorway on +z,
// dome roof, sliding door, interior light and labelled props. Original art from primitives.
export interface Building {
  group: THREE.Group;
  wall: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  door: THREE.Mesh;
  doorHalf: number; // half the doorway in radians
}

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, flatShading: true, ...o });

export function createTag(): { sprite: THREE.Sprite; set(text: string, color?: string): void } {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 0.49, 1);
  let last = '';
  return {
    sprite,
    set(text, color = '#ffffff') {
      if (text === last) return;
      last = text;
      ctx.clearRect(0, 0, 512, 96);
      ctx.font = 'bold 40px system-ui, sans-serif';
      const w = Math.min(496, ctx.measureText(text).width + 44);
      ctx.fillStyle = 'rgba(10,16,30,0.78)';
      ctx.beginPath(); ctx.roundRect(256 - w / 2, 14, w, 68, 26); ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 50, 470);
      tex.needsUpdate = true;
    },
  };
}

function label(g: THREE.Group, key: TextKey, x: number, y: number, z: number, color = '#ffe9a8', scale = 0.8): void {
  const tag = createTag();
  tag.set(t(key), color);
  tag.sprite.position.set(x, y, z);
  tag.sprite.scale.multiplyScalar(scale);
  g.add(tag.sprite);
}

function box(g: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
}

export function createBuilding(kind: 'habitat' | 'shelter', r: number): Building {
  const group = new THREE.Group();
  const doorHalf = Math.asin(1.25 / r);
  const shelter = kind === 'shelter';
  const wall = std(shelter ? 0x8d8a84 : 0xe4e7ea, { side: THREE.DoubleSide, transparent: true });
  const roof = std(shelter ? 0x7d7a75 : 0xd6dade, { side: THREE.DoubleSide, transparent: true });
  const dark = std(0x39404a), screen = std(0x1c2a1c, { emissive: shelter ? 0x55ff88 : 0x66c8ff, emissiveIntensity: 1.2 });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 24), std(shelter ? 0x5d5a55 : 0x9aa3ad));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  group.add(floor);

  const wallMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 24, 1, true, doorHalf, Math.PI * 2 - doorHalf * 2), wall);
  wallMesh.position.y = 1.5; wallMesh.castShadow = true;
  group.add(wallMesh);
  const lintel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 6, 1, true, -doorHalf, doorHalf * 2), wall);
  lintel.position.y = 2.75;
  group.add(lintel);

  const roofMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), roof);
  roofMesh.position.y = 3; roofMesh.scale.y = shelter ? 0.45 : 0.6;
  group.add(roofMesh);

  const door = box(group, 2.5, 2.5, 0.16, std(shelter ? 0xf2b632 : 0x4fc3e8), 0, 1.25, r - 0.05);
  label(group, shelter ? 'lbl_shelter' : 'lbl_station', 0, 3.7, r + 0.2, shelter ? '#ffd24a' : '#9fe0ff', 1.3);

  const light = new THREE.PointLight(shelter ? 0xfff0c8 : 0xeaf4ff, 26, r * 2.6, 1.6);
  light.position.set(0, 2.5, 0);
  group.add(light);

  if (shelter) {
    // Piled regolith around the wall: this is what stops the radiation.
    const rock = std(0x77747a, { roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const a = doorHalf + 0.25 + (i / 15) * (Math.PI * 2 - doorHalf * 2 - 0.5);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + (i % 3) * 0.3, 0), rock);
      m.position.set(Math.sin(a) * (r + 0.5), 0.7 + (i % 2) * 0.5, Math.cos(a) * (r + 0.5));
      m.rotation.set(i, i * 2, i * 3); m.castShadow = true;
      group.add(m);
    }
    box(group, 1.2, 1.5, 0.5, dark, 0, 0.75, -r + 0.9);
    box(group, 0.9, 0.5, 0.1, screen, 0, 1.15, -r + 1.17);
    label(group, 'lbl_radmon', 0, 2.2, -r + 1.0);
    for (const [x, z, ry] of [[-2.2, -2.2, 0.8], [0, -2.9, 0], [2.2, -2.2, -0.8]]) box(group, 1.5, 0.45, 0.6, dark, x, 0.25, z).rotation.y = ry;
    box(group, 0.9, 0.9, 0.9, std(0xb58a4a), 2.9, 0.5, 1.0);
    box(group, 0.7, 0.7, 0.7, std(0xb58a4a), 2.7, 1.3, 1.1);
    label(group, 'lbl_supplies', 2.8, 2.1, 1.0);
  } else {
    box(group, 2.4, 1.0, 0.7, dark, 0, 0.5, -r + 1.0);
    box(group, 2.0, 0.8, 0.1, screen, 0, 1.5, -r + 0.75);
    label(group, 'lbl_control', 0, 2.4, -r + 0.9);
    const o2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.9, 8), std(0x4fc3e8));
    o2.position.set(-r + 1.5, 0.95, -1.8); group.add(o2);
    label(group, 'lbl_oxygen', -r + 1.5, 2.4, -1.8);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.1, 3, 8), std(0x3d6fd8));
    tank.position.set(r - 1.5, 1.15, -1.8); group.add(tank);
    label(group, 'lbl_water', r - 1.5, 2.4, -1.8);
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), r - 2.0, 0.5, 1.6);
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), r - 2.0, 1.45, 1.6);
    box(group, 0.12, 1.6, 0.12, dark, r - 1.1, 0.8, 2.0);
    label(group, 'lbl_bunks', r - 2.0, 2.3, 1.6);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10), std(0xe8e2d0));
    table.position.set(-r + 2.6, 0.8, 1.4); group.add(table);
    box(group, 0.2, 0.75, 0.2, dark, -r + 2.6, 0.4, 1.4);
    label(group, 'lbl_canteen', -r + 2.6, 2.2, 1.4);
  }
  return { group, wall, roof, door, doorHalf };
}

// Marker floating over a module: red "!" for broken, yellow star for a job waiting.
export function createMarker(glyph: string, fill: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(1.5, 1.5, 1);
  s.renderOrder = 10;
  return s;
}
