// Boot and the one loop: input is read every frame, the flight model
// advances in fixed 1/60 s steps, and the renderer + HUD paint what is
// there. Screens: title (sortie select), play, pause, debrief.
//
// ?seed=N fixes the archipelago. ?shot=cover|cargo|landing|dusk (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createFlightState, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_LIFTOFF, EVENT_STALL, EVENT_TOUCHDOWN, stepFlight } from './flight-model.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_DROP, ACTION_FLAPS, ACTION_GEAR, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MISSION_4, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { drawDebrief, drawHud, drawPause, drawTitle } from './hud.js';
import { createMission, MISSION_CARGO, MISSION_FREE, MISSION_LANDING, MISSION_RINGS, missionSpawn, releaseCrate, stepMission } from './missions.js';
import { createRenderer } from './renderer.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';
import { createTerrain } from './terrain.js';

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSE = 'pause';
const SCREEN_DEBRIEF = 'debrief';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(seed);
const renderer = createRenderer(canvas);
const sound = createSound();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit only.
  }
}

function runShot(name) {
  const state = stageShot(name, terrain);
  let painted = 0;
  function paint() {
    renderer.draw(state, terrain);
    drawHud(canvas.getContext('2d'), state, '');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let state = createFlightState(missionSpawn(MISSION_FREE));
  state.mission = createMission(MISSION_FREE);
  let banner = '';
  let bannerUntil = 0;
  let debriefAt = 0;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text, seconds = 2.6) {
    banner = text;
    bannerUntil = performance.now() + seconds * 1000;
  }

  function startSortie(kind) {
    state = createFlightState(missionSpawn(kind));
    state.mission = createMission(kind);
    renderer.resetCamera();
    screen = SCREEN_PLAY;
    accumulator = 0;
    debriefAt = 0;
    const names = {
      [MISSION_RINGS]: 'Ring Rally — thread the gold rings',
      [MISSION_CARGO]: 'Cargo Drop — SPACE releases the crate',
      [MISSION_LANDING]: 'Landing Challenge — land on runway 36',
      [MISSION_FREE]: 'Free flight — explore the archipelago',
    };
    showBanner(names[kind] ?? '', 3.4);
    announce(names[kind] ?? 'Flying.');
  }

  function endSortie() {
    screen = SCREEN_DEBRIEF;
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    announce(state.crashed ? 'Aircraft down.' : 'Sortie complete.');
  }

  function handleActions(actions) {
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startSortie(MISSION_RINGS);
      else if (actions & ACTION_MISSION_2) startSortie(MISSION_CARGO);
      else if (actions & ACTION_MISSION_3) startSortie(MISSION_LANDING);
      else if (actions & ACTION_MISSION_4 || actions & ACTION_CONFIRM) startSortie(MISSION_FREE);
      return;
    }
    if (screen === SCREEN_DEBRIEF) {
      if (actions & ACTION_RESTART) startSortie(state.mission.kind);
      else if (actions & ACTION_PAUSE) screen = SCREEN_TITLE;
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = screen === SCREEN_PAUSE ? SCREEN_PLAY : SCREEN_PAUSE;
      announce(screen === SCREEN_PAUSE ? 'Paused.' : 'Flying.');
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_CAMERA) {
      state.camera = state.camera === 'chase' ? 'cockpit' : 'chase';
      showBanner(state.camera === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW', 1.4);
    }
    if (actions & ACTION_MUTE) showBanner(sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1.2);
    if (actions & ACTION_DROP && releaseCrate(state)) {
      sound.drop();
      showBanner('CRATE AWAY', 1.6);
    }
    if (actions & ACTION_RESTART) startSortie(state.mission.kind);
  }

  function step(actions) {
    const controls = input.controls();
    controls.gearToggle = Boolean(actions & ACTION_GEAR);
    controls.flapToggle = Boolean(actions & ACTION_FLAPS);
    const events = stepFlight(state, terrain, controls, STEP);
    const missionEvent = stepMission(state, terrain, STEP);

    if (events & EVENT_LIFTOFF) showBanner('AIRBORNE', 1.6);
    if (events & EVENT_TOUCHDOWN) {
      sound.thump();
      const vs = state.touchdown?.vs ?? 0;
      showBanner(vs < 1.6 ? 'GREASED IT' : vs < 3.2 ? 'FIRM ARRIVAL' : 'HEAVY TOUCHDOWN', 2);
    }
    if (events & EVENT_STALL) showBanner('STALL', 1.4);
    if (events & EVENT_FUEL_EMPTY) showBanner('FUEL EMPTY', 2.4);
    if (events & EVENT_CRASH) {
      sound.crash();
      debriefAt = performance.now() + 1400;
    }
    if (missionEvent === 'ring') { sound.ring(); showBanner(`RING ${state.mission.ringsPassed} OF 10`, 1.8); }
    else if (missionEvent === 'rings-done') { sound.scored(); showBanner('ALL RINGS — LAND BACK HOME', 3); }
    else if (missionEvent === 'drop-scored') { sound.scored(); showBanner('DELIVERY SCORED', 2.2); }
    else if (missionEvent === 'drop-missed') { showBanner('MISSED THE ZONE', 2.2); }
    else if (missionEvent === 'finished') debriefAt = performance.now() + 900;

    sound.engine(state.throttle, state.fuel > 0 && !state.crashed);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        // One-shot toggles (gear, flaps) land on the first step only.
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
      if (debriefAt && now >= debriefAt) {
        debriefAt = 0;
        endSortie();
      }
    } else {
      accumulator = 0;
      sound.engine(0, false);
    }
    renderer.draw(state, terrain);
    const ctx = canvas.getContext('2d');
    if (screen === SCREEN_TITLE) drawTitle(ctx, best);
    else if (screen === SCREEN_DEBRIEF) drawDebrief(ctx, state, best);
    else {
      drawHud(ctx, state, now < bannerUntil ? banner : '');
      if (screen === SCREEN_PAUSE) drawPause(ctx);
    }
  }

  // Leaving the tab pauses a running sortie rather than flying unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSE;
      announce('Paused.');
    }
  });

  announce('Albatross Air Rally. Press 1, 2, 3 or 4 to pick a sortie.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
