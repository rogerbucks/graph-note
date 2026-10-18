// The editor server's threat model as a process (spec §26, slice 4; test_cc_threats, with editor-threats.test.js):
// - It takes nothing that could make it listen elsewhere.
// - It hands its token over once and keeps it nowhere. It will not start orphaned.
// - It stops when its input closes, on a stop signal and when the process that started it exits.
// Each is tried on the process itself, started here and stopped after. A test asserts the work done, never the time taken.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENTRY, FIXTURE, alive, ask, pause, reachable, startProcess } from './editor-threats-support.js';
import { TEST_NOTE as NOTE } from './fixtures/editor-server-test.ts';

/** A node process that starts the test-only server with `stdio` and then runs `then`; it says its child's pid first. */
function parentOf(stdio, then) {
  const code = [
    "const { spawn } = require('node:child_process');",
    `const c = spawn(process.execPath, [${JSON.stringify(FIXTURE)}, '--serve'], { stdio: ${JSON.stringify(stdio)} });`,
    then,
  ].join('\n');
  return spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Each line a process writes on stdout, as it comes. */
function linesOf(child) {
  const lines = [];
  let rest = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    rest += d;
    const parts = rest.split('\n');
    rest = parts.pop();
    lines.push(...parts);
  });
  return lines;
}

describe('loopback only (cc_loopback_only)', () => {
  test('the process takes no port or host to listen on, and no remote reach', () => {
    for (const args of [['--port', '8080'], ['--host', '0.0.0.0'], ['--tailscale-user', 'someone'], ['--test-note']]) {
      const r = spawnSync(process.execPath, [ENTRY, ...args], { encoding: 'utf8', timeout: 30_000, stdio: 'pipe' });
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /takes no argument/);
      assert.equal(r.stdout, '');
    }
  });
});

describe('the token is never kept (cc_token_unkept, cc_one_server)', () => {
  test('the process hands the token over once, in the address’s fragment, and keeps it nowhere', async () => {
    const dirs = ['cwd', 'home', 'tmp'].map((d) => mkdtempSync(join(tmpdir(), `editor-${d}-`)));
    const [cwd, home, tmp] = dirs;
    const run = startProcess([], { cwd, env: { ...process.env, HOME: home, TMPDIR: tmp } });
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

describe('the server stops (cc_server_stops)', () => {
  test('when the session’s input closes', async () => {
    const run = startProcess();
    const port = Number(new URL((await run.ready).url).port);
    run.child.stdin.end();
    assert.deepEqual(await run.exited, { code: 0, signal: null });
    assert.match(run.out.stderr, /stopped: the session ended/);
    assert.equal(await reachable('127.0.0.1', port), false);
  });

  test('on a stop signal', async () => {
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      const run = startProcess();
      await run.ready;
      run.child.kill(signal);
      assert.deepEqual(await run.exited, { code: 0, signal: null }, signal);
      assert.match(run.out.stderr, new RegExp(`stopped: ${signal}`));
    }
  });

  test('when the process that started it exits, though its input never closes', async () => {
    const parent = parentOf(
      ['ignore', 'pipe', 'ignore'],
      [
        "let line = '';",
        "c.stdout.on('data', (d) => { line += d; if (line.includes('\\n')) process.stdout.write(JSON.stringify({ pid: c.pid, ...JSON.parse(line) }) + '\\n'); });",
        'setInterval(() => {}, 60000);',
      ].join('\n'),
    );
    const parentExited = new Promise((r) => parent.on('exit', r));
    const lines = linesOf(parent);
    for (let i = 0; i < 300 && !lines.length; i++) await pause(100);
    const { pid, url } = JSON.parse(lines[0]);
    after(() => alive(pid) && process.kill(pid, 'SIGKILL'));
    const address = new URL(url);
    const token = address.hash.slice('#token='.length);
    const port = Number(address.port);
    const before = await ask(port, { path: '/api/test-note/sample', headers: { authorization: `Bearer ${token}` } });
    assert.equal(before.text, NOTE, 'the control: it runs while its parent does');
    parent.kill('SIGKILL');
    await parentExited;
    for (let i = 0; i < 300 && alive(pid); i++) await pause(100);
    assert.equal(alive(pid), false, 'the server is gone');
    assert.equal(await reachable('127.0.0.1', port), false);
  });

  test('it will not start when the process that started it has already gone', async () => {
    // the parent says its child's pid and exits at once, before the child has loaded. The child's output comes on the
    // same pipes, so they close only when it has exited too
    const parent = parentOf(
      ['ignore', 'inherit', 'inherit'],
      'process.stdout.write(c.pid + "\\n", () => process.exit(0));',
    );
    let stderr = '';
    parent.stderr.setEncoding('utf8');
    parent.stderr.on('data', (d) => (stderr += d));
    const lines = linesOf(parent);
    const closed = new Promise((r) => parent.on('close', r));
    for (let i = 0; i < 300 && !lines.length; i++) await pause(100);
    const pid = Number(lines[0]);
    after(() => alive(pid) && process.kill(pid, 'SIGKILL'));
    let done = false;
    void closed.then(() => (done = true));
    for (let i = 0; i < 300 && !done && lines.length < 2; i++) await pause(100);
    assert.deepEqual(lines.slice(1), [], 'it handed over no address');
    assert.ok(done, 'and it exited');
    assert.match(stderr, /the process that started it has already exited/);
  });
});
