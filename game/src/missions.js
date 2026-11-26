// The three sorties and free flight: where each starts, what it asks of the
// pilot, and how it is scored. The flight model flies; this file judges.

import { MISSIONS } from './config.js';
import { DROP_ZONES, RING_COURSE, RUNWAY } from './terrain.js';

export const MISSION_RINGS = 'rings';
export const MISSION_CARGO = 'cargo';
export const MISSION_LANDING = 'landing';
export const MISSION_FREE = 'free';

export const MISSION_LIST = [
  {
    kind: MISSION_RINGS,
    name: 'Sortie 1 — Ring Rally',
    brief: 'Thread all 10 rings around the archipelago, then land back home.',
    keys: '1',
  },
  {
    kind: MISSION_CARGO,
    name: 'Sortie 2 — Cargo Drop',
    brief: 'Drop a crate on each island village. SPACE releases the crate.',
    keys: '2',
  },
  {
    kind: MISSION_LANDING,
    name: 'Sortie 3 — Landing Challenge',
    brief: 'You are on downwind. Land on runway 36 and stop on the strip.',
    keys: '3',
  },
  {
    kind: MISSION_FREE,
    name: 'Free Flight',
    brief: 'No goals. Explore the archipelago, mind the fuel gauge.',
    keys: '4',
  },
];

/** Spawn state for a mission: on the runway, or airborne for the landing. */
export function missionSpawn(kind) {
  if (kind === MISSION_LANDING) {
    // Downwind leg east of the field, heading south, 220 m up at cruise.
    return {
      x: RUNWAY.x + 900,
      y: 230,
      z: RUNWAY.z - 1500,
      vx: 0,
      vy: 0,
      vz: 42,
      heading: Math.PI, // southbound, will turn final for runway 36
      pitch: 0,
      throttle: 0.55,
      onGround: false,
    };
  }
  // On the runway threshold, facing north (runway 36), engine at idle.
  return {
    x: RUNWAY.x,
    y: RUNWAY.height + 1.1,
    z: RUNWAY.z + RUNWAY.length / 2 - 60,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    pitch: 0,
    throttle: 0,
    onGround: true,
  };
}

/** Fresh mission progress for a sortie. */
export function createMission(kind) {
  return {
    kind,
    nextRing: 0,
    ringsPassed: 0,
    nextDrop: 0,
    dropsScored: 0,
    cratesLeft: MISSIONS.dropCount,
    elapsed: 0,
    finished: false,
    result: '',
    score: 0,
    wind: { x: 3.5, z: -1.5 }, // a steady coastal breeze, m/s
    lastRingDistance: Infinity,
  };
}

/** The point the pilot should aim for next (ring, drop zone, runway). */
export function missionTarget(mission) {
  if (mission.kind === MISSION_RINGS && mission.nextRing < RING_COURSE.length) {
    return RING_COURSE[mission.nextRing];
  }
  if (mission.kind === MISSION_CARGO && mission.nextDrop < DROP_ZONES.length) {
    const zone = DROP_ZONES[mission.nextDrop];
    return { x: zone.x, y: 280, z: zone.z };
  }
  if (mission.kind === MISSION_LANDING || mission.kind === MISSION_RINGS) {
    return { x: RUNWAY.x, y: RUNWAY.height, z: RUNWAY.z };
  }
  return null;
}

/**
 * Advance mission logic one step. Returns a short event string when
 * something worth announcing happens ('ring', 'drop', 'finished', ...).
 */
