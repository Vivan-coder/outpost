import * as THREE from 'three';

export const TERRAIN_SIZE = 240;
const SEGMENTS = 96;

// Deterministic hash noise so collision and the mesh always agree on height.
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

interface Crater { x: number; z: number; r: number; depth: number }

const craters: Crater[] = [];
for (let i = 0; i < 26; i++) {
  const x = (hash(i, 1.3) - 0.5) * TERRAIN_SIZE * 0.9;
  const z = (hash(i, 7.9) - 0.5) * TERRAIN_SIZE * 0.9;
  const r = 3 + hash(i, 4.2) * 11;
  // Keep the base site in the middle clear so there is room to build.
  if (Math.hypot(x, z) < r + 16) continue;
  craters.push({ x, z, r, depth: r * 0.22 });
}

export function heightAt(x: number, z: number): number {
  let h = valueNoise(x * 0.02, z * 0.02) * 5 + valueNoise(x * 0.08, z * 0.08) * 1.1 + valueNoise(x * 0.4, z * 0.4) * 0.12;
  // Flatten the build site.
  const site = Math.min(1, Math.hypot(x, z) / 30);
  h *= site * site;
  for (const c of craters) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d < 1.4) {
      const bowl = d < 1 ? (d * d - 1) * c.depth : 0;
      const rim = Math.exp(-((d - 1) ** 2) * 14) * c.depth * 0.35;
      h += bowl + rim;
    }
  }
  return h;
}

export function createTerrain(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const g = 0.42 + valueNoise(x * 0.3, z * 0.3) * 0.16 + valueNoise(x * 0.03 + 9, z * 0.03) * 0.14;
    colors[i * 3] = g; colors[i * 3 + 1] = g; colors[i * 3 + 2] = g * 1.02;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
