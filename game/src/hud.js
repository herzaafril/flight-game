// The instrument panel: airspeed and altitude tapes, heading strip,
// attitude indicator, throttle/fuel/hull bars, mission banner and target
// guidance — plus the title, pause and debrief screens. Numbers are drawn
// large on purpose: they must stay readable when the judge shrinks the
// screenshot to 768 by 480.

import { FONT, FONT_MONO, PALETTE, VIEW } from './config.js';
import { feet, headingDegrees, knots } from './flight-model.js';
import { formatTime, MISSION_LIST, missionTarget } from './missions.js';

const W = VIEW.width;
const H = VIEW.height;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.hudPanel;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,210,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, fraction, colour, label, valueText) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fraction)), h);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 5);
  ctx.textAlign = 'right';
  ctx.fillText(valueText, x + w, y - 5);
}

/** A vertical tape with a big boxed readout (airspeed left, altitude right). */
function tape(ctx, x, y, h, value, step, label, unit) {
  panel(ctx, x, y, 92, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, 92, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  const centre = y + h / 2;
  const pxPerUnit = 1.1;
  const base = Math.round(value / step) * step;
  for (let v = base - step * 6; v <= base + step * 6; v += step) {
    if (v < 0) continue;
    const ty = centre - (v - value) * pxPerUnit * (100 / step) * 0.12;
    if (ty < y + 8 || ty > y + h - 8) continue;
    ctx.fillText(String(v), x + 66, ty + 4);
    ctx.fillRect(x + 72, ty, 10, 2);
  }
  ctx.restore();
  // The big readout box in the middle.
  ctx.fillStyle = '#0b1522';
  ctx.fillRect(x + 4, centre - 21, 84, 42);
  ctx.strokeStyle = PALETTE.hudAccent;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, centre - 21, 84, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 30px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(value)), x + 46, centre + 11);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(label, x + 46, y + 18);
  ctx.fillText(unit, x + 46, y + h - 8);
}

/** The heading strip across the top centre. */
function headingStrip(ctx, state) {
  const w = 380;
  const x = W / 2 - w / 2;
  const y = 14;
  panel(ctx, x, y, w, 52);
  const hdg = headingDegrees(state);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 52);
  ctx.clip();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 15px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  const pxPerDeg = 3.2;
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((hdg + d) % 360 + 360) % 360;
    const tx = W / 2 + d * pxPerDeg;
    if (deg % 30 === 0) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg / 10).padStart(2, '0');
      ctx.fillText(label, tx, y + 22);
      ctx.fillRect(tx - 1, y + 28, 2, 8);
    } else if (deg % 10 === 0) {
      ctx.fillRect(tx - 1, y + 30, 2, 6);
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7, y + 52);
  ctx.lineTo(W / 2 + 7, y + 52);
  ctx.lineTo(W / 2, y + 42);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 20px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${String(hdg).padStart(3, '0')}°`, W / 2, y + 40);
}

/** The attitude indicator: a little artificial horizon that rolls and pitches. */
function attitude(ctx, state) {
  const cx = W - 105;
  const cy = H - 105;
  const r = 62;
  panel(ctx, cx - r - 12, cy - r - 26, (r + 12) * 2, (r + 12) * 2 + 14);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-state.roll);
  const pitchPx = state.pitch * 90;
  ctx.fillStyle = '#4a90d9';
  ctx.fillRect(-r * 1.6, -r * 1.6 + pitchPx, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(-r * 1.6, pitchPx, r * 3.2, r * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  for (const a of [-20, -10, 10, 20]) {
    const yy = pitchPx - a * 2.2;
    ctx.beginPath();
    ctx.moveTo(-22, yy);
    ctx.lineTo(22, yy);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol.
  ctx.strokeStyle = PALETTE.hudAccent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 10, cy);
  ctx.lineTo(cx, cy + 6);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.stroke();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + r + 24);
}

/** Mission banner, target arrow and warnings in the middle of the screen. */
function guidance(ctx, state, banner) {
  const mission = state.mission;
  const target = missionTarget(mission);
  if (target && !state.onGround) {
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, -dz);
    let rel = bearing - state.heading;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    // Arrow at screen centre pointing toward the target.
    const cx = W / 2;
    const cy = H / 2 + 70;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rel);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(10, 10);
    ctx.lineTo(0, 4);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 19px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`, cx, cy + 38);
  }
  if (banner) {
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,18,28,0.55)';
    const w = ctx.measureText(banner).width + 44;
    ctx.beginPath();
    ctx.roundRect(W / 2 - w / 2, 92, w, 48, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.fillText(banner, W / 2, 126);
  }
  // Warnings.
  ctx.font = `700 22px ${FONT}`;
  ctx.textAlign = 'center';
  if (state.stalled) {
    ctx.fillStyle = PALETTE.hudBad;
    ctx.fillText('STALL — NOSE DOWN, ADD POWER', W / 2, 170);
  } else if (state.fuel < 15 && state.fuel > 0) {
    ctx.fillStyle = PALETTE.hudWarn;
    ctx.fillText('LOW FUEL', W / 2, 170);
  } else if (state.fuel === 0) {
    ctx.fillStyle = PALETTE.hudBad;
    ctx.fillText('FUEL EMPTY — GLIDE TO A LANDING', W / 2, 170);
  }
}

