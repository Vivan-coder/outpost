// Circle obstacles, plus ring-shaped buildings with a doorway on their +z side.
export interface Blocker {
  x: number; z: number; r: number;
  ring?: { inner: number; doorHalf: number; open: boolean }; // doorHalf is half the doorway, in radians
}

export interface Resolved { x: number; z: number; hit: Blocker | null }

// Moves from (px,pz) to (nx,nz), pushing the mover out of anything solid.
// A ring keeps the mover on whichever side of the wall they started, except through an open doorway.
export function resolve(blockers: Blocker[], px: number, pz: number, nx: number, nz: number, pad: number, ignoreDoors = false): Resolved {
  let hit: Blocker | null = null;
  for (const b of blockers) {
    const dx = nx - b.x, dz = nz - b.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    if (!b.ring) {
      const min = b.r + pad;
      if (d < min) { nx = b.x + (dx / d) * min; nz = b.z + (dz / d) * min; hit = b; }
      continue;
    }
    const outer = b.r + pad, inner = b.ring.inner - pad;
    if (d >= outer || d <= inner) continue;
    const inDoor = Math.abs(Math.atan2(dx, dz)) < b.ring.doorHalf - pad / b.r && (b.ring.open || ignoreDoors);
    if (inDoor) continue;
    const wasInside = Math.hypot(px - b.x, pz - b.z) <= (inner + outer) / 2;
    const to = wasInside ? inner : outer;
    nx = b.x + (dx / d) * to; nz = b.z + (dz / d) * to; hit = b;
  }
  return { x: nx, z: nz, hit };
}