export function stepMission(state, terrain, dt) {
  const mission = state.mission;
  if (!mission || mission.finished) return '';
  mission.elapsed += dt;

  if (mission.kind === MISSION_RINGS) {
    if (mission.nextRing < RING_COURSE.length) {
      const ring = RING_COURSE[mission.nextRing];
      const dist = Math.hypot(state.x - ring.x, state.y - ring.y, state.z - ring.z);
      mission.lastRingDistance = dist;
      if (dist < MISSIONS.ringRadius) {
        mission.nextRing += 1;
        mission.ringsPassed += 1;
        mission.score += MISSIONS.ringPoints;
        state.score = mission.score;
        return mission.nextRing >= RING_COURSE.length ? 'rings-done' : 'ring';
      }
    } else if (state.stopped && onRunway(state)) {
      const timeBonus = Math.max(0, Math.round((MISSIONS.ringParSeconds - mission.elapsed) * 2));
      mission.score += timeBonus;
      state.score = mission.score;
      mission.finished = true;
      mission.result = `All rings threaded in ${formatTime(mission.elapsed)}. Time bonus +${timeBonus}.`;
      return 'finished';
    }
  }

  if (mission.kind === MISSION_CARGO) {
    if (state.crate) {
      const crate = state.crate;
      crate.vy -= 9.81 * dt * 0.55; // parachute: falls at a drift, not a plunge
      crate.vy = Math.max(crate.vy, -7);
      // Parachute drag: the crate sheds its forward speed within a few
      // seconds and then mostly drifts with the wind.
      const drag = Math.exp(-0.45 * dt);
      crate.vx *= drag;
      crate.vz *= drag;
      crate.x += (crate.vx + mission.wind.x) * dt;
      crate.y += crate.vy * dt;
      crate.z += (crate.vz + mission.wind.z) * dt;
      crate.rot += dt * 0.8;
      const ground = Math.max(terrain.sampleHeight(crate.x, crate.z), 0);
      if (crate.y <= ground + 1.2) {
        const zone = DROP_ZONES[mission.nextDrop];
        const dist = Math.hypot(crate.x - zone.x, crate.z - zone.z);
        state.crate = null;
        if (dist <= MISSIONS.dropZoneRadius) {
          const points = Math.round(
            MISSIONS.dropPointsFar +
              (MISSIONS.dropPointsNear - MISSIONS.dropPointsFar) * (1 - dist / MISSIONS.dropZoneRadius),
          );
          mission.score += points;
          mission.dropsScored += 1;
          state.score = mission.score;
          mission.nextDrop += 1;
          if (mission.nextDrop >= DROP_ZONES.length) {
            mission.finished = true;
            mission.result = `All three villages supplied in ${formatTime(mission.elapsed)}.`;
            return 'finished';
          }
          return 'drop-scored';
        }
        return 'drop-missed';
      }
    }
    if (mission.cratesLeft === 0 && !state.crate && mission.nextDrop < DROP_ZONES.length) {
      mission.finished = true;
      mission.result = `Out of crates with ${DROP_ZONES.length - mission.nextDrop} village(s) still waiting.`;
      return 'finished';
    }
  }

  if (mission.kind === MISSION_LANDING) {
    if (state.touchdown && state.stopped) {
      mission.finished = true;
      if (!onRunway(state)) {
        mission.result = 'You stopped off the runway. The strip was right there.';
        mission.score = 40;
      } else {
        const vs = state.touchdown.vs;
        const centre = Math.abs(state.touchdown.x - RUNWAY.x);
        const vsScore = Math.max(0, 100 - Math.max(0, vs - MISSIONS.landingParVs) * 22);
        const centreScore = Math.max(0, 100 - centre * 2.2);
        mission.score = Math.round(vsScore * 0.6 + centreScore * 0.4) * 5;
        mission.result = `Touchdown at ${vs.toFixed(1)} m/s, ${centre.toFixed(0)} m off centreline.`;
      }
      state.score = mission.score;
      return 'finished';
    }
  }

  if (mission.kind === MISSION_FREE) {
    mission.score = Math.floor(mission.elapsed);
    state.score = mission.score;
  }
  return '';
}

/** Release a cargo crate from the aircraft (cargo sortie only). */
export function releaseCrate(state) {
  const mission = state.mission;
  if (!mission || mission.kind !== MISSION_CARGO || state.crate || mission.cratesLeft <= 0) return false;
  mission.cratesLeft -= 1;
  state.crate = {
    x: state.x,
    y: state.y - 2,
    z: state.z,
    vx: state.vx,
    vy: state.vy,
    vz: state.vz,
    rot: 0,
  };
  return true;
}

/** Is the aircraft on the home runway strip? */
export function onRunway(state) {
  return (
    Math.abs(state.x - RUNWAY.x) <= RUNWAY.width / 2 + 6 &&
    Math.abs(state.z - RUNWAY.z) <= RUNWAY.length / 2 + 6
  );
}

/** mm:ss for mission clocks. */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
