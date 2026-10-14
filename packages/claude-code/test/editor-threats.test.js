// The editor server's threat model (spec §26, slice 4; test_cc_threats), each threat proved against the running server,
// started here on a port the system chooses and stopped after: loopback only, wrong Host, wrong Origin, no token, a
// wrong token, a token in the address, a stale write, an oversized body, the content security policy, no CORS, a path
// escape (on C0's test-only note route; the real note store is C1), no outgoing request, and every way it stops. The
// idle stop is driven by a clock handed in, never by waiting: a test asserts the work done, never the time taken.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { READ_LIMITS } from '@graph-note/core';
import { startEditorServer, IDLE_MS } from '../server/start-server.ts';

const SERVER = fileURLToPath(new URL('../server/', import.meta.url));
const ENTRY = join(SERVER, 'editor-server.ts');
const NOTE = 'A test note, held in memory.';
const POLICY =
  "default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:; " +
  "style-src 'self'; frame-ancestors 'none'";

/** One request, made on a connection of its own; resolves with its status, headers and text. */
function ask(port, { method = 'GET', path = '/', headers = {}, body, setHost = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers, agent: false, setHost }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (text += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    if (Array.isArray(body)) {
      for (const part of body) req.write(part);
      req.end();
    } else req.end(body);
  });
}

/**
 * Whether anything answers a connection to an address and port. An address of this machine that drops the attempt,
 * as a VPN's may, is given a few seconds: a server listening there would have answered at once.
 */
function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** A server with the test-only note route, stopped when the file's tests end. */
async function started(options = {}) {
  const s = await startEditorServer({ testNotes: { sample: NOTE }, ...options });
  after(() => s.stop());
  return s;
}

const bearer = (s) => ({ authorization: `Bearer ${s.token}` });
const writing = (s, etag) => ({ ...bearer(s), origin: s.origin, 'sec-fetch-site': 'same-origin', 'if-match': etag });
const noteOf = async (s) => ask(s.port, { path: '/api/test-note/sample', headers: bearer(s) });

describe('loopback only (cc_loopback_only)', () => {
  test('it listens on 127.0.0.1 alone, on a port the system chose', async () => {
    const s = await started();
    assert.equal(s.address, '127.0.0.1');
    assert.ok(s.port > 0);
    assert.equal(s.origin, `http://127.0.0.1:${s.port}`);
    await assert.rejects(startEditorServer({ host: '0.0.0.0' }), /takes no host/);
    await assert.rejects(startEditorServer({ port: 8080 }), /takes no port/);
  });

  test('no other address of this machine reaches it, IPv6 loopback included', async () => {
    const s = await started();
    assert.ok(await reachable('127.0.0.1', s.port), 'the control: its own address reaches it');
    const others = Object.values(networkInterfaces())
      .flat()
      .filter((a) => !a.internal)
      .map((a) => a.address);
    const hosts = ['::1', ...others];
    const answered = await Promise.all(hosts.map((host) => reachable(host, s.port)));
    assert.equal(hosts.filter((_h, i) => answered[i]).join(), '', 'answered there');
  });

  test('the process takes no port or host to listen on, and no remote reach', () => {
    for (const args of [
      ['--port', '8080'],
      ['--host', '0.0.0.0'],
      ['--tailscale-user', 'someone'],
    ]) {
      const r = spawnSync(process.execPath, [ENTRY, ...args], { encoding: 'utf8', timeout: 30_000, stdio: 'pipe' });
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /takes no argument but --test-note/);
      assert.equal(r.stdout, '');
    }
  });
});