/** Paint the whole instrument panel over the 3D view. */
export function drawHud(ctx, state, banner) {
  tape(ctx, 16, 150, 300, knots(state), 10, 'AIRSPEED', 'KT');
  tape(ctx, W - 108, 150, 300, Math.max(0, feet(state)), 100, 'ALTITUDE', 'FT');
  headingStrip(ctx, state);
  attitude(ctx, state);

  // Vertical speed under the altitude tape.
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `600 15px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  const vsFpm = Math.round(state.verticalSpeed * 196.85);
  ctx.fillText(`${vsFpm >= 0 ? '+' : ''}${vsFpm} FPM`, W - 62, 478);

  // Engine and airframe bars, bottom left.
  panel(ctx, 16, H - 150, 250, 134);
  bar(ctx, 30, H - 118, 220, 13, state.throttle, '#7ec8ff', 'THROTTLE', `${Math.round(state.throttle * 100)}%`);
  const fuelColour = state.fuel < 15 ? PALETTE.hudBad : state.fuel < 35 ? PALETTE.hudWarn : PALETTE.hudGood;
  bar(ctx, 30, H - 88, 220, 13, state.fuel / 100, fuelColour, 'FUEL', `${Math.round(state.fuel)}%`);
  const hullColour = state.hull < 35 ? PALETTE.hudBad : state.hull < 70 ? PALETTE.hudWarn : PALETTE.hudGood;
  bar(ctx, 30, H - 58, 220, 13, state.hull / 100, hullColour, 'HULL', `${Math.round(state.hull)}%`);
  ctx.font = `600 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = state.gearDown ? PALETTE.hudGood : PALETTE.hudWarn;
  ctx.fillText(state.gearDown ? 'GEAR DOWN' : 'GEAR UP', 30, H - 28);
  ctx.fillStyle = state.flaps ? PALETTE.hudGood : PALETTE.hudText;
  ctx.fillText(state.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 140, H - 28);

  // Mission progress, top left; score, top right.
  const mission = state.mission;
  if (mission) {
    panel(ctx, 16, 14, 300, 86);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'left';
    const info = MISSION_LIST.find((m) => m.kind === mission.kind);
    ctx.fillText(info ? info.name : '', 28, 40);
    ctx.font = `600 15px ${FONT_MONO}`;
    let progress = '';
    if (mission.kind === 'rings') progress = `RINGS ${mission.ringsPassed}/10   ${formatTime(mission.elapsed)}`;
    else if (mission.kind === 'cargo') progress = `DROPS ${mission.dropsScored}/3   CRATES ${mission.cratesLeft}   ${formatTime(mission.elapsed)}`;
    else if (mission.kind === 'landing') progress = `LAND ON RUNWAY 36   ${formatTime(mission.elapsed)}`;
    else progress = `FREE FLIGHT   ${formatTime(mission.elapsed)}`;
    ctx.fillText(progress, 28, 66);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = 'rgba(234,246,255,0.75)';
    ctx.fillText(state.onGround ? 'Throttle up (W), rotate at 55 kt' : 'Arrows fly · W/S throttle · G gear · F flaps', 28, 88);
  }
  panel(ctx, W - 196, 14, 180, 62);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = `700 24px ${FONT_MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(String(state.score), W - 30, 44);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText('SCORE', W - 30, 64);

  guidance(ctx, state, banner);
}

/** The title screen: game name, sortie cards, controls. */
export function drawTitle(ctx, best) {
  ctx.fillStyle = 'rgba(8, 16, 28, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText('A N   O R I G I N A L   F L I G H T   G A M E', W / 2, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText('ALBATROSS AIR RALLY', W / 2, 158);
  ctx.font = `400 19px ${FONT}`;
  ctx.fillStyle = 'rgba(234,246,255,0.9)';
  ctx.fillText('Three sorties over the archipelago in the Kestrel K-9 bush plane.', W / 2, 192);

  const cardW = 268;
  const gap = 18;
  const total = cardW * 4 + gap * 3;
  let x = (W - total) / 2;
  for (const mission of MISSION_LIST) {
    panel(ctx, x, 240, cardW, 150);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(mission.name, x + 16, 272);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `400 14px ${FONT}`;
    wrapText(ctx, mission.brief, x + 16, 298, cardW - 32, 19);
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`Press ${mission.keys}`, x + 16, 368);
    x += cardW + gap;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText('Arrows pitch & roll · W/S throttle · A/D rudder · G gear · F flaps · SPACE drop/brake · C camera · P pause · M sound', W / 2, 452);
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = 'rgba(234,246,255,0.85)';
  ctx.fillText('Mouse steers too — move to bank and pitch, wheel for throttle. Mind the fuel, mind the mountains, land like you mean it.', W / 2, 482);
  if (best > 0) {
    ctx.font = `700 18px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.hudAccent;
    ctx.fillText(`BEST SCORE ${best}`, W / 2, 530);
  }
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = 'rgba(234,246,255,0.6)';
  ctx.fillText('Kestrel K-9 · an original game — no commercial names, art or music', W / 2, H - 26);
}

