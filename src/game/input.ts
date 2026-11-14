// Unified input: WASD + pointer lock on desktop, left-thumb joystick + right-thumb look on touch.
export interface InputState {
  moveX: number; // strafe, -1..1
  moveY: number; // forward, -1..1
  lookDX: number; // radians accumulated since last consume
  lookDY: number;
  jump: boolean;
  isTouch: boolean;
}

export function createInput(canvas: HTMLCanvasElement): { state: InputState; consume(): void } {
  const state: InputState = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jump: false, isTouch: false };
  const keys = new Set<string>();

  const syncKeys = () => {
    state.moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    state.moveY = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  };
  addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') state.jump = true; syncKeys(); });
  addEventListener('keyup', (e) => { keys.delete(e.code); syncKeys(); });
  addEventListener('blur', () => { keys.clear(); syncKeys(); });

  canvas.addEventListener('click', () => { if (!state.isTouch) canvas.requestPointerLock?.(); });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    state.lookDX -= e.movementX * 0.0022;
    state.lookDY -= e.movementY * 0.0022;
  });

  // Touch
  const stick = document.getElementById('stick') as HTMLElement;
  const knob = stick.firstElementChild as HTMLElement;
  const jumpBtn = document.getElementById('jump') as HTMLElement;
  const R = 50;
  let moveId = -1, lookId = -1, ox = 0, oy = 0, lx = 0, ly = 0;

  const markTouch = () => { if (!state.isTouch) { state.isTouch = true; document.body.classList.add('touch'); } };

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); markTouch();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < innerWidth / 2 && moveId < 0) {
        moveId = t.identifier; ox = t.clientX; oy = t.clientY;
        stick.style.display = 'block'; stick.style.left = ox + 'px'; stick.style.top = oy + 'px';
        knob.style.transform = '';
      } else if (lookId < 0) {
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId) {
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx *= R / len; dy *= R / len; }
        knob.style.transform = `translate(${dx}px,${dy}px)`;
        state.moveX = dx / R; state.moveY = -dy / R;
      } else if (t.identifier === lookId) {
        state.lookDX -= (t.clientX - lx) * 0.005;
        state.lookDY -= (t.clientY - ly) * 0.005;
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });

  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === moveId) { moveId = -1; state.moveX = 0; state.moveY = 0; stick.style.display = 'none'; }
      else if (t.identifier === lookId) lookId = -1;
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); markTouch(); state.jump = true; }, { passive: false });

  return { state, consume() { state.lookDX = 0; state.lookDY = 0; state.jump = false; } };
}
