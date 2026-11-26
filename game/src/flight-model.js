// The flight model: an arcade simulation with real consequences — throttle
// and turn discipline, a stall that drops the nose, fuel that runs out, and
// landings graded by how gently the wheels meet the ground. Positions are
// metres, velocities metres per second, angles radians.

import { AIRCRAFT } from './config.js';
import { orientationBasis } from './renderer.js';

export const EVENT_TOUCHDOWN = 1;
export const EVENT_CRASH = 2;
export const EVENT_LIFTOFF = 4;
export const EVENT_STALL = 8;
export const EVENT_FUEL_EMPTY = 16;

const GRAVITY = 9.81;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** A fresh aircraft state at a spawn point (runway or airborne). */
export function createFlightState(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: spawn.vx ?? 0,
    vy: spawn.vy ?? 0,
    vz: spawn.vz ?? 0,
    heading: spawn.heading ?? 0,
    pitch: spawn.pitch ?? 0,
    roll: 0,
    throttle: spawn.throttle ?? 0,
    fuel: AIRCRAFT.fuelCapacity,
    hull: AIRCRAFT.hullMax,
    gearDown: true,
    flaps: false,
    onGround: spawn.onGround ?? false,
    stalled: false,
    crashed: false,
    stopped: false,
    touchdown: null, // { vs, speed, x, z, heading, bank } of the last touchdown
    airspeed: 0,
    verticalSpeed: 0,
    time: 0,
    camera: 'chase',
    timeOfDay: 'day',
    mission: null,
    crate: null,
    score: 0,
  };
}

/**
 * Advance the flight model one step.
 * controls: { pitch, roll, yaw } each -1..1, throttleDelta per second,
 * brake (ground braking / airbrake), gearToggle, flapToggle as one-shots.
 * Returns an EVENT_* bitmask.
 */