describe('wrong Host (cc_host_checked)', () => {
  test('a request naming any other host is refused; its own two names are answered', async () => {
    const s = await started();
    const p = s.port;
    for (const host of [
      'evil.example',
      `evil.example:${p}`,
      `127.0.0.1:${p + 1}`,
      '127.0.0.1',
      'localhost',
      `0.0.0.0:${p}`,
      `[::1]:${p}`,
      `127.0.0.1.nip.io:${p}`,
      `LOCALHOST:${p}`,
    ]) {
      const r = await ask(p, { path: '/api/test-note/sample', headers: { host, ...bearer(s) } });
      assert.equal(r.status, 403, host);
      assert.ok(!r.text.includes(NOTE), host);
    }
    for (const host of [`127.0.0.1:${p}`, `localhost:${p}`])
      assert.equal((await ask(p, { path: '/api/test-note/sample', headers: { host, ...bearer(s) } })).text, NOTE);
  });

  test("Tailscale's headers and forwarded headers are not trusted", async () => {
    const s = await started();
    const tailscale = { host: 'mac.tail1234.ts.net', 'tailscale-user-login': 'roger@example.com', ...bearer(s) };
    assert.equal((await ask(s.port, { path: '/api/test-note/sample', headers: tailscale })).status, 403);
    const forwarded = { host: 'evil.example', 'x-forwarded-host': `127.0.0.1:${s.port}`, ...bearer(s) };
    assert.equal((await ask(s.port, { path: '/api/test-note/sample', headers: forwarded })).status, 403);
  });

  test('a request naming no host is refused', async () => {
    const s = await started();
    const r = await ask(s.port, { path: '/api/test-note/sample', headers: bearer(s), setHost: false });
    assert.ok([400, 403].includes(r.status), String(r.status));
    assert.ok(!r.text.includes(NOTE));
  });
});

describe('the token (cc_session_token, cc_one_server)', () => {
  test('a call with no token is refused, and says nothing about the note', async () => {
    const s = await started();
    const known = await ask(s.port, { path: '/api/test-note/sample' });
    const unknown = await ask(s.port, { path: '/api/test-note/no-such' });
    assert.equal(known.status, 401);
    assert.equal(known.headers['www-authenticate'], 'Bearer');
    assert.deepEqual([unknown.status, unknown.text], [known.status, known.text], 'the same, note or no note');
    assert.ok(!known.text.includes(NOTE));
  });

  test('a wrong token is refused: one character off, cut short, longer, another case, another scheme', async () => {
    const s = await started();
    const t = s.token;
    const last = t.at(-1) === 'A' ? 'B' : 'A';
    for (const authorization of [
      `Bearer ${t.slice(0, -1)}${last}`,
      `Bearer ${t.slice(0, -1)}`,
      `Bearer ${t}A`,
      `Bearer ${t.toUpperCase() === t ? t.toLowerCase() : t.toUpperCase()}`,
      `Basic ${t}`,
      `Token ${t}`,
      t,
      'Bearer ',
      `Bearer  ${t}`,
    ]) {
      const r = await ask(s.port, { path: '/api/test-note/sample', headers: { authorization } });
      assert.equal(r.status, 401, authorization);
      assert.ok(!r.text.includes(NOTE));
    }
    assert.equal((await noteOf(s)).text, NOTE, 'the control: the right token, as a Bearer header, is let in');
  });

  test('the token is made fresh, 256 bits, at each start, and one server never opens to another’s', async () => {
    const a = await started();
    const b = await started();
    assert.notEqual(a.port, b.port);
    assert.notEqual(a.token, b.token);
    for (const t of [a.token, b.token]) assert.equal(Buffer.from(t, 'base64url').length, 32);
    const crossed = await ask(b.port, { path: '/api/test-note/sample', headers: bearer(a) });
    assert.equal(crossed.status, 401);
  });

  test('the token is compared in constant time, never with an equality on text', () => {
    const files = readdirSync(SERVER).filter((f) => f.endsWith('.ts'));
    const texts = files.map((f) => readFileSync(join(SERVER, f), 'utf8'));
    assert.ok(
      texts.some((t) => /timingSafeEqual\(/.test(t)),
      'timingSafeEqual compares it',
    );
    for (const [i, t] of texts.entries())
      assert.doesNotMatch(t, /token\s*[!=]==|[!=]==\s*token\b/, `${files[i]} compares a token with === or !==`);
  });
});

describe('the token is never kept (cc_token_unkept, cc_one_server)', () => {
  test('a token in the address is refused, even the right one', async () => {
    const s = await started();
    for (const [path, headers] of [
      [`/api/test-note/sample?token=${s.token}`, {}],
      [`/api/test-note/sample?token=${s.token}`, bearer(s)],
      [`/api/test-note/sample?access_token=${s.token}`, {}],
      [`/?token=${s.token}`, {}],
      [`/api/test-note/sample#token=${s.token}`, {}],
    ]) {
      const r = await ask(s.port, { path, headers });
      assert.equal(r.status, 400, path);
      assert.ok(!r.text.includes(NOTE) && !r.text.includes(s.token), path);
    }
  });

  test('the process hands the token over once, in the address’s fragment, and keeps it nowhere', async () => {
    const dirs = ['cwd', 'home', 'tmp'].map((d) => mkdtempSync(join(tmpdir(), `editor-${d}-`)));
    const [cwd, home, tmp] = dirs;
    const run = startProcess(['--test-note'], { cwd, env: { ...process.env, HOME: home, TMPDIR: tmp } });
    const { url } = await run.ready;
    const address = new URL(url);
    const token = /^#token=([A-Za-z0-9_-]{43})$/.exec(address.hash)?.[1];
    assert.ok(token, address.hash.replace(/=.*/, '=…'));
    assert.deepEqual([address.hostname, address.pathname, address.search], ['127.0.0.1', '/', '']);
    const port = Number(address.port);
    const answers = [
      await ask(port, { path: '/api/test-note/sample', headers: { authorization: `Bearer ${token}` } }),
      await ask(port, { path: '/api/test-note/sample' }),
      await ask(port, { path: '/' }),
      await ask(port, { path: '/', headers: { host: 'evil.example' } }),
    ];
    assert.equal(answers[0].text, NOTE);
    run.child.kill('SIGTERM');
    assert.deepEqual(await run.exited, { code: 0, signal: null });
    for (const a of answers) assert.ok(!JSON.stringify(a).includes(token), 'no answer repeats it');
    assert.equal(run.out.stdout, `${JSON.stringify({ url })}\n`, 'the one line, and nothing more');
    assert.ok(!run.out.stderr.includes(token), 'never in what it says on stderr');
    for (const d of dirs) assert.deepEqual(readdirSync(d), [], `no file written to ${d}`);
  });
});

/** Starts the server as the mod will, as a process: what it prints, when it exits, and the address it hands over. */
function startProcess(args, options = {}) {
  const child = spawn(process.execPath, [ENTRY, ...args], { stdio: 'pipe', ...options });
  const out = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => (out.stderr += d));
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      out.stdout += d;
      if (out.stdout.includes('\n')) resolve(JSON.parse(out.stdout.split('\n')[0]));
    });
    child.on('exit', () => reject(new Error(`the server exited before it was ready: ${out.stderr}`)));
  });
  after(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'));
  return { child, out, exited, ready };
}

