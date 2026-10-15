// Test support for the mod's editor tests (editor-mod.test.js): a host that starts a process as Claude Code's
// `$.process.spawn` does (standard input closed at once, the output handed over piece by piece, the child killed when the
// loop is left), a vault on disk in a temporary folder, and the launcher made over them. Test code only: nothing here ships.
import { after } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EditorLauncher } from '../src/editor-launch.ts';
import { ENTRY } from './editor-threats-support.js';

/** The note the tests edit: one graph block between prose. */
export const PLAN =
  '# Plan\nWhat comes first.\n```gql\n// graph: plan\n' +
  "(start:Step {name: 'Start'}),\n(finish:Step {name: 'Finish'}),\n(start)-[:THEN]->(finish)\n```\nThe end.\n";

/**
 * A `$.process.spawn` stand-in over Node's: every request is kept in `requests`, every child in `children`, and all are
 * killed when the file's tests end. Leaving the loop (`return()`) kills the child, as the host does.
 */
export function hostSpawn() {
  const requests = [];
  const children = [];
  const spawnProcess = (request) => {
    requests.push(request);
    const child = spawn(request.argv[0], request.argv.slice(1), {
      stdio: 'pipe',
      env: { ...process.env, ...request.env },
    });
    children.push(child);
    child.stdin.on('error', () => {});
    child.stdin.end(request.input ?? '');
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const pieces = [];
    const waiting = [];
    let finished = false;
    const push = (item) => {
      const w = waiting.shift();
      if (w) w(item);
      else pieces.push(item);
    };
    child.stdout.on('data', (text) => push({ done: false, value: { stream: 'stdout', text } }));
    child.stderr.on('data', (text) => push({ done: false, value: { stream: 'stderr', text } }));
    child.once('error', (err) => push({ error: err }));
    const closed = new Promise((resolve) =>
      child.once('close', (code, signal) => {
        finished = true;
        push({ done: true, value: { code, signal } });
        resolve({ code, signal });
      }),
    );
    const iterator = {
      next: () => {
        const item = pieces.shift();
        const settle = (i) => (i.error ? Promise.reject(i.error) : Promise.resolve(i));
        if (item) return settle(item);
        if (finished) return Promise.resolve({ done: true, value: { code: null, signal: null } });
        return new Promise((resolve, reject) => waiting.push((i) => (i.error ? reject(i.error) : resolve(i))));
      },
      // leaving the loop kills the child, and the call settles once the child has gone
      return: () => {
        if (!finished) child.kill('SIGTERM');
        return closed.then((value) => ({ done: true, value }));
      },
    };
    return { [Symbol.asyncIterator]: () => iterator };
  };
  after(() => {
    for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
  });
  return { spawn: spawnProcess, requests, children };
}

/**
 * A vault with its `.obsidian` folder and two notes, a loose note in a folder with no vault above it, and a data folder
 * for drafts, all in a temporary folder removed when the file's tests end.
 */
export function modVault() {
  const top = mkdtempSync(join(tmpdir(), 'editor-mod-'));
  after(() => rmSync(top, { recursive: true, force: true }));
  const vault = join(top, 'vault');
  mkdirSync(join(vault, '.obsidian'), { recursive: true });
  mkdirSync(join(vault, 'Notes'));
  mkdirSync(join(top, 'loose'));
  writeFileSync(join(vault, 'Notes', 'plan.md'), PLAN);
  writeFileSync(join(vault, 'Notes', 'other.md'), 'Another note.\n');
  writeFileSync(join(vault, 'Notes', 'readme.txt'), 'Not a note.\n');
  writeFileSync(join(top, 'loose', 'solo.md'), PLAN);
  return {
    top,
    vault,
    plan: join(vault, 'Notes', 'plan.md'),
    other: join(vault, 'Notes', 'other.md'),
    data: join(top, 'data'),
  };
}

/** The launcher over a host, with the shipped server (run from its source) unless `over` says otherwise; stopped after. */
export function launcherFor(where, over = {}) {
  const host = over.host ?? hostSpawn();
  const launcher = new EditorLauncher({
    spawn: host.spawn,
    exists: async (path) => existsSync(path),
    cwd: where.top,
    server: [process.execPath, ENTRY],
    drafts: where.data,
    after: (ms, fn) => {
      const timer = setTimeout(fn, ms);
      timer.unref();
      return { cancel: () => clearTimeout(timer) };
    },
    ...over.ports,
  });
  after(() => launcher.stop('the test ended'));
  return { launcher, host };
}

/** The token in an address's fragment, and the note id beside it. */
export function partsOf(link) {
  const url = new URL(link);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return { url, token: fragment.get('token'), note: fragment.get('note'), port: Number(url.port) };
}
