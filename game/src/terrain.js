// The archipelago: a procedural heightmap with a main island, satellite
// islets, a home runway on the south coast, a harbour town, a lighthouse,
// scattered trees, cargo drop zones and the ring-rally course. Everything
// here is data — the renderer draws it, the flight model collides with it.

import { WORLD } from './config.js';
import { createNoise, createRandom } from './random.js';

const HALF = WORLD.size / 2;
const CELL = WORLD.size / WORLD.grid;

/** Island bumps: centre (x, z), radius and peak height in metres. */
const ISLANDS = [
  { x: -500, z: -300, radius: 1900, peak: 235 }, // main island, mountain spine
  { x: -1500, z: -1100, radius: 900, peak: 150 }, // north-west shoulder
  { x: 600, z: -1400, radius: 750, peak: 120 }, // north islet
  { x: 1500, z: 300, radius: 950, peak: 165 }, // east island
  { x: 900, z: 1500, radius: 700, peak: 95 }, // south-east islet
  { x: -1700, z: 1100, radius: 800, peak: 110 }, // south-west islet
  { x: 200, z: 2300, radius: 650, peak: 70 }, // far south islet
];

/** The home runway: a flat strip on the main island's south coast, heading north. */
export const RUNWAY = {
  x: -500,
  z: 1150,
  length: 900,
  width: 46,
  height: 6, // flattened terrain height at the strip, metres
  heading: 0, // degrees; the strip runs north-south, land on 36 (northbound)
};

/** The harbour town beside the runway, and the lighthouse on the point. */
export const TOWN = { x: -80, z: 1250, radius: 330 };
export const LIGHTHOUSE = { x: -1150, z: 1450 };

/** Cargo drop zones on three outlying islands (x, z, label). */
export const DROP_ZONES = [
  { x: 1500, z: 300, label: 'East Island village' },
  { x: 900, z: 1500, label: 'South-east fishery' },
  { x: -1700, z: 1100, label: 'South-west farm' },
];

/** The ring rally course: ten gates around the archipelago (x, y, z). */
export const RING_COURSE = [
  { x: -500, y: 280, z: 300 },
  { x: -1200, y: 300, z: -500 },
  { x: -400, y: 320, z: -1300 },
  { x: 600, y: 240, z: -1400 },
  { x: 1400, y: 220, z: -700 },
  { x: 1500, y: 260, z: 300 },
  { x: 900, y: 200, z: 1500 },
  { x: 200, y: 160, z: 2300 },
  { x: -900, y: 220, z: 1900 },
  { x: -500, y: 120, z: 1150 },
];

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Raw (unflattened) terrain height at a world position. */
function rawHeight(noise, x, z) {
  let h = -14;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
    if (d < 1.6) {
      const fall = Math.max(0, 1 - d * d);
      h += island.peak * fall * fall;
    }
  }
  if (h > -6) {
    const ridge = noise(x * 0.0016, z * 0.0016) * 0.65 + noise(x * 0.006, z * 0.006) * 0.35;
    h += (ridge - 0.5) * Math.min(70, Math.max(0, h) * 0.55);
  }
  return h;
}

/** Distance from a point to the runway rectangle (0 inside it). */
function runwayDistance(x, z) {
  const dx = Math.max(0, Math.abs(x - RUNWAY.x) - RUNWAY.width / 2);
  const dz = Math.max(0, Math.abs(z - RUNWAY.z) - RUNWAY.length / 2);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Build the terrain: heights grid, per-vertex colours, trees and houses. */
export function createTerrain(seed) {
  const random = createRandom(seed);
  const noise = createNoise(random, 64);
  const n = WORLD.grid + 1;
  const heights = new Float32Array(n * n);

  const heightAt = (x, z) => {
    let h = rawHeight(noise, x, z);
    // Flatten the runway strip and the town shelf so both sit level.
    const rd = runwayDistance(x, z);
    if (rd < 260) h = h * smoothstep(0, 260, rd) + RUNWAY.height * (1 - smoothstep(0, 260, rd));
    const td = Math.hypot(x - TOWN.x, z - TOWN.z);
    if (td < TOWN.radius + 180) {
      const t = smoothstep(TOWN.radius, TOWN.radius + 180, td);
      h = h * t + 9 * (1 - t);
    }
    return h;
  };

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      heights[j * n + i] = heightAt(-HALF + i * CELL, -HALF + j * CELL);
    }
  }

  /** Bilinear height sample for physics and placement. */
  function sampleHeight(x, z) {
    const gx = Math.min(WORLD.grid - 0.001, Math.max(0, (x + HALF) / CELL));
    const gz = Math.min(WORLD.grid - 0.001, Math.max(0, (z + HALF) / CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const a = heights[j * n + i];
    const b = heights[j * n + i + 1];
    const c = heights[(j + 1) * n + i];
    const d = heights[(j + 1) * n + i + 1];
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  }

  // Trees on grassy slopes, houses in the town: placed once, drawn by the renderer.
  const trees = [];
  for (let k = 0; k < 900 && trees.length < 340; k += 1) {
    const x = (random() - 0.5) * WORLD.size * 0.94;
    const z = (random() - 0.5) * WORLD.size * 0.94;
    const h = sampleHeight(x, z);
    if (h > 3 && h < 130 && runwayDistance(x, z) > 70 && Math.hypot(x - TOWN.x, z - TOWN.z) > 120) {
      trees.push({ x, z, h, s: 0.8 + random() * 0.7 });
    }
  }
  const houses = [];
  for (let k = 0; k < 46; k += 1) {
    const angle = random() * Math.PI * 2;
    const r = 40 + random() * (TOWN.radius - 90);
    const x = TOWN.x + Math.cos(angle) * r;
    const z = TOWN.z + Math.sin(angle) * r * 0.8;
    houses.push({ x, z, h: sampleHeight(x, z), rot: random() * Math.PI, w: 12 + random() * 10, d: 10 + random() * 8, tall: 6 + random() * 5 });
  }

  return { heights, sampleHeight, trees, houses, cell: CELL, half: HALF };
}

/** Terrain colour for a face from its average height and steepness. */
export function terrainColour(height, steepness, variation) {
  if (height < 0.4) return [0.18, 0.43, 0.66]; // shallow water over the shelf
  if (height < 2.2) return [0.89, 0.83, 0.63]; // sand
  if (steepness > 0.62) return [0.54, 0.5, 0.45]; // bare rock
  if (height > 195) return [0.96, 0.97, 0.98]; // snow
  if (height > 120) return [0.45, 0.48, 0.38]; // high scrub
  if (variation > 0.62) return [0.25, 0.49, 0.23]; // forest patches
  if (variation > 0.4) return [0.44, 0.68, 0.31]; // grass
  return [0.6, 0.72, 0.36]; // dry grass
}
