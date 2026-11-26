// Albatross Air Rally entry program (Node 22, standard library only).
//
// Hands the game in: validates game/ and screenshots/ against the gate's
// caps, copies them to /output, and writes /output/dossier.json with the
// vendored make.fun library — the summary the judge reads. The game itself
// is plain static files under game/ (canvas 2D software 3D, no library, no
// network request); this program only packages it, twice with the same
// bytes out.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps (reference/gate.json): the dossier text cap shapes the
// bytes; the rest refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error(`albatross-air-rally: ${message}`);
}

/** Width and height of a PNG (IHDR) or JPEG (first SOF segment), else null. */
function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = bytes.readUInt16BE(i + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}

/** Walk a directory, returning every entry's relative path and file size. */
function walk(dir: string, base = ''): { path: string; bytes: number }[] {
  const found: { path: string; bytes: number }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, rel));
    else if (entry.isFile()) found.push({ path: rel, bytes: statSync(full).size });
    else fail(`game/ holds a non-file entry: ${rel}`);
  }
  return found;
}

function validateGame(gameDir: string): void {
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const files = walk(gameDir);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (files.length > CAPS.game_max_files) fail(`game/ holds ${files.length} files, over the ${CAPS.game_max_files} cap`);
  if (totalBytes > CAPS.game_max_bytes) fail(`game/ is ${totalBytes} bytes, over the ${CAPS.game_max_bytes} cap`);
  for (const file of files) {
    if (Buffer.byteLength(file.path, 'utf8') > CAPS.game_path_max_bytes) {
      fail(`game path over ${CAPS.game_path_max_bytes} bytes: ${file.path}`);
    }
  }
  const indexBytes = statSync(join(gameDir, 'index.html')).size;
  if (indexBytes > 1024 * 1024) fail(`game/index.html is ${indexBytes} bytes, over the 1 MiB cap`);
}

function validateScreenshots(shotsDir: string): string[] {
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const names = readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} images, the gate takes 3 to ${CAPS.screenshots.max}`);
  }
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('-')) fail(`screenshot name not allowed: ${name}`);
    const bytes = readFileSync(join(shotsDir, name));
    if (bytes.length > CAPS.screenshots.max_bytes) fail(`${name} is ${bytes.length} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
    const size = imageSize(bytes);
    if (!size) fail(`${name} is not a whole PNG or JPEG`);
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > 1280) fail(`${name} long side ${long} is over 1280`);
    if (short < 480) fail(`${name} short side ${short} is under 480`);
  }
  return names;
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
validateGame(gameDir);
const shotNames = validateScreenshots(shotsDir);

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

// The gate rebuilds the dossier with the same library and compares byte for
// byte; rebuild here too and refuse to hand in a mismatch.
const rebuilt = buildDossier(out, CAPS);
if (Buffer.compare(Buffer.from(dossier), Buffer.from(rebuilt)) !== 0) {
  fail('dossier.json does not rebuild byte for byte');
}
console.log(`albatross-air-rally: handed in game/ + ${shotNames.length} screenshots (${shotNames[0]} is the cover), dossier ${dossier.length} bytes`);
