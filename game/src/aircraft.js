// The Kestrel K-9 bush plane as a polygon mesh: tapered fuselage, glass
// canopy, high wing with orange tips, tail feathers, fixed gear, livery
// stripe and navigation lights. Local space: x right, y up, z toward the
// tail (the nose is at negative z, matching the renderer's transform).

import { PALETTE } from './config.js';

const WHITE = PALETTE.hullWhite;
const ORANGE = PALETTE.hullStripe;
const GLASS = PALETTE.canopy;
const DARK = '#2a2e33';
const TYRE = '#1b1d20';

/** Push the six faces of an axis-aligned box centred at (cx, cy, cz). */
function box(faces, cx, cy, cz, w, h, d, colour, topColour) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const quads = [
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0],
  ];
  quads.forEach((quad, i) => {
    faces.push({ points: quad.map((idx) => v[idx]), colour: i === 4 && topColour ? topColour : colour });
  });
}

/** One fuselage segment between two cross-sections (z, halfW, yBottom, yTop). */
function fuselageSegment(faces, a, b, colour) {
  const ring = (s) => [
    [-s.hw, s.yb, s.z], [s.hw, s.yb, s.z], [s.hw, s.yt, s.z], [-s.hw, s.yt, s.z],
  ];
  const ra = ring(a);
  const rb = ring(b);
  for (let side = 0; side < 4; side += 1) {
    const next = (side + 1) % 4;
    faces.push({ points: [ra[side], ra[next], rb[next], rb[side]], colour });
  }
}

/** Build the full aircraft mesh: a list of coloured polygon faces. */
export function buildAircraftMesh() {
  const faces = [];

  // Fuselage: nose, cabin and tail sections, tapered both ways.
  const sections = [
    { z: -4.4, hw: 0.42, yb: -0.45, yt: 0.55 },
    { z: -2.6, hw: 0.72, yb: -0.75, yt: 0.85 },
    { z: -0.4, hw: 0.78, yb: -0.8, yt: 0.9 },
    { z: 1.8, hw: 0.62, yb: -0.6, yt: 0.72 },
    { z: 3.8, hw: 0.3, yb: -0.3, yt: 0.45 },
  ];
  for (let i = 0; i < sections.length - 1; i += 1) {
    fuselageSegment(faces, sections[i], sections[i + 1], WHITE);
  }
  // Nose cap and spinner.
  faces.push({ points: [[-0.42, -0.45, -4.4], [0.42, -0.45, -4.4], [0.42, 0.55, -4.4], [-0.42, 0.55, -4.4]], colour: ORANGE });
  box(faces, 0, 0.05, -4.62, 0.34, 0.34, 0.45, DARK);

  // Livery stripe along both flanks.
  box(faces, -0.79, 0.05, -0.6, 0.04, 0.34, 4.6, ORANGE);
  box(faces, 0.79, 0.05, -0.6, 0.04, 0.34, 4.6, ORANGE);

  // Canopy glass over the cabin.
  box(faces, 0, 0.98, -1.5, 1.15, 0.5, 1.9, GLASS, GLASS);

  // High wing: two halves with slight dihedral, orange tips.
  const wingY = 1.05;
  const wingChord = 1.7;
  const wingZ = -1.1;
  const dihedral = 0.42; // tip rise over the half-span
  const wingHalf = (side) => {
    const root = [side * 0.5, wingY, wingZ];
    const tip = [side * 5.6, wingY + dihedral, wingZ];
    const facesWing = [
      { points: [[root[0], root[1], root[2] - wingChord / 2], [tip[0], tip[1], tip[2] - wingChord / 2], [tip[0], tip[1], tip[2] + wingChord / 2], [root[0], root[1], root[2] + wingChord / 2]], colour: WHITE },
      { points: [[root[0], root[1] - 0.14, root[2] - wingChord / 2], [root[0], root[1] - 0.14, root[2] + wingChord / 2], [tip[0], tip[1] - 0.14, tip[2] + wingChord / 2], [tip[0], tip[1] - 0.14, tip[2] - wingChord / 2]], colour: '#d7dde3' },
    ];
    faces.push(...facesWing);
    // Orange tip cap.
    box(faces, side * 5.35, wingY + dihedral - 0.07, wingZ, 0.55, 0.16, wingChord, ORANGE);
  };
  wingHalf(-1);
  wingHalf(1);

  // Wing struts down to the fuselage.
  box(faces, -1.9, 0.35, -1.1, 0.09, 1.5, 0.09, DARK);
  box(faces, 1.9, 0.35, -1.1, 0.09, 1.5, 0.09, DARK);

  // Tail: horizontal stabiliser and vertical fin with orange flash.
  box(faces, 0, 0.42, 3.55, 3.4, 0.12, 1.0, WHITE);
  box(faces, 0, 1.05, 3.6, 0.12, 1.35, 1.05, WHITE);
  box(faces, 0, 1.35, 3.85, 0.14, 0.75, 0.55, ORANGE);

  // Fixed gear: legs and wheels under the cabin, small tail wheel.
  box(faces, -0.95, -1.15, -1.6, 0.14, 0.85, 0.14, DARK);
  box(faces, 0.95, -1.15, -1.6, 0.14, 0.85, 0.14, DARK);
  box(faces, -0.95, -1.62, -1.6, 0.3, 0.62, 0.62, TYRE);
  box(faces, 0.95, -1.62, -1.6, 0.3, 0.62, 0.62, TYRE);
  box(faces, 0, -0.62, 3.7, 0.16, 0.34, 0.34, TYRE);

  // Navigation lights: red port, green starboard, white tail.
  box(faces, -5.62, wingY + dihedral, wingZ, 0.12, 0.12, 0.3, '#ff3b30');
  box(faces, 5.62, wingY + dihedral, wingZ, 0.12, 0.12, 0.3, '#2ee66b');
  box(faces, 0, 0.45, 4.05, 0.14, 0.14, 0.1, '#ffffff');

  return { faces };
}
