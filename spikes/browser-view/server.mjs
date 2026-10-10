// Spike: the browser view's server. Serves the page built by build.mjs and one folder of notes to it, on this machine
// only (127.0.0.1), so the Obsidian plugin's own view can run in the Claude Code desktop app's browser pane.
//   node spikes/browser-view/server.mjs <notes folder> [--port N] [--host name.ts.net --tailscale-user login]
// Every request must name an allowed Host (DNS rebinding), every API call carries the token printed at start, and a
// note's path must stay inside the folder and end in .md. With --host, a request through `tailscale serve` is also let in
// when Tailscale says it comes from --tailscale-user. Spike code: not a package, nothing released.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = resolve(args[0] ?? '.');
const port = Number(flag('--port') ?? 0);
const tsHost = flag('--host');
const tsUser = flag('--tailscale-user');
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const token = randomBytes(24).toString('base64url');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };

/** The note at `p`, inside the root and a Markdown file, or null. */
function notePath(p) {
  if (!p || extname(p) !== '.md') return null;
  const full = resolve(root, p);
  const rel = relative(root, full);
  return rel && !rel.startsWith('..') && !rel.startsWith(sep) ? full : null;
}

/** Whether the request may come in: from this machine by its own name, or from the one Tailscale user named. */
function allowed(req, local) {
  const host = req.headers.host ?? '';
  if (host === `127.0.0.1:${local}` || host === `localhost:${local}`) return true;
  return Boolean(tsHost && tsUser && host === tsHost && req.headers['tailscale-user-login'] === tsUser);
}

const server = createServer(async (req, res) => {
  const local = server.address().port;
  const send = (code, body, type = 'text/plain') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  };
  if (!allowed(req, local)) return send(403, 'not from here');
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.headers['x-token'] !== token) return send(401, 'no token');
    const file = notePath(url.searchParams.get('path') ?? '');
    if (!file) return send(400, 'not a note in the folder');
    if (url.pathname === '/api/note' && req.method === 'GET')
      return readFile(file, 'utf8').then(
        (t) => send(200, t),
        () => send(404, 'no such note'),
      );
    if (url.pathname === '/api/note' && req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      await writeFile(file, body);
      return send(204, '');
    }
    return send(404, 'no such call');
  }
  const asset = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (asset.includes('..') || !TYPES[extname(asset)]) return send(404, 'not found');
  readFile(join(out, asset)).then(
    (b) => send(200, b, TYPES[extname(asset)]),
    () => send(404, 'not found'),
  );
});

server.listen(port, '127.0.0.1', () => {
  // the token rides in the fragment, which the browser never sends: the page reads it and sends it as a header
  process.stdout.write(`http://127.0.0.1:${server.address().port}/#token=${token}\n`);
});