describe('cross-origin (cc_origin_checked)', () => {
  const etagOf = async (s) => (await noteOf(s)).headers.etag;

  test('a write from any other origin is refused, and the note is unchanged', async () => {
    const s = await started();
    const etag = await etagOf(s);
    for (const origin of [
      'http://evil.example',
      'null',
      `http://127.0.0.1:${s.port + 1}`,
      `https://127.0.0.1:${s.port}`,
      `http://localhost:${s.port}`,
      `http://127.0.0.1:${s.port}, http://evil.example`,
      undefined,
    ]) {
      const headers = { ...writing(s, etag), origin };
      if (origin === undefined) delete headers.origin;
      const r = await ask(s.port, { method: 'PUT', path: '/api/test-note/sample', headers, body: 'changed' });
      assert.equal(r.status, 403, String(origin));
    }
    assert.equal((await noteOf(s)).text, NOTE);
  });

  test('a write must be said by the browser to come from the same origin', async () => {
    const s = await started();
    const etag = await etagOf(s);
    for (const site of ['cross-site', 'same-site', 'none', undefined]) {
      const headers = { ...writing(s, etag), 'sec-fetch-site': site };
      if (site === undefined) delete headers['sec-fetch-site'];
      const r = await ask(s.port, { method: 'PUT', path: '/api/test-note/sample', headers, body: 'changed' });
      assert.equal(r.status, 403, String(site));
    }
    assert.equal((await noteOf(s)).text, NOTE);
  });

  test('the control: a write from its own origin, against the version read, is made', async () => {
    const s = await started();
    const r = await ask(s.port, {
      method: 'PUT',
      path: '/api/test-note/sample',
      headers: writing(s, await etagOf(s)),
      body: 'changed',
    });
    assert.equal(r.status, 204);
    assert.equal((await noteOf(s)).text, 'changed');
  });

  test('a stale write, or one naming no version, is refused, and the note is unchanged', async () => {
    const s = await started();
    const etag = await etagOf(s);
    const put = (headers, body) => ask(s.port, { method: 'PUT', path: '/api/test-note/sample', headers, body });
    assert.equal((await put(writing(s, etag), 'first')).status, 204);
    assert.equal((await put(writing(s, etag), 'second')).status, 412, 'made against the version before');
    const unnamed = writing(s, etag);
    delete unnamed['if-match'];
    assert.equal((await put(unnamed, 'third')).status, 428);
    assert.equal((await noteOf(s)).text, 'first');
  });

  test('no cross-origin request is answered: no CORS header, and OPTIONS allows nothing', async () => {
    const s = await started();
    const answers = [
      await ask(s.port, { path: '/api/test-note/sample', headers: { ...bearer(s), origin: 'http://evil.example' } }),
      await ask(s.port, { path: '/', headers: { origin: 'http://evil.example' } }),
      await ask(s.port, { path: '/', headers: { 'sec-fetch-site': 'cross-site' } }),
      await ask(s.port, { path: '/api/test-note/sample', headers: { ...bearer(s), 'sec-fetch-site': 'same-site' } }),
      await ask(s.port, {
        method: 'OPTIONS',
        path: '/api/test-note/sample',
        headers: {
          origin: 'http://evil.example',
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'authorization',
        },
      }),
      await ask(s.port, { method: 'OPTIONS', path: '/api/test-note/sample', headers: { origin: s.origin } }),
    ];
    const cors = (a) => Object.keys(a.headers).filter((h) => h.startsWith('access-control-') || h === 'allow');
    for (const [i, a] of answers.entries()) {
      assert.equal(a.status, 403, `answer ${i}`);
      assert.ok(!a.text.includes(NOTE));
      assert.equal(cors(a).join(), '', `answer ${i}`);
    }
    const own = await ask(s.port, { path: '/', headers: { 'sec-fetch-site': 'same-origin', origin: s.origin } });
    assert.equal(own.status, 200, 'the control: its own origin is answered');
    assert.equal(cors(own).join(), '');
  });
});