export function stepFlight(state, terrain, controls, dt) {
  let events = 0;
  if (state.crashed) return events;
  state.time += dt;

  // --- Controls -----------------------------------------------------------
  state.throttle = clamp(state.throttle + controls.throttleDelta * dt, 0, 1);
  if (controls.gearToggle) state.gearDown = !state.gearDown;
  if (controls.flapToggle) state.flaps = !state.flaps;

  const speed = Math.hypot(state.vx, state.vy, state.vz);
  state.airspeed = speed;

  // Pitch and roll answer at every speed, but sluggishly when slow.
  const authority = clamp(speed / 30, 0.25, 1);
  state.pitch = clamp(state.pitch + controls.pitch * AIRCRAFT.pitchRate * authority * dt, -AIRCRAFT.maxPitch, AIRCRAFT.maxPitch);
  state.roll = clamp(state.roll + controls.roll * AIRCRAFT.rollRate * authority * dt, -AIRCRAFT.maxRoll, AIRCRAFT.maxRoll);
  if (controls.roll === 0) {
    // Gentle spiral stability: the wings level themselves when left alone.
    state.roll -= state.roll * Math.min(1, 0.7 * dt);
  }

  // Heading: coordinated turn from bank in the air, rudder steering on ground.
  if (state.onGround) {
    state.heading += controls.yaw * 0.55 * clamp(speed / 12, 0, 1) * dt;
    state.roll *= Math.max(0, 1 - 4 * dt);
    state.pitch = clamp(state.pitch, -0.05, AIRCRAFT.maxPitch);
  } else {
    const turnRate = (GRAVITY * Math.tan(state.roll)) / Math.max(speed, 16);
    state.heading += (turnRate + controls.yaw * AIRCRAFT.yawRate * authority) * dt;
  }
  state.heading = ((state.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // --- Forces -------------------------------------------------------------
  const basis = orientationBasis(state.heading, state.pitch, state.roll);
  const engineRunning = state.fuel > 0;
  const thrust = engineRunning ? state.throttle * AIRCRAFT.maxThrust : 0;

  // Lift comes from angle of attack: how far the nose sits above the
  // flight path. Level cruise needs only a degree or two; pulling hard at
  // speed climbs, pulling too far stalls and drops the nose.
  const stallSpeed = state.flaps ? AIRCRAFT.stallSpeed * 0.82 : AIRCRAFT.stallSpeed;
  const flightPath = speed > 1 ? Math.asin(Math.min(1, Math.max(-1, state.vy / speed))) : 0;
  const angleOfAttack = state.pitch - flightPath;
  const wasStalled = state.stalled;
  state.stalled = !state.onGround && (angleOfAttack > 0.3 || (speed < stallSpeed * 0.9 && angleOfAttack > 0.18));
  if (state.stalled && !wasStalled) events |= EVENT_STALL;
  if (state.stalled) {
    // The nose drops on its own until speed builds again.
    state.pitch = Math.max(-0.45, state.pitch - 0.55 * dt);
  }

  let liftFactor = Math.min(1.6, Math.max(-1.2, angleOfAttack / 0.1));
  if (state.stalled) liftFactor *= 0.5;
  if (state.flaps) liftFactor *= 1.12;
  let liftAccel = GRAVITY * (speed / stallSpeed) * (speed / stallSpeed) * liftFactor;
  liftAccel = Math.min(2.6 * GRAVITY, Math.max(-1.5 * GRAVITY, liftAccel));
  const lift = liftAccel * AIRCRAFT.mass;

  const dragScale = AIRCRAFT.dragCoeff * (state.flaps ? 1.5 : 1) * (controls.brake && !state.onGround ? 2.2 : 1);
  const ax = (basis.forward[0] * thrust + basis.up[0] * lift - dragScale * speed * state.vx) / AIRCRAFT.mass;
  const ay = (basis.forward[1] * thrust + basis.up[1] * lift - dragScale * speed * state.vy) / AIRCRAFT.mass - GRAVITY;
  const az = (basis.forward[2] * thrust + basis.up[2] * lift - dragScale * speed * state.vz) / AIRCRAFT.mass;

  state.vx += ax * dt;
  state.vy += ay * dt;
  state.vz += az * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  state.verticalSpeed = state.vy;

  // --- Fuel ---------------------------------------------------------------
  if (state.throttle > 0.02 && state.fuel > 0) {
    const burn = AIRCRAFT.fuelBurnIdle + state.throttle * (AIRCRAFT.fuelBurnFull - AIRCRAFT.fuelBurnIdle);
    state.fuel = Math.max(0, state.fuel - burn * dt);
    if (state.fuel === 0) events |= EVENT_FUEL_EMPTY;
  }

  // --- Ground -------------------------------------------------------------
  const groundH = terrain.sampleHeight(state.x, state.z);
  const belly = state.gearDown ? AIRCRAFT.gearHeight : 0.45;
  const floorY = Math.max(groundH, 0) + belly;

  if (state.y <= floorY) {
    const descent = -state.vy;
    if (!state.onGround) {
      // Touchdown: grade it, and hurt the aircraft if it was rough.
      state.touchdown = {
        vs: descent,
        speed,
        x: state.x,
        z: state.z,
        heading: state.heading,
        bank: Math.abs(state.roll),
        gearDown: state.gearDown,
        inWater: groundH < 0,
      };
      events |= EVENT_TOUCHDOWN;
      if (groundH < 0) {
        state.crashed = true; // ditched in the sea
        events |= EVENT_CRASH;
      } else if (descent > AIRCRAFT.crashVs || Math.abs(state.roll) > 0.55 || (!state.gearDown && speed > 18)) {
        state.crashed = true;
        events |= EVENT_CRASH;
      } else if (descent > AIRCRAFT.hardLandingVs) {
        state.hull = Math.max(0, state.hull - (descent - AIRCRAFT.hardLandingVs) * 9);
        if (state.hull === 0) { state.crashed = true; events |= EVENT_CRASH; }
      }
      if (!state.gearDown && groundH >= 0) state.hull = Math.max(0, state.hull - 22);
    }
    state.y = floorY;
    if (state.vy < 0) state.vy = 0;
    state.onGround = true;
    // Rolling friction and braking: a steady deceleration, so full
    // throttle still wins the takeoff roll and the brakes still stop it.
    const speedH = Math.hypot(state.vx, state.vz);
    if (speedH > 0) {
      const decel = (controls.brake ? 3.2 : 0.35) * dt;
      const keep = Math.max(0, speedH - decel) / speedH;
      state.vx *= keep;
      state.vz *= keep;
    }
    // Liftoff when lift beats weight and the nose is up.
    if (lift / AIRCRAFT.mass > GRAVITY * 1.02 && state.pitch > 0.04 && speed > AIRCRAFT.rotateSpeed * 0.9) {
      state.onGround = false;
      state.y += 0.4;
      state.vy = Math.max(state.vy, 1.2);
      events |= EVENT_LIFTOFF;
    }
  } else {
    state.onGround = false;
  }

  // Terrain strike at speed (flying into a hillside).
  if (!state.onGround && state.y < groundH + 0.6 && speed > AIRCRAFT.crashSpeed) {
    state.crashed = true;
    events |= EVENT_CRASH;
  }

  state.stopped = state.onGround && speed < 0.6 && state.throttle < 0.05;
  return events;
}

/** Heading in degrees, 0 = north, for the HUD. */
export function headingDegrees(state) {
  return Math.round((state.heading * 180) / Math.PI) % 360;
}

/** Knots for the HUD. */
export function knots(state) {
  return Math.round(state.airspeed * 1.944);
}

/** Feet above sea level for the HUD. */
export function feet(state) {
  return Math.round(state.y * 3.281);
}
