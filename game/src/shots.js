// The screenshot scenes behind ?shot=cover|cargo|landing|dusk. Each one
// stages the real simulation — same flight model, same missions — and flies
// it forward with a simple autopilot, so the frame is what a short sortie
// really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { createFlightState, stepFlight } from './flight-model.js';
import { createMission, MISSION_CARGO, MISSION_FREE, MISSION_LANDING, MISSION_RINGS, missionSpawn, missionTarget, releaseCrate, stepMission } from './missions.js';
import { RUNWAY } from './terrain.js';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/** Steer toward a target point at a target speed; returns flight controls. */
function autopilot(state, target, targetSpeed, gentle = false) {
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(desiredHeading - state.heading);
  const desiredBank = clamp(headingError * 1.1, -0.75, 0.75);
  const roll = clamp((desiredBank - state.roll) * 2.2, -1, 1);
  const pitchGain = gentle ? 0.0012 : 0.0025;
  const pitchCap = gentle ? 0.12 : 0.22;
  const desiredPitch = clamp((target.y - state.y) * pitchGain, -pitchCap, pitchCap);
  const pitch = clamp((desiredPitch - state.pitch) * 2.6, -1, 1);
  const throttleDelta = clamp((targetSpeed - state.airspeed) * 0.03, -0.5, 0.5);
  return { pitch, roll, yaw: 0, throttleDelta, brake: false, gearToggle: false, flapToggle: false };
}

/** Velocity along a heading at a speed, so a staged plane flies straight. */
function along(heading, speed) {
  return { vx: Math.sin(heading) * speed, vz: -Math.cos(heading) * speed };
}

/** Run the simulation for `seconds`, steering with the autopilot. */
function flyFor(state, terrain, seconds, steer) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const controls = steer(state, i * STEP);
    stepFlight(state, terrain, controls, STEP);
    stepMission(state, terrain, STEP);
    if (state.crashed) break;
  }
}

/**
 * Like flyFor, but stop as soon as `done(state)` holds (checked each step),
 * with `maxSeconds` as a hard cap — the pose is then the same scene every
 * run regardless of small timing drift.
 */
function flyUntil(state, terrain, maxSeconds, steer, done) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const controls = steer(state, i * STEP);
    stepFlight(state, terrain, controls, STEP);
    stepMission(state, terrain, STEP);
    if (state.crashed || done(state)) break;
  }
}

/**
 * Stage the named scene into a fresh flight state and return it, ready to
 * paint. Names: cover, cargo, landing, dusk (anything else is cover).
 */
export function stageShot(name, terrain) {
  if (name === 'cargo') {
    const heading = Math.atan2(1500 - 700, -(300 - 1050));
    const state = createFlightState({
      x: 700, y: 210, z: 1050, ...along(heading, 42), vy: 0,
      heading, pitch: 0, throttle: 0.62, onGround: false,
    });
    state.mission = createMission(MISSION_CARGO);
    let dropped = false;
    // Drop on the run-in, then stop ~1.5 s later: the crate is a few metres
    // below the tail, still in front of the chase camera, canopy open.
    flyUntil(state, terrain, 30, (s) => {
      const target = missionTarget(s.mission);
      if (!dropped && Math.hypot(s.x - target.x, s.z - target.z) < 380) { releaseCrate(s); dropped = true; }
      return autopilot(s, target, 46);
    }, (s) => Boolean(s.crate) && s.y - s.crate.y > 3.5);
    return state;
  }

  if (name === 'landing') {
    const state = createFlightState(missionSpawn(MISSION_LANDING));
    state.mission = createMission(MISSION_LANDING);
    const fix = { x: RUNWAY.x, y: 115, z: RUNWAY.z + 1500 };
    const threshold = { x: RUNWAY.x, y: RUNWAY.height + 4, z: RUNWAY.z + 260 };
    let onFinal = false;
    flyUntil(state, terrain, 150, (s) => {
      const distFix = Math.hypot(s.x - fix.x, s.z - fix.z);
      if (!onFinal && distFix < 420) { onFinal = true; s.flaps = true; }
      return autopilot(s, onFinal ? threshold : fix, onFinal ? 31 : 40, onFinal);
    }, (s) => {
      if (!onFinal) return false;
      const dist = Math.hypot(s.x - threshold.x, s.z - threshold.z);
      return dist < 850 && Math.abs(wrapAngle(s.heading)) < 0.12 && s.y < 170;
    });
    return state;
  }

  if (name === 'dusk') {
    const state = createFlightState({
      x: -350, y: 150, z: 2600, ...along(0.12, 44), vy: 0,
      heading: 0.12, pitch: 0, throttle: 0.6, onGround: false,
    });
    state.mission = createMission(MISSION_FREE);
    state.timeOfDay = 'dusk';
    flyFor(state, terrain, 7, (s) => autopilot(s, { x: RUNWAY.x, y: 130, z: RUNWAY.z }, 46));
    return state;
  }

  // Cover: the last ring of the rally, with the home runway beyond it.
  const heading = Math.atan2(-500 + 1500, -(1150 - 2250));
  const state = createFlightState({
    x: -1500, y: 185, z: 2250, ...along(heading, 44), vy: 0,
    heading, pitch: 0, throttle: 0.66, onGround: false,
  });
  state.mission = createMission(MISSION_RINGS);
  state.mission.nextRing = 9;
  state.mission.ringsPassed = 9;
  state.mission.score = 900;
  state.score = 900;
  flyUntil(state, terrain, 40, (s) => autopilot(s, missionTarget(s.mission), 48), (s) => {
    const target = missionTarget(s.mission);
    return Math.hypot(s.x - target.x, s.y - target.y, s.z - target.z) < 115;
  });
  return state;
}