describe('content security policy (cc_csp, cc_no_remote)', () => {
  test('every answer carries the policy, nosniff and no-store, whatever its status', async () => {
    const s = await started();
    const answers = {
      200: await ask(s.port, { path: '/' }),
      400: await ask(s.port, { path: '/?a=1' }),
      401: await ask(s.port, { path: '/api/test-note/sample' }),
      403: await ask(s.port, { path: '/', headers: { host: 'evil.example' } }),
      404: await ask(s.port, { path: '/nothing-here' }),
      405: await ask(s.port, { method: 'DELETE', path: '/' }),
    };
    for (const [status, a] of Object.entries(answers)) {
      assert.equal(a.status, Number(status));
      assert.equal(a.headers['content-security-policy'], POLICY, status);
      assert.equal(a.headers['x-content-type-options'], 'nosniff', status);
      assert.equal(a.headers['cache-control'], 'no-store', status);
      assert.equal(a.headers['set-cookie'], undefined, status);
    }
  });

  test('the policy allows only its own origin: no inline script, no eval, nothing from elsewhere', () => {
    assert.doesNotMatch(POLICY, /unsafe-inline|unsafe-eval|https?:|\*|wss?:/);
    for (const d of POLICY.split('; ').filter((x) => !/^(img-src|frame-ancestors)/.test(x)))
      assert.match(d, / 'self'$/, d);
  });

  test('the page holds no inline script or style', async () => {
    const s = await started();
    const page = await ask(s.port, { path: '/' });
    assert.match(page.headers['content-type'], /^text\/html; charset=utf-8$/);
    assert.doesNotMatch(page.text, /<script|<style|\son\w+=|\sstyle=|javascript:/i);
  });
});

