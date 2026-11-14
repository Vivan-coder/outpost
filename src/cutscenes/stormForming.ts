import * as THREE from 'three';
import type { StormInfo } from '../sim/sim.ts';
import { t } from '../i18n/en';
import { glowTexture, type Shot, type Stage } from './engine';

// Cutscene 1: "A storm is forming". The real DONKI chain for the storm that is about to be announced:
// a flare (class and time from the record), then the CME that follows it (speed from the record), then its trip to the Moon.
// The pictures are not to scale (the Sun, Earth and Moon are drawn close together); the shot says so.
const SUN_R = 10;
const EARTH_X = 125;

export function stormFormingShots(info: StormInfo, short: boolean): Shot[] {
  const cls = info.flareClass;
  const date = info.flareTimeUtc.slice(0, 10);
  const speed = String(info.cmeSpeedKmS ?? '?');
  const real = (url: string) => [
    { kind: 'real' as const, text: t('badgeReal') },
    { kind: 'arch' as const, text: t('badgeArchived', { d: date.slice(0, 7) }), url },
  ];
  const flare: Shot = {
    dur: short ? 3 : 4, from: [32, 5, 26], to: [24, 7, 20], lookFrom: [9, 2, 0], lookTo: [9, 2, 0],
    caption: short ? t('cine_short', { cls, speed }) : t('cine_flare', { date, cls }),
    badges: real(info.flareUrl),
    act: 'flare', overlay: { type: 'flare', cls, label: t('cine_flareLabel'), time: info.flareTimeUtc.replace('T', ' ').slice(0, 16) + ' UTC' }, sound: 'hiss',
  };
  if (short) return [flare];
  return [
    flare,
    {
      dur: 3.5, from: [44, 12, 38], to: [56, 9, 30], lookFrom: [18, 0, 0], lookTo: [30, 0, 0],
      caption: t('cine_cme'), badges: real(info.cmeUrl), act: 'cmeLeave', sound: 'hiss',
    },
    {
      dur: 3.5, from: [62, 22, 56], to: [100, 16, 40], lookFrom: [40, 0, 0], lookTo: [100, 0, 0],
      caption: t('cine_travel'), badges: [...real(info.cmeUrl).slice(0, 1), { kind: 'game', text: t('cine_notScale') }],
      act: 'cmeTravel', overlay: { type: 'number', value: speed, unit: 'km/s', label: t('cine_speedLabel') },
    },
    {
      dur: 3.5, from: [EARTH_X - 14, 7, 38], to: [EARTH_X - 2, 5, 30], lookFrom: [EARTH_X + 1, 0, 1], lookTo: [EARTH_X + 4, 0, 1],
      caption: t('cine_hit'), badges: [{ kind: 'game', text: t('badgeGame') }], act: 'cmeHit', sound: 'thud',
    },
  ];
}

export function buildStormStage(): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.add(new THREE.AmbientLight(0x6070a0, 0.6));

  // Stars
  const sp = new Float32Array(900);
  for (let i = 0; i < 300; i++) { const a = Math.random() * 6.28, b = (Math.random() - 0.5) * 2, r = 420; sp[i * 3] = Math.cos(a) * Math.sqrt(1 - b * b) * r + 60; sp[i * 3 + 1] = b * r * 0.6; sp[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - b * b) * r; }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })));

  const glow = glowTexture();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
  scene.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGlow.scale.set(46, 46, 1); scene.add(sunGlow);
  scene.add(new THREE.PointLight(0xffd9a0, 8000, 0, 2));

  // Flare: a bright loop standing out from the edge of the Sun, plus a burst of sparks
  const additive = (c: number, o = 0.9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const loop = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.45, 8, 28, Math.PI), additive(0xfff0c0));
  loop.rotation.z = -Math.PI / 2; loop.position.set(SUN_R - 0.4, 0, 0); scene.add(loop);
  const flareGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flareGlow.position.set(SUN_R + 1, 0, 0); scene.add(flareGlow);
  const N = 160, sparkDir: THREE.Vector3[] = [], sparkPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) sparkDir.push(new THREE.Vector3(1, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9).normalize().multiplyScalar(4 + Math.random() * 14));
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffe0a0, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(sparks);

  // CME: a growing glowing bubble that travels along +x
  const bubbleMat = additive(0xff9a40, 0.22), edgeMat = new THREE.MeshBasicMaterial({ color: 0xffc070, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const bubble = new THREE.Group();
  bubble.add(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), bubbleMat), new THREE.Mesh(new THREE.SphereGeometry(1.01, 16, 10), edgeMat));
  bubble.visible = false; scene.add(bubble);

  // Earth and Moon (not to scale)
  const earth = new THREE.Mesh(new THREE.SphereGeometry(3.2, 28, 18), new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.8, emissive: 0x143c80, emissiveIntensity: 0.8 }));
  earth.position.set(EARTH_X, 0, 0); scene.add(earth);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 12), new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 1, emissive: 0x555550, emissiveIntensity: 0.7 }));
  moon.position.set(EARTH_X + 6, 0, 3); scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(120,255,160,0.9)', 'rgba(60,200,120,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  moonGlow.position.copy(moon.position); moonGlow.scale.set(8, 8, 1); scene.add(moonGlow);

  const set = (x: number, s: number, o: number) => { bubble.position.x = x; bubble.scale.setScalar(s); bubbleMat.opacity = 0.22 * o; edgeMat.opacity = 0.35 * o; bubble.visible = o > 0.01; };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const flareLevel = (u: number) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.7);

  return {
    scene,
    update(act, u, time) {
      sunGlow.scale.setScalar(46 + Math.sin(time * 2) * 1.5);
      const hideFlare = act !== 'flare';
      const f = act === 'flare' ? flareLevel(u) : 0.15;
      loop.visible = !hideFlare || f > 0.1; loop.scale.setScalar(0.4 + f * 1.1);
      flareGlow.scale.setScalar(5 + f * 22); (flareGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.2 + f);
      const burst = act === 'flare' ? u : 1;
      for (let i = 0; i < N; i++) { sparkPos[i * 3] = SUN_R + 1 + sparkDir[i].x * burst; sparkPos[i * 3 + 1] = sparkDir[i].y * burst; sparkPos[i * 3 + 2] = sparkDir[i].z * burst; }
      sparkGeo.attributes.position.needsUpdate = true;
      (sparks.material as THREE.PointsMaterial).opacity = act === 'flare' ? 0.9 * (1 - u * 0.5) : 0;
      moonGlow.material.opacity = 0;
      if (act === 'flare') set(0, 1, 0);
      else if (act === 'cmeLeave') set(lerp(SUN_R - 1, 40, u), lerp(2, 8, u), 1);
      else if (act === 'cmeTravel') set(lerp(40, 100, u), lerp(8, 10, u), 1);
      else if (act === 'cmeHit') { set(lerp(100, 156, u), 10, 1 - Math.max(0, u - 0.65) * 2.8); moonGlow.material.opacity = 0.5 + 0.5 * Math.sin(u * 14); }
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.SpriteMaterial).map?.dispose?.(); x.dispose(); });
      });
    },
  };
}
