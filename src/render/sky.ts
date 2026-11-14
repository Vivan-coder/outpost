import * as THREE from 'three';

export function createStars(count = 1800, radius = 900): THREE.Points {
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Upper hemisphere plus a little below the horizon.
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
    const y = Math.abs(u) * 0.98 - 0.05, r = Math.sqrt(Math.max(0, 1 - y * y));
    p[i * 3] = r * Math.cos(t) * radius; p[i * 3 + 1] = y * radius; p[i * 3 + 2] = r * Math.sin(t) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false });
  return new THREE.Points(geo, mat);
}

// A bright sun disc that always sits in the direction of the sun light.
export function createSun(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.12, '#fff6d8'); grad.addColorStop(0.3, '#ffd98a88'); grad.addColorStop(1, '#ffb04000');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sp.scale.set(260, 260, 1);
  return sp;
}

// Placeholder Earth: plain blue sphere. Swap for a NASA Blue Marble texture later (log it in CREDITS.md).
export function createEarth(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.9, emissive: 0x0a1a40 }),
  );
  mesh.position.set(-320, 420, -620);
  return mesh;
}