describe('body limit (cc_body_limit)', () => {
  const put = async (s, body, headers = {}) =>
    ask(s.port, {
      method: 'PUT',
      path: '/api/test-note/sample',
      headers: { ...writing(s, (await noteOf(s)).headers.etag), ...headers },
      body,
    });

  test("a body declared larger than the core's read limit for a note is refused before it is read", async () => {
    const s = await started();
    const r = await put(s, undefined, { 'content-length': String(READ_LIMITS.bytes + 1) });
    assert.equal(r.status, 413);
    assert.equal((await noteOf(s)).text, NOTE);
  });

  test('so is one sent in parts with no length, once it passes the limit', async () => {
    const s = await started();
    const half = 'x'.repeat(Math.ceil((READ_LIMITS.bytes + 1) / 2));
    const r = await put(s, [half, half]);
    assert.equal(r.status, 413);
    assert.equal((await noteOf(s)).text, NOTE);
  });

  test('the control: a body of exactly the limit is taken', async () => {
    const s = await started();
    const r = await put(s, 'é'.repeat(READ_LIMITS.bytes / 2));
    assert.equal(r.status, 204);
    assert.equal((await noteOf(s)).text.length, READ_LIMITS.bytes / 2);
  });
});

describe('path escape, on the test-only note route', () => {
  test('a name that could leave the route is refused, read or write, and nothing is made', async () => {
    const s = await started();
    const etag = (await noteOf(s)).headers.etag;
    for (const path of [
      '/api/test-note/../../etc/passwd',
      '/api/test-note/..%2f..%2fetc%2fpasswd',
      '/api/test-note/%2e%2e',
      '/api/test-note/sample/../sample',
      '/api/test-note/./sample',
      '/api/test-note/sample%00',
      '/api/test-note//etc/passwd',
      '/api/test-note/Sample.md',
    ]) {
      const read = await ask(s.port, { path, headers: bearer(s) });
      assert.equal(read.status, 400, path);
      const write = await ask(s.port, { method: 'PUT', path, headers: writing(s, etag), body: 'escaped' });
      assert.equal(write.status, 400, path);
    }
    const around = await ask(s.port, { path: '/api/../api/test-note/sample', headers: bearer(s) });
    assert.equal(around.status, 404);
    assert.equal((await noteOf(s)).text, NOTE);
  });

  test('the route is there only when asked for: a server started without it has none', async () => {
    const s = await startEditorServer();
    after(() => s.stop());
    const r = await ask(s.port, { path: '/api/test-note/sample', headers: bearer(s) });
    assert.equal(r.status, 404);
  });
});

