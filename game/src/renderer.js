// The software 3D renderer: a chase/cockpit camera over the heightmap
// archipelago, drawn with canvas 2D polygons sorted far to near. No library,
// no assets — every polygon comes from terrain.js and aircraft.js data.

import { CAMERA, PALETTE, VIEW, WORLD } from './config.js';
import { DROP_ZONES, LIGHTHOUSE, RING_COURSE, RUNWAY, terrainColour } from './terrain.js';
import { buildAircraftMesh } from './aircraft.js';

const FOCAL = (VIEW.height / 2) / Math.tan(CAMERA.fov / 2);
const SUN_DAY = normalize([-0.45, 0.75, -0.35]);
const SUN_DUSK = normalize([-0.85, 0.18, 0.25]);

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Orientation basis (right, up, forward) from heading/pitch/roll in radians. */
export function orientationBasis(heading, pitch, roll) {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const forward = [sh * cp, sp, -ch * cp];
  const right0 = [ch, 0, sh];
  const up0 = cross(right0, forward);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // Positive roll banks right: the right wing drops, so the right vector
  // tilts down and the up (lift) vector tilts toward the turn.
  const right = [
    right0[0] * cr - up0[0] * sr,
    right0[1] * cr - up0[1] * sr,
    right0[2] * cr - up0[2] * sr,
  ];
  const up = cross(right, forward);
  return { right, up, forward };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const aircraftMesh = buildAircraftMesh();
  let camPos = null;
  let camFwd = [0, 0, -1];

  function resize() {
    const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
    canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Build the camera for this frame from the aircraft state. */
  function buildCamera(state) {
    const basis = orientationBasis(state.heading, state.pitch, state.roll);
    const pos = [state.x, state.y, state.z];
    let target;
    let look;
    if (state.camera === 'cockpit') {
      target = [
        pos[0] + basis.forward[0] * 2 + basis.up[0] * 1.2,
        pos[1] + basis.forward[1] * 2 + basis.up[1] * 1.2,
        pos[2] + basis.forward[2] * 2 + basis.up[2] * 1.2,
      ];
      look = [pos[0] + basis.forward[0] * 100, pos[1] + basis.forward[1] * 100, pos[2] + basis.forward[2] * 100];
      camPos = target;
      camFwd = normalize(sub(look, target));
    } else {
      target = [
        pos[0] - basis.forward[0] * CAMERA.chaseDistance,
        pos[1] - basis.forward[1] * CAMERA.chaseDistance + CAMERA.chaseHeight,
        pos[2] - basis.forward[2] * CAMERA.chaseDistance,
      ];
      // Smooth the chase camera so it never snaps or fights the pilot.
      if (camPos === null) camPos = target;
      const k = 0.16;
      camPos = [
        camPos[0] + (target[0] - camPos[0]) * k,
        camPos[1] + (target[1] - camPos[1]) * k,
        camPos[2] + (target[2] - camPos[2]) * k,
      ];
      look = [
        pos[0] + basis.forward[0] * CAMERA.chaseLookAhead,
        pos[1] + basis.forward[1] * CAMERA.chaseLookAhead,
        pos[2] + basis.forward[2] * CAMERA.chaseLookAhead,
      ];
      camFwd = normalize(sub(look, camPos));
    }
    const right = normalize(cross(camFwd, [0, 1, 0]));
    const up = cross(right, camFwd);
    return { pos: camPos, right, up, forward: camFwd, basis };
  }

  /** Project a world point; null when behind the near plane. */
  function project(cam, p) {
    const d = sub(p, cam.pos);
    const cz = dot(d, cam.forward);
    if (cz < CAMERA.near) return null;
    const cx = dot(d, cam.right);
    const cy = dot(d, cam.up);
    return [VIEW.width / 2 + (cx / cz) * FOCAL, VIEW.height / 2 - (cy / cz) * FOCAL, cz];
  }

  function poly(points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function shade(colour, factor) {
    const r = Math.min(255, Math.round(colour[0] * 255 * factor));
    const g = Math.min(255, Math.round(colour[1] * 255 * factor));
    const b = Math.min(255, Math.round(colour[2] * 255 * factor));
    return `rgb(${r},${g},${b})`;
  }

  function drawSky(state, cam) {
    const dusk = state.timeOfDay === 'dusk';
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, dusk ? PALETTE.skyDuskTop : PALETTE.skyTop);
    grad.addColorStop(0.55, dusk ? '#7a5a7d' : '#8fc3e8');
    grad.addColorStop(1, dusk ? PALETTE.skyDuskHorizon : PALETTE.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sea to the horizon: fill below the projected horizon line.
    const far = [cam.pos[0] + cam.forward[0] * 20000, 0, cam.pos[2] + cam.forward[2] * 20000];
    const horizon = project(cam, far);
    const horizonY = horizon ? horizon[1] : VIEW.height / 2;
    ctx.fillStyle = dusk ? '#3a4a72' : PALETTE.water;
    ctx.fillRect(0, Math.max(0, horizonY), VIEW.width, VIEW.height);
    // Sun disc.
    const sun = dusk ? SUN_DUSK : SUN_DAY;
    const sunPos = [cam.pos[0] + sun[0] * 9000, cam.pos[1] + sun[1] * 9000, cam.pos[2] + sun[2] * 9000];
    const sp = project(cam, sunPos);
    if (sp) {
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], dusk ? 46 : 34, 0, Math.PI * 2);
      ctx.fillStyle = dusk ? '#ffb03e' : PALETTE.sun;
      ctx.fill();
    }
    // Clouds: soft billboard ellipses at fixed world spots.
    ctx.fillStyle = dusk ? 'rgba(255,210,170,0.5)' : 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 14; i += 1) {
      const cx = Math.sin(i * 12.9898) * 2600;
      const cz = Math.cos(i * 7.233) * 2600;
      const cy = 520 + (i % 4) * 90;
      const p = project(cam, [cx, cy, cz]);
      if (!p || p[2] > 9000) continue;
      const w = Math.min(340, 90000 / p[2]);
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], w, w * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain(state, terrain, cam) {
    const sun = state.timeOfDay === 'dusk' ? SUN_DUSK : SUN_DAY;
    const ambient = state.timeOfDay === 'dusk' ? 0.62 : 0.8;
    const n = WORLD.grid + 1;
    const cell = terrain.cell;
    const half = terrain.half;
    const quads = [];
    const i0 = Math.max(0, Math.floor((cam.pos[0] - WORLD.viewDistance + half) / cell));
    const i1 = Math.min(WORLD.grid - 1, Math.ceil((cam.pos[0] + WORLD.viewDistance + half) / cell));
    const j0 = Math.max(0, Math.floor((cam.pos[2] - WORLD.viewDistance + half) / cell));
    const j1 = Math.min(WORLD.grid - 1, Math.ceil((cam.pos[2] + WORLD.viewDistance + half) / cell));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const x = -half + i * cell;
        const z = -half + j * cell;
        const h00 = terrain.heights[j * n + i];
        const h10 = terrain.heights[j * n + i + 1];
        const h01 = terrain.heights[(j + 1) * n + i];
        const h11 = terrain.heights[(j + 1) * n + i + 1];
        const corners = [
          [x, h00, z],
          [x + cell, h10, z],
          [x + cell, h11, z + cell],
          [x, h01, z + cell],
        ];
        const projected = corners.map((c) => project(cam, c));
        if (projected.some((p) => p === null)) continue;
        const depth = (projected[0][2] + projected[2][2]) / 2;
        if (depth > WORLD.viewDistance) continue;
        const avgH = (h00 + h10 + h01 + h11) / 4;
        const steep = Math.min(1, Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / cell);
        const variation = ((i * 73856093) ^ (j * 19349663)) % 100 / 100;
        const normal = normalize(cross(sub(corners[2], corners[0]), sub(corners[1], corners[3])));
        const light = ambient + (1 - ambient) * Math.max(0, dot(normal, sun));
        quads.push({ projected, depth, colour: terrainColour(avgH, steep, Math.abs(variation)), light });
      }
    }
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) poly(q.projected, shade(q.colour, q.light));
  }

  function drawRunway(state, cam) {
    const y = RUNWAY.height + 0.25;
    const hw = RUNWAY.width / 2;
    const hl = RUNWAY.length / 2;
    const corners = [
      [RUNWAY.x - hw, y, RUNWAY.z - hl],
      [RUNWAY.x + hw, y, RUNWAY.z - hl],
      [RUNWAY.x + hw, y, RUNWAY.z + hl],
      [RUNWAY.x - hw, y, RUNWAY.z + hl],
    ].map((c) => project(cam, c));
    if (corners.some((p) => p === null)) return;
    poly(corners, PALETTE.runway);
    // Centreline dashes and threshold bars.
    ctx.fillStyle = PALETTE.runwayLine;
    for (let d = -hl + 30; d < hl - 20; d += 60) {
      const dash = [
        [RUNWAY.x - 1.2, y + 0.05, RUNWAY.z + d],
        [RUNWAY.x + 1.2, y + 0.05, RUNWAY.z + d],
        [RUNWAY.x + 1.2, y + 0.05, RUNWAY.z + d + 30],
        [RUNWAY.x - 1.2, y + 0.05, RUNWAY.z + d + 30],
      ].map((c) => project(cam, c));
      if (!dash.some((p) => p === null)) poly(dash, PALETTE.runwayLine);
    }
    for (const end of [-hl + 12, hl - 26]) {
      for (let s = -3; s <= 3; s += 1) {
        const bar = [
          [RUNWAY.x + s * 5.4 - 1.6, y + 0.05, RUNWAY.z + end],
          [RUNWAY.x + s * 5.4 + 1.6, y + 0.05, RUNWAY.z + end],
          [RUNWAY.x + s * 5.4 + 1.6, y + 0.05, RUNWAY.z + end + 14],
          [RUNWAY.x + s * 5.4 - 1.6, y + 0.05, RUNWAY.z + end + 14],
        ].map((c) => project(cam, c));
        if (!bar.some((p) => p === null)) poly(bar, PALETTE.runwayLine);
      }
    }
    // Edge lights, lit at dusk.
    if (state.timeOfDay === 'dusk') {
      ctx.fillStyle = '#ffd23e';
      for (let d = -hl; d <= hl; d += 45) {
        for (const side of [-hw - 2, hw + 2]) {
          const p = project(cam, [RUNWAY.x + side, y + 1, RUNWAY.z + d]);
          if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.5, 60 / p[2]), 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
  }

  function drawBox(cam, cx, cy, cz, w, h, d, rot, colours) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const local = [
      [-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2],
      [-w / 2, h, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2],
    ].map(([lx, ly, lz]) => [cx + lx * cos - lz * sin, cy + ly, cz + lx * sin + lz * cos]);
    const faces = [
      [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7],
    ];
    const drawn = [];
    for (let f = 0; f < faces.length; f += 1) {
      const pts = faces[f].map((idx) => project(cam, local[idx]));
      if (pts.some((p) => p === null)) continue;
      drawn.push({ pts, depth: pts[0][2], colour: colours[f % colours.length] });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    for (const item of drawn) poly(item.pts, item.colour);
  }

  function drawTownAndTrees(state, terrain, cam) {
    for (const house of terrain.houses) {
      const d = Math.hypot(house.x - cam.pos[0], house.z - cam.pos[2]);
      if (d > 2600) continue;
      drawBox(cam, house.x, house.h, house.z, house.w, house.tall, house.d, house.rot,
        [PALETTE.townWall, '#d9cdb2', PALETTE.townWall, '#d9cdb2', PALETTE.townRoof]);
    }
    // Lighthouse: stacked bands on the point.
    const lh = terrain.sampleHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
    drawBox(cam, LIGHTHOUSE.x, lh, LIGHTHOUSE.z, 9, 16, 9, 0.3, ['#f2f4f6', '#e8ecf0', '#f2f4f6', '#e8ecf0', '#c33']);
    drawBox(cam, LIGHTHOUSE.x, lh + 16, LIGHTHOUSE.z, 7, 12, 7, 0.3, ['#d33b2e', '#c23024', '#d33b2e', '#c23024', '#333']);
    drawBox(cam, LIGHTHOUSE.x, lh + 28, LIGHTHOUSE.z, 5, 5, 5, 0.3, ['#ffd23e', '#ffd23e', '#ffd23e', '#ffd23e', '#222']);
    // Trees: simple cones.
    for (const tree of terrain.trees) {
      const d = Math.hypot(tree.x - cam.pos[0], tree.z - cam.pos[2]);
      if (d > 1700) continue;
      const top = project(cam, [tree.x, tree.h + 13 * tree.s, tree.z]);
      const left = project(cam, [tree.x - 4.5 * tree.s, tree.h, tree.z]);
      const right = project(cam, [tree.x + 4.5 * tree.s, tree.h, tree.z]);
      if (!top || !left || !right) continue;
      poly([top, right, left], '#2f6b33');
    }
  }

  function drawRings(state, cam) {
    const mission = state.mission;
    if (!mission || mission.kind !== 'rings') return;
    for (let i = 0; i < RING_COURSE.length; i += 1) {
      const ring = RING_COURSE[i];
      // The ring faces along the course: direction from the previous gate
      // to the next one (the first and last gates use their one neighbour).
      const from = RING_COURSE[Math.max(i - 1, 0)];
      const to = RING_COURSE[Math.min(i + 1, RING_COURSE.length - 1)];
      const dir = normalize([to.x - from.x, 0, to.z - from.z]);
      const side = [dir[2], 0, -dir[0]];
      const points = [];
      let ok = true;
      for (let s = 0; s <= 24; s += 1) {
        const a = (s / 24) * Math.PI * 2;
        const p = [
          ring.x + side[0] * Math.cos(a) * 26,
          ring.y + Math.sin(a) * 26,
          ring.z + side[2] * Math.cos(a) * 26,
        ];
        const pr = project(cam, p);
        if (!pr) { ok = false; break; }
        points.push(pr);
      }
      if (!ok) continue;
      const isNext = i === mission.nextRing;
      const passed = i < mission.nextRing;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const p of points) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = passed ? 'rgba(94,224,138,0.5)' : isNext ? PALETTE.ringNext : 'rgba(207,232,255,0.55)';
      ctx.lineWidth = Math.max(2, Math.min(14, 2600 / points[0][2]));
      if (isNext) { ctx.shadowColor = PALETTE.ringNext; ctx.shadowBlur = 18; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawDropZones(state, terrain, cam) {
    const mission = state.mission;
    if (!mission || mission.kind !== 'cargo') return;
    for (let i = 0; i < DROP_ZONES.length; i += 1) {
      const zone = DROP_ZONES[i];
      const h = terrain.sampleHeight(zone.x, zone.z);
      const points = [];
      let ok = true;
      for (let s = 0; s <= 28; s += 1) {
        const a = (s / 28) * Math.PI * 2;
        const px = zone.x + Math.cos(a) * 60;
        const pz = zone.z + Math.sin(a) * 60;
        const pr = project(cam, [px, terrain.sampleHeight(px, pz) + 1, pz]);
        if (!pr) { ok = false; break; }
        points.push(pr);
      }
      if (!ok) continue;
      const active = i === mission.nextDrop;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const p of points) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = active ? '#ffd23e' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(2, Math.min(8, 1600 / points[0][2]));
      ctx.stroke();
      const centre = project(cam, [zone.x, h + 2, zone.z]);
      if (centre && active) {
        ctx.beginPath();
        ctx.arc(centre[0], centre[1], Math.max(2, 200 / centre[2]), 0, Math.PI * 2);
        ctx.fillStyle = '#ffd23e';
        ctx.fill();
      }
    }
    // The falling crate.
    if (state.crate) {
      const c = state.crate;
      drawBox(cam, c.x, c.y, c.z, 2.4, 2.4, 2.4, c.rot, ['#b07a3f', '#9c6a34', '#b07a3f', '#9c6a34', '#c98d4b']);
      const chute = project(cam, [c.x, c.y + 4.5, c.z]);
      if (chute) {
        ctx.beginPath();
        ctx.ellipse(chute[0], chute[1], Math.max(3, 900 / chute[2]), Math.max(1.5, 320 / chute[2]), 0, Math.PI, Math.PI * 2);
        ctx.fillStyle = '#e8641e';
        ctx.fill();
      }
    }
  }

  function drawAircraft(state, cam) {
    if (state.camera === 'cockpit') return;
    const basis = cam.basis;
    const pos = [state.x, state.y, state.z];
    const drawn = [];
    for (const face of aircraftMesh.faces) {
      const world = face.points.map(([lx, ly, lz]) => [
        pos[0] + basis.right[0] * lx + basis.up[0] * ly - basis.forward[0] * lz,
        pos[1] + basis.right[1] * lx + basis.up[1] * ly - basis.forward[1] * lz,
        pos[2] + basis.right[2] * lx + basis.up[2] * ly - basis.forward[2] * lz,
      ]);
      const pts = world.map((p) => project(cam, p));
      if (pts.some((p) => p === null)) continue;
      drawn.push({ pts, depth: pts[0][2], colour: face.colour, alpha: face.alpha ?? 1 });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    for (const item of drawn) {
      ctx.globalAlpha = item.alpha;
      poly(item.pts, item.colour);
    }
    ctx.globalAlpha = 1;
    // Spinning propeller: a translucent disc plus two blades at the nose.
    const nose = [
      pos[0] + basis.forward[0] * 4.6,
      pos[1] + basis.forward[1] * 4.6 + 0.2,
      pos[2] + basis.forward[2] * 4.6,
    ];
    const centre = project(cam, nose);
    if (centre && state.throttle > 0.02) {
      const r = Math.max(3, 2600 / centre[2]);
      ctx.beginPath();
      ctx.arc(centre[0], centre[1], r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30,30,34,0.28)';
      ctx.fill();
      const a = state.time * 40;
      ctx.strokeStyle = 'rgba(20,20,24,0.8)';
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(centre[0] - Math.cos(a) * r, centre[1] - Math.sin(a) * r);
      ctx.lineTo(centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r);
      ctx.stroke();
    }
  }

  function drawCockpitFrame(state) {
    if (state.camera !== 'cockpit') return;
    ctx.fillStyle = '#141a20';
    ctx.beginPath();
    ctx.moveTo(0, VIEW.height);
    ctx.lineTo(0, VIEW.height - 120);
    ctx.quadraticCurveTo(VIEW.width / 2, VIEW.height - 190, VIEW.width, VIEW.height - 120);
    ctx.lineTo(VIEW.width, VIEW.height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(VIEW.width / 2 - 90, VIEW.height - 150, 180, 60);
  }

  return {
    /** Paint one frame of the world (the HUD is painted by hud.js after). */
    draw(state, terrain) {
      const cam = buildCamera(state);
      drawSky(state, cam);
      drawTerrain(state, terrain, cam);
      drawRunway(state, cam);
      drawTownAndTrees(state, terrain, cam);
      drawDropZones(state, terrain, cam);
      drawRings(state, cam);
      drawAircraft(state, cam);
      drawCockpitFrame(state);
    },
    resetCamera() { camPos = null; },
  };
}
