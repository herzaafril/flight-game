// A tiny static server for game/ (Node 22, standard library only), so the
// game can be played locally with no build step: `node serve.ts` serves
// game/ on http://localhost:8080 (or --port N). Development convenience
// only; it refuses any path outside game/.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const file = resolve(join(root, rel === '' ? 'index.html' : rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let target = file;
  try {
    if (statSync(target).isDirectory()) target = join(target, 'index.html');
    statSync(target);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(target).pipe(res);
});

server.listen(port, () => {
  console.log(`Albatross Air Rally: serving game/ at http://localhost:${port}`);
});
