// A small seeded random number generator (mulberry32): the same seed gives
// the same archipelago and the same screenshot scenes every time.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic 2D value-noise field built from a seeded generator. */
export function createNoise(random, size) {
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i += 1) values[i] = random();
  const at = (x, z) => values[((z % size + size) % size) * size + ((x % size + size) % size)];
  return function noise(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const sx = xf * xf * (3 - 2 * xf);
    const sz = zf * zf * (3 - 2 * zf);
    const top = at(xi, zi) * (1 - sx) + at(xi + 1, zi) * sx;
    const bottom = at(xi, zi + 1) * (1 - sx) + at(xi + 1, zi + 1) * sx;
    return top * (1 - sz) + bottom * sz;
  };
}
