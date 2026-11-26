// Albatross Air Rally — every tuning number in one place.
//
// The world is metres, x east, y up, z south (heading 0 is north, toward -z).
// Speeds are metres per second inside the simulation; the HUD converts to
// knots and feet for display.

/** Logical canvas size; the renderer scales it to the window. */
export const VIEW = { width: 1280, height: 720 };

/** Fixed simulation step: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** World extent: the heightmap grid spans this many metres square. */
export const WORLD = {
  size: 6400,
  grid: 96, // cells per side (grid+1 vertices)
  viewDistance: 4300,
  seaLevel: 0,
};

/** Aircraft performance, tuned so the Kestrel K-9 feels like a bush plane. */
export const AIRCRAFT = {
  mass: 1100, // kg, only scales the forces below
  maxThrust: 5200, // newtons at full throttle
  stallSpeed: 23, // m/s, about 45 kt
  rotateSpeed: 27, // m/s, about 52 kt
  dragCoeff: 1.05,
  pitchRate: 0.9, // rad/s at full deflection
  rollRate: 1.7, // rad/s at full deflection
  yawRate: 0.45, // rad/s of rudder
  maxPitch: 0.62, // rad, about 35 degrees
  maxRoll: 1.15, // rad, about 66 degrees
  gearHeight: 1.1, // metres from ground to the aircraft origin on its wheels
  fuelCapacity: 100, // percent units
  fuelBurnIdle: 0.045, // percent per second at idle
  fuelBurnFull: 0.34, // percent per second at full throttle
  hullMax: 100,
  hardLandingVs: 3.2, // m/s of descent at touchdown that starts to hurt
  crashVs: 8.5, // m/s of descent at touchdown that wrecks the aircraft
  crashSpeed: 38, // m/s ground speed into terrain that wrecks it
};

/** Camera distances for the chase and cockpit views. */
export const CAMERA = {
  chaseDistance: 26,
  chaseHeight: 7.5,
  chaseLookAhead: 46,
  fov: 1.22, // vertical field of view, radians (about 70 degrees)
  near: 0.6,
};

/** Mission numbers: ring counts, par times, drop zones, scoring. */
export const MISSIONS = {
  ringCount: 10,
  ringRadius: 26, // metres
  ringParSeconds: 260,
  ringPoints: 100,
  dropCount: 3,
  dropPointsNear: 300,
  dropPointsFar: 60,
  dropZoneRadius: 90, // metres for a scored drop
  landingParVs: 1.4, // m/s touchdown descent for full marks
};

/** Palette: one coastal-afternoon style for terrain, sky and aircraft. */
export const PALETTE = {
  skyTop: '#3d7ac2',
  skyHorizon: '#cfe8f5',
  skyDuskTop: '#2c3a63',
  skyDuskHorizon: '#f2a65a',
  sun: '#fff3c4',
  water: '#2e6da8',
  waterDeep: '#255a8c',
  sand: '#e3d3a1',
  grass: '#6fae4e',
  grassDry: '#9ab85c',
  forest: '#3f7d3a',
  rock: '#8a7f72',
  snow: '#f4f7fa',
  runway: '#3a3f46',
  runwayLine: '#f5f5f0',
  townRoof: '#b3543f',
  townWall: '#e8ddc8',
  hullWhite: '#f2f4f6',
  hullStripe: '#e8641e',
  canopy: '#20303e',
  ringNext: '#ffd23e',
  ringOther: '#cfe8ff',
  hudPanel: 'rgba(10, 18, 28, 0.72)',
  hudText: '#eaf6ff',
  hudAccent: '#ffd23e',
  hudGood: '#5ee08a',
  hudWarn: '#ffb03e',
  hudBad: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Consolas, monospace';

/** Where the best rally score is kept between visits (this browser only). */
export const BEST_KEY = 'albatross-air-rally.best';