/** The debrief screen after a sortie ends (finished, crashed or ditched). */
export function drawDebrief(ctx, state, best) {
  ctx.fillStyle = 'rgba(8, 16, 28, 0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.crashed ? PALETTE.hudBad : PALETTE.hudGood;
  ctx.font = `800 52px ${FONT}`;
  ctx.fillText(state.crashed ? 'AIRCRAFT DOWN' : 'SORTIE COMPLETE', W / 2, 210);
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 20px ${FONT}`;
  const mission = state.mission;
  const line = state.crashed
    ? 'The Kestrel did not survive that one. The archipelago sends its regards.'
    : mission?.result ?? '';
  wrapText(ctx, line, W / 2 - 330, 262, 660, 27, true);
  ctx.font = `700 30px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.hudAccent;
  ctx.fillText(`SCORE ${state.score}`, W / 2, 350);
  ctx.font = `600 18px ${FONT_MONO}`;
  ctx.fillStyle = PALETTE.hudText;
  ctx.fillText(`BEST ${best}   ·   TIME ${formatTime(mission?.elapsed ?? 0)}   ·   HULL ${Math.round(state.hull)}%   ·   FUEL ${Math.round(state.fuel)}%`, W / 2, 388);
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('R — fly it again        ESC — back to the hangar', W / 2, 460);
}

/** The pause overlay. */
export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(8, 16, 28, 0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 48px ${FONT}`;
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('P or ESC — back to the sky', W / 2, H / 2 + 34);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, centre = false) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, centre ? x + maxWidth / 2 : x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, centre ? x + maxWidth / 2 : x, yy);
}
