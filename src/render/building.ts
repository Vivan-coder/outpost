import * as THREE from 'three';
import { t, type TextKey } from '../i18n/en';
import { STATION } from '../game/layout';
import type { TextKey as TK } from '../i18n/en';
void (0 as unknown as TK);

// Enterable round buildings (station and radiation shelter): floor, wall with a doorway on +z,
// dome roof, sliding door, interior light and labelled props. Original art from primitives.
export interface Building {
  group: THREE.Group;
  // Storage that fills and empties with the meters: tank gauges, food locker gauge, spare-part crates
  fills: { air: THREE.Mesh[]; food: THREE.Mesh[]; crates: THREE.Mesh[] };
  // Live number labels above the gauges (Oxygen 54%, Food 62%)
  tags: { air: ReturnType<typeof createTag>[]; food: ReturnType<typeof createTag>[] };
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

// The piled regolith around the shelter wall: where each rock sits and how big it is (shared by the model and by collision)
export function shelterRockSpots(r: number): { x: number; z: number; size: number }[] {
  const doorHalf = Math.asin(1.25 / r);
  const out: { x: number; z: number; size: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = doorHalf + 0.25 + (i / 15) * (Math.PI * 2 - doorHalf * 2 - 0.5);
    out.push({ x: Math.sin(a) * (r + 0.5), z: Math.cos(a) * (r + 0.5), size: 1.1 + (i % 3) * 0.3 });
  }
  return out;
}

export function createBuilding(kind: 'habitat' | 'shelter', r: number): Building {
  const group = new THREE.Group();
  const doorHalf = Math.asin(1.25 / r);
  const shelter = kind === 'shelter';
  const fills: Building['fills'] = { air: [], food: [], crates: [] };
  const tags: Building['tags'] = { air: [], food: [] };
  const liveTag = (list: ReturnType<typeof createTag>[], x: number, y: number, z: number) => { const tg = createTag(); tg.sprite.position.set(x, y, z); tg.sprite.scale.multiplyScalar(0.95); tg.sprite.renderOrder = 5; group.add(tg.sprite); list.push(tg); };
  const STATION_R_PLACE = r;
  // A level gauge: a dark slot with a bar that is scaled from the sim each frame (the bar grows up from its base)
  const gauge = (x: number, z: number, color: number): THREE.Mesh => {
    const slot = box(group, 0.16, 1.5, 0.06, std(0x15171c), x, 1.0, z);
    slot.rotation.y = 0;
    const geo = new THREE.BoxGeometry(0.1, 1.4, 0.2); geo.translate(0, 0.7, 0);
    const bar = new THREE.Mesh(geo, std(color, { emissive: color, emissiveIntensity: 0.7 }));
    bar.position.set(x, 0.3, z); group.add(bar);
    return bar;
  };
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
    shelterRockSpots(r).forEach((sp, i) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(sp.size, 0), rock);
      m.position.set(sp.x, 0.7 + (i % 2) * 0.5, sp.z);
      m.rotation.set(i, i * 2, i * 3); m.castShadow = true;
      group.add(m);
    });
    box(group, 1.2, 1.5, 0.5, dark, 0, 0.75, -3.2);
    box(group, 0.9, 0.5, 0.1, screen, 0, 1.15, -2.93);
    label(group, 'lbl_radmon', 0, 2.2, -3.2);
    for (const [x, z, ry] of [[-2.2, -2.2, 0.8], [0, -2.9, 0], [2.2, -2.2, -0.8]]) box(group, 1.5, 0.45, 0.6, dark, x, 0.25, z).rotation.y = ry;
    box(group, 0.9, 0.9, 0.9, std(0xb58a4a), 2.9, 0.5, 1.0);
    box(group, 0.7, 0.7, 0.7, std(0xb58a4a), 2.7, 1.3, 1.1);
    label(group, 'lbl_supplies', 2.8, 2.1, 1.0);
  } else {
    const S = STATION;
    // Zone floor tiles with a label each, so the base reads as separate areas
    const tile = (x: number, z: number, w: number, d: number, color: number, key: TextKey) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(x, 0.075, z); m.receiveShadow = true; group.add(m);
      label(group, key, x, 0.45, z, '#ffffff', 0.55);
    };
    tile(-2.2, -4.2, 3.2, 2.8, 0x2f4f8f, 'zone_control');
    tile(2.2, -4.2, 3.2, 2.8, 0x8f7a2f, 'zone_engineering');
    tile(-5.0, 0.3, 2.6, 3.8, 0x2f7f8f, 'zone_life');
    tile(-3.0, 3.2, 3.8, 3.0, 0x8f5a2f, 'zone_galley');
    tile(3.4, 0.4, 3.6, 4.4, 0x2f8f5a, 'zone_medical');
    // Airlock by the door: striped floor and suit lockers
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.22), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x15171c : 0xf2b632, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      stripe.position.set(0, 0.075, STATION_R_PLACE - 1.1 - i * 0.22); group.add(stripe);
    }
    for (const x of [-2.9, 2.9]) {
      box(group, 1.1, 2.1, 0.6, std(0x59657a), x, 1.05, 5.1);
      box(group, 0.9, 0.6, 0.06, std(0x9fd0ff, { emissive: 0x3a7fc0, emissiveIntensity: 0.6 }), x, 1.55, 4.78);
    }
    label(group, 'lbl_lockers', 0, 2.5, 5.1, '#ffd24a', 0.9);

    // Control desk (comms), space weather console, engineering console and tool rack
    box(group, 1.9, 1.0, 0.7, dark, S.control.x, 0.5, S.control.z);
    box(group, 1.6, 0.7, 0.1, screen, S.control.x, 1.45, S.control.z - 0.3);
    label(group, 'lbl_control', S.control.x, 2.4, S.control.z);
    box(group, 1.2, 1.0, 0.6, std(0x23304a), S.weather.x, 0.5, S.weather.z);
    const wscreen = box(group, 1.0, 0.7, 0.08, std(0x10202a, { emissive: 0xffa040, emissiveIntensity: 1.1 }), S.weather.x, 1.35, S.weather.z - 0.2); wscreen.rotation.x = -0.15;
    label(group, 'lbl_weather', S.weather.x, 2.3, S.weather.z, '#ffb870');
    box(group, 1.9, 1.0, 0.7, std(0x2a3550), S.engineering.x, 0.5, S.engineering.z);
    box(group, 1.6, 0.7, 0.1, std(0x2a2a10, { emissive: 0xffc840, emissiveIntensity: 1.1 }), S.engineering.x, 1.45, S.engineering.z - 0.3);
    label(group, 'lbl_engineering', S.engineering.x, 2.4, S.engineering.z, '#ffd24a');
    box(group, 1.2, 1.9, 0.12, std(0x4a4f5c), S.tools.x, 1.0, S.tools.z);
    [0xe74c3c, 0xf2b632, 0x3498db, 0x2ecc71].forEach((c, i) => box(group, 0.12, 0.5 + (i % 2) * 0.2, 0.1, std(c), S.tools.x - 0.45 + i * 0.3, 1.2, S.tools.z + 0.1));
    label(group, 'lbl_tools', S.tools.x, 2.3, S.tools.z, '#ffd24a', 0.8);
    // Spare-parts shelf with labelled bins: one crate per spare part, so the Parts number matches what you see
    box(group, 0.7, 1.9, 1.5, std(0x4a4f5c), S.spares.x + 0.2, 0.95, S.spares.z);
    for (let i = 0; i < 8; i++) {
      const crate = box(group, 0.45, 0.36, 0.42, std(0x35c27a), S.spares.x - 0.05, 0.3 + Math.floor(i / 4) * 0.7, S.spares.z - 0.5 + (i % 4) * 0.34);
      fills.crates.push(crate);
    }
    label(group, 'lbl_spares', S.spares.x, 2.3, S.spares.z, '#9fe8b8', 0.8);

    // Life support: oxygen unit with a tank rack and level gauge, water recovery tank with a gauge
    const o2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.9, 8), std(0x4fc3e8));
    o2.position.set(S.o2.x, 0.95, S.o2.z); group.add(o2);
    for (const dz of [-0.55, 0.55]) { const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8), std(0x7fd3ff)); t2.position.set(S.o2.x - 0.95, 0.7, S.o2.z + dz); group.add(t2); }
    label(group, 'lbl_oxygen', S.o2.x, 2.4, S.o2.z);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.1, 3, 8), std(0x3d6fd8));
    tank.position.set(S.water.x, 1.15, S.water.z); group.add(tank);
    label(group, 'lbl_water', S.water.x, 2.4, S.water.z);
    fills.air.push(gauge(S.o2.x + 0.85, S.o2.z, 0x5ad1ff), gauge(S.water.x + 0.85, S.water.z, 0x5ad1ff));
    liveTag(tags.air, S.o2.x + 0.85, 2.15, S.o2.z);

    // Galley: table, food storage lockers with a level gauge
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10), std(0xe8e2d0));
    table.position.set(S.canteen.x, 0.8, S.canteen.z); group.add(table);
    box(group, 0.2, 0.75, 0.2, dark, S.canteen.x, 0.4, S.canteen.z);
    label(group, 'lbl_canteen', S.canteen.x, 2.2, S.canteen.z);
    box(group, 0.7, 1.9, 1.0, std(0x6a7a55), S.foodLocker.x, 0.95, S.foodLocker.z);
    fills.food.push(gauge(S.foodLocker.x + 0.45, S.foodLocker.z, 0x7be07b));
    liveTag(tags.food, S.foodLocker.x + 0.45, 2.15, S.foodLocker.z);
    label(group, 'lbl_foodlocker', S.foodLocker.x, 2.3, S.foodLocker.z, '#9fe8b8', 0.8);

    // Medical corner, exercise machine, bunks and the cupola-style window
    box(group, 0.9, 0.35, 1.9, std(0xdfe8f2), S.medical.x, 0.4, S.medical.z);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 6, 14, Math.PI), std(0x6fd3a8));
    arch.position.set(S.medical.x, 0.55, S.medical.z); arch.rotation.y = Math.PI / 2; group.add(arch);
    label(group, 'lbl_medical', S.medical.x, 2.0, S.medical.z);
    box(group, 0.9, 0.18, 1.8, dark, S.exercise.x, 0.12, S.exercise.z);
    box(group, 0.9, 0.9, 0.12, dark, S.exercise.x, 1.0, S.exercise.z - 0.9);
    box(group, 0.7, 0.4, 0.08, screen, S.exercise.x, 1.25, S.exercise.z - 0.83);
    label(group, 'lbl_exercise', S.exercise.x, 2.2, S.exercise.z - 0.5);
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), S.bunks.x, 0.5, S.bunks.z);
    box(group, 2.0, 0.35, 0.9, std(0xc9743a), S.bunks.x, 1.45, S.bunks.z);
    box(group, 0.12, 1.6, 0.12, dark, S.bunks.x + 0.9, 0.8, S.bunks.z + 0.4);
    label(group, 'lbl_bunks', S.bunks.x, 2.3, S.bunks.z);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), std(0x0a1430, { emissive: 0x1a2a66, emissiveIntensity: 0.9 }));
    win.position.set(S.window.x, 1.7, S.window.z - 0.75); group.add(win);
    label(group, 'lbl_window', S.window.x, 2.75, S.window.z - 0.7, '#9fe0ff', 0.6);

    // Pipes and cables on the floor: water (blue) between the life support gear, power (yellow) between the consoles
    const run = (x1: number, z1: number, x2: number, z2: number, color: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6), std(color, { emissive: color, emissiveIntensity: 0.25 }));
      p.position.set((x1 + x2) / 2, 0.14, (z1 + z2) / 2); p.rotation.z = Math.PI / 2; p.rotation.y = -Math.atan2(z2 - z1, x2 - x1); p.rotation.order = 'YXZ';
      p.rotation.set(0, 0, 0); p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x2 - x1, 0, z2 - z1).normalize());
      group.add(p);
    };
    run(S.o2.x + 0.9, S.o2.z + 0.2, S.water.x + 0.9, S.water.z - 0.2, 0x4fa8ff);
    run(S.control.x + 0.9, S.control.z + 0.2, S.engineering.x - 0.9, S.engineering.z + 0.2, 0xf2c832);
    run(S.weather.x + 0.4, S.weather.z - 0.5, S.control.x - 0.9, S.control.z, 0xf2c832);
  }
  return { group, wall, roof, door, doorHalf, fills, tags };
}

// Speech bubble: word-wrapped text on a rounded panel above a head.
export function createBubble(): { sprite: THREE.Sprite; set(text: string): void } {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 224;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(4.6, 1.34, 1);
  sprite.renderOrder = 9;
  return {
    sprite,
    set(text) {
      ctx.clearRect(0, 0, 768, 224);
      ctx.font = 'bold 34px system-ui, sans-serif';
      const lines: string[] = [];
      let line = '';
      for (const word of text.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > 680 && line) { lines.push(line); line = word; } else line = test;
      }
      lines.push(line);
      const shown = lines.slice(0, 4);
      const h = 36 + shown.length * 42;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.roundRect(20, 200 - h, 728, h, 26); ctx.fill();
      ctx.beginPath(); ctx.moveTo(360, 200); ctx.lineTo(384, 222); ctx.lineTo(408, 200); ctx.fill();
      ctx.fillStyle = '#10182c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      shown.forEach((l, i) => ctx.fillText(l, 384, 200 - h + 38 + i * 42, 700));
      tex.needsUpdate = true;
    },
  };
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
