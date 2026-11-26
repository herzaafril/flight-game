// Keyboard and mouse input. Held keys give continuous flight controls;
// one-shot presses (gear, flaps, drop, camera, pause, mission picks) are
// queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_DROP = 1;
export const ACTION_GEAR = 2;
export const ACTION_FLAPS = 4;
export const ACTION_CAMERA = 8;
export const ACTION_PAUSE = 16;
export const ACTION_RESTART = 32;
export const ACTION_MUTE = 64;
export const ACTION_MISSION_1 = 128;
export const ACTION_MISSION_2 = 256;
export const ACTION_MISSION_3 = 512;
export const ACTION_MISSION_4 = 1024;
export const ACTION_CONFIRM = 2048;

const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const ROLL_LEFT = new Set(['ArrowLeft']);
const ROLL_RIGHT = new Set(['ArrowRight']);
const YAW_LEFT = new Set(['KeyA']);
const YAW_RIGHT = new Set(['KeyD']);
const THROTTLE_UP = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyS', 'ControlLeft', 'ControlRight']);
const BRAKE = new Set(['Space']);

const ONE_SHOTS = new Map([
  ['Space', ACTION_DROP],
  ['KeyG', ACTION_GEAR],
  ['KeyF', ACTION_FLAPS],
  ['KeyC', ACTION_CAMERA],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['KeyR', ACTION_RESTART],
  ['KeyM', ACTION_MUTE],
  ['Digit1', ACTION_MISSION_1],
  ['Digit2', ACTION_MISSION_2],
  ['Digit3', ACTION_MISSION_3],
  ['Digit4', ACTION_MISSION_4],
  ['Enter', ACTION_CONFIRM],
]);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0; // -1..1 from screen centre
  let mouseY = 0;
  let mouseActive = false;
  let wheelThrottle = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    const action = ONE_SHOTS.get(event.code);
    if (action) actions |= action;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());

  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouseActive = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('wheel', (event) => {
    wheelThrottle -= Math.sign(event.deltaY) * 0.08;
    event.preventDefault();
  }, { passive: false });

  const anyHeld = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    /** Continuous flight controls for this frame. */
    controls() {
      let pitch = (anyHeld(PITCH_UP) ? 1 : 0) - (anyHeld(PITCH_DOWN) ? 1 : 0);
      let roll = (anyHeld(ROLL_RIGHT) ? 1 : 0) - (anyHeld(ROLL_LEFT) ? 1 : 0);
      // Mouse steering blends in when the pointer has moved: right banks
      // right, up (toward the top of the screen) pitches up.
      if (mouseActive && pitch === 0 && roll === 0) {
        roll = Math.max(-1, Math.min(1, mouseX * 1.6));
        pitch = Math.max(-1, Math.min(1, -mouseY * 1.6));
        if (Math.abs(roll) < 0.12) roll = 0;
        if (Math.abs(pitch) < 0.12) pitch = 0;
      }
      let throttleDelta = (anyHeld(THROTTLE_UP) ? 0.55 : 0) - (anyHeld(THROTTLE_DOWN) ? 0.55 : 0);
      if (wheelThrottle !== 0) {
        throttleDelta += wheelThrottle * 4;
        wheelThrottle = 0;
      }
      return {
        pitch,
        roll,
        yaw: (anyHeld(YAW_RIGHT) ? 1 : 0) - (anyHeld(YAW_LEFT) ? 1 : 0),
        throttleDelta,
        brake: anyHeld(BRAKE),
        gearToggle: false,
        flapToggle: false,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