describe('no outgoing request (cc_no_remote)', () => {
  test('everything the server runs, bundled, imports only Node’s http, crypto and fs, and makes no request', async () => {
    const built = await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    const [output] = Object.values(built.metafile.outputs);
    const external = [...new Set(output.imports.filter((i) => i.external).map((i) => i.path))].sort();
    assert.deepEqual(external, ['node:crypto', 'node:fs', 'node:http']);
    const text = built.outputFiles[0].text;
    for (const call of [
      /\bfetch\s*\(/,
      /\.request\s*\(/,
      /\bhttps?\.get\s*\(/,
      /\b(net|tls)\.connect\s*\(/,
      /\bWebSocket\b/,
      /\bXMLHttpRequest\b/,
      /\bEventSource\b/,
      /\bsendBeacon\b/,
    ])
      assert.doesNotMatch(text, call);
  });
});

describe('the server stops (cc_server_stops)', () => {
  /** A clock and a scheduler handed to the server: the checks it would run on a timer, run here by hand. */
  function clock() {
    const c = { t: 0, checks: [], now: () => c.t };
    c.every = (_ms, check) => (c.checks.push(check), () => (c.checks = c.checks.filter((x) => x !== check)));
    c.tick = (ms) => ((c.t += ms), c.checks.forEach((check) => check()));
    return c;
  }

  test('after 30 minutes with no page, and not a moment before; each request starts the wait again', async () => {
    assert.equal(IDLE_MS, 30 * 60 * 1000);
    const c = clock();
    const s = await started({ now: c.now, every: c.every });
    assert.equal(c.checks.length, 1);
    c.tick(IDLE_MS - 1);
    assert.equal(s.stopped, null);
    assert.equal((await noteOf(s)).status, 200);
    c.tick(IDLE_MS - 1);
    assert.equal(s.stopped, null, 'the request started the wait again');
    c.tick(1);
    assert.equal(await s.closed, 'idle');
    assert.equal(await reachable('127.0.0.1', s.port), false);
    assert.deepEqual(c.checks, [], 'its check is cancelled');
  });

  test('never while a request is still open', async () => {
    const c = clock();
    const s = await started({ now: c.now, every: c.every });
    const etag = (await noteOf(s)).headers.etag;
    const req = http.request({
      host: '127.0.0.1',
      port: s.port,
      method: 'PUT',
      path: '/api/test-note/sample',
      headers: { ...writing(s, etag), 'content-length': '7' },
      agent: false,
    });
    const answered = new Promise((resolve, reject) => {
      req.on('response', (res) => (res.resume(), resolve(res.statusCode)));
      req.on('error', reject);
    });
    req.write('cha');
    for (let i = 0; i < 200 && s.openRequests === 0; i++) await pause(10);
    assert.equal(s.openRequests, 1);
    c.tick(IDLE_MS * 2);
    assert.equal(s.stopped, null, 'a request still open is a page still there');
    req.end('nged');
    assert.equal(await answered, 204);
    c.tick(IDLE_MS);
    assert.equal(await s.closed, 'idle');
  });

  test('at once when told to stop', async () => {
    const s = await started();
    await s.stop('stop');
    assert.equal(s.stopped, 'stop');
    assert.equal(await reachable('127.0.0.1', s.port), false);
  });

  test('when the session’s input closes', async () => {
    const run = startProcess(['--test-note']);
    const port = Number(new URL((await run.ready).url).port);
    run.child.stdin.end();
    assert.deepEqual(await run.exited, { code: 0, signal: null });
    assert.match(run.out.stderr, /stopped: the session ended/);
    assert.equal(await reachable('127.0.0.1', port), false);
  });

  test('on a stop signal', async () => {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      const run = startProcess(['--test-note']);
      await run.ready;
      run.child.kill(signal);
      assert.deepEqual(await run.exited, { code: 0, signal: null }, signal);
      assert.match(run.out.stderr, new RegExp(`stopped: ${signal}`));
    }
  });

  test('when the process that started it exits, though its input never closes', async () => {
    const parentCode = [
      "const { spawn } = require('node:child_process');",
      `const c = spawn(process.execPath, [${JSON.stringify(ENTRY)}, '--test-note'], { stdio: ['ignore', 'pipe', 'ignore'] });`,
      "let line = '';",
      "c.stdout.on('data', (d) => { line += d; if (line.includes('\\n')) process.stdout.write(JSON.stringify({ pid: c.pid, ...JSON.parse(line) }) + '\\n'); });",
      'setInterval(() => {}, 60000);',
    ].join('\n');
    const parent = spawn(process.execPath, ['-e', parentCode], { stdio: ['ignore', 'pipe', 'inherit'] });
    const parentExited = new Promise((r) => parent.on('exit', r));
    let line = '';
    const { pid, url } = await new Promise((resolve) =>
      parent.stdout.on('data', (d) => {
        line += d;
        if (line.includes('\n')) resolve(JSON.parse(line.split('\n')[0]));
      }),
    );
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    after(() => alive() && process.kill(pid, 'SIGKILL'));
    const address = new URL(url);
    const token = address.hash.slice('#token='.length);
    const port = Number(address.port);
    const before = await ask(port, { path: '/api/test-note/sample', headers: { authorization: `Bearer ${token}` } });
    assert.equal(before.text, NOTE, 'the control: it runs while its parent does');
    parent.kill('SIGKILL');
    await parentExited;
    for (let i = 0; i < 300 && alive(); i++) await pause(100);
    assert.equal(alive(), false, 'the server is gone');
    assert.equal(await reachable('127.0.0.1', port), false);
  });
});
