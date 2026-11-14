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

// Placeholder Earth: plain blue sphere. Swap for a NASA Blue Marble texture later (log it in CREDITS.md).
export function createEarth(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.9, emissive: 0x0a1a40 }),
  );
  mesh.position.set(-320, 420, -620);
  return mesh;
}
