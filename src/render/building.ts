import * as THREE from 'three';
import { t, type TextKey } from '../i18n/en';
import { STATION } from '../game/layout';

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
    const S = STATION;
    // Control / comms desk and engineering (upgrade) console on the back wall
    box(group, 1.9, 1.0, 0.7, dark, S.control.x, 0.5, S.control.z);
    box(group, 1.6, 0.7, 0.1, screen, S.control.x, 1.45, S.control.z - 0.3);
    label(group, 'lbl_control', S.control.x, 2.4, S.control.z);
    box(group, 1.9, 1.0, 0.7, std(0x2a3550), S.engineering.x, 0.5, S.engineering.z);
    box(group, 1.6, 0.7, 0.1, std(0x2a2a10, { emissive: 0xffc840, emissiveIntensity: 1.1 }), S.engineering.x, 1.45, S.engineering.z - 0.3);
    label(group, 'lbl_engineering', S.engineering.x, 2.4, S.engineering.z, '#ffd24a');
    // Oxygen unit and water tank
    const o2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.9, 8), std(0x4fc3e8));
    o2.position.set(S.o2.x, 0.95, S.o2.z); group.add(o2);
    label(group, 'lbl_oxygen', S.o2.x, 2.4, S.o2.z);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.1, 3, 8), std(0x3d6fd8));
    tank.position.set(S.water.x, 1.15, S.water.z); group.add(tank);
    label(group, 'lbl_water', S.water.x, 2.4, S.water.z);
    // Bunks
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), S.bunks.x, 0.5, S.bunks.z);
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), S.bunks.x, 1.45, S.bunks.z);
    box(group, 0.12, 1.6, 0.12, dark, S.bunks.x + 0.9, 0.8, S.bunks.z + 0.4);
    label(group, 'lbl_bunks', S.bunks.x, 2.3, S.bunks.z);
    // Galley table
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10), std(0xe8e2d0));
    table.position.set(S.canteen.x, 0.8, S.canteen.z); group.add(table);
    box(group, 0.2, 0.75, 0.2, dark, S.canteen.x, 0.4, S.canteen.z);
    label(group, 'lbl_canteen', S.canteen.x, 2.2, S.canteen.z);
    // Exercise machine: a treadmill-style belt with handrails
    box(group, 0.9, 0.18, 1.8, dark, S.exercise.x, 0.12, S.exercise.z);
    box(group, 0.9, 0.9, 0.12, dark, S.exercise.x, 1.0, S.exercise.z - 0.9);
    box(group, 0.7, 0.4, 0.08, screen, S.exercise.x, 1.25, S.exercise.z - 0.83);
    label(group, 'lbl_exercise', S.exercise.x, 2.2, S.exercise.z - 0.5);
    // Medical corner: a bed and a scanner arch
    box(group, 0.9, 0.35, 1.9, std(0xdfe8f2), S.medical.x, 0.4, S.medical.z);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 6, 14, Math.PI), std(0x6fd3a8));
    arch.position.set(S.medical.x, 0.55, S.medical.z); arch.rotation.y = Math.PI / 2; group.add(arch);
    label(group, 'lbl_medical', S.medical.x, 2.0, S.medical.z);
    // Cupola-style window on the back wall
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), std(0x0a1430, { emissive: 0x1a2a66, emissiveIntensity: 0.9 }));
    win.position.set(S.window.x, 1.7, S.window.z - 1.4); group.add(win);
    label(group, 'lbl_window', S.window.x, 2.75, S.window.z - 1.3, '#9fe0ff', 0.6);
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
