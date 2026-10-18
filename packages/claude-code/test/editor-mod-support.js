// Test support for the mod's editor tests (editor-mod.test.js): a host that starts a process as Claude Code's
// `$.process.spawn` does (standard input closed at once, the output handed over piece by piece, the child killed when the
// loop is left), a vault on disk in a temporary folder, and the launcher made over them. Test code only: nothing here ships.
// The servers serve the page the build makes; it is built here first when it is not there, as in a fresh checkout.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditorLauncher } from '../src/editor-launch.ts';
import { buildPage } from '../esbuild.page.mjs';
import { ENTRY } from './editor-threats-support.js';

/** The folder the build puts the page in, which a server started from the source serves (editor-main.ts, pageFiles). */
export const PAGE = fileURLToPath(new URL('../mod/page/', import.meta.url));

/**
 * Builds the page into `folder` unless it is built already. A server refuses to start with no page, and a fresh checkout
 * has none until something builds it: in CI the suite runs before `npm run build`, beside the build's own test, which
 * builds it only as these tests start their servers. Building in place is safe beside that test: neither removes a file.
 */
export async function pageReady(folder = PAGE) {
  if (!existsSync(join(folder, 'index.html'))) await buildPage(folder);
}

await pageReady();

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

/** The origin of a command the person typed into the composer. */
export const COMPOSER = { kind: 'composer' };

/** The classifications the tests use, lowest first. */
export const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];

/**
 * The settings the gate reads: Claude's ceiling Internal, and a note with no classification counting as Public, so the
 * unlabelled notes of the other tests open. `over` changes any of them; `ceiling` is Claude's, null for no Claude set up.
 */
export function gateSettings(over = {}) {
  const { ceiling = 'Internal', ...rest } = over;
  const claude = { name: 'Claude', purpose: '', ceiling, endpoint: '', model: '', keyName: '' };
  return { classifications: LEVELS, aiUnlabelled: 'Public', aiModels: ceiling === null ? [] : [claude], ...rest };
}

/** A note on disk: front matter with `level` (none when null), then `body`. Returns its path. */
export function writeNote(where, name, level, body = 'Some text.\n') {
  const path = join(where.vault, 'Notes', name);
  writeFileSync(path, level === null ? body : `---\nclassification: ${level}\n---\n${body}`);
  return path;
}

/** The shipped process that sends a proposal to the server, run from its source. */
const PROPOSE = fileURLToPath(new URL('../bin/propose-process.ts', import.meta.url));

/**
 * The proposal channel as the mod makes it: a key made for each start, and the request handed on the shipped sender's
 * standard input (never an argument), as `$.process.run` runs it. The request is kept in `sent`.
 */
export function proposalPorts(sent = []) {
  return {
    key: () => randomBytes(32).toString('base64url'),
    propose: (request) =>
      new Promise((resolve, reject) => {
        sent.push(request);
        const child = execFile(process.execPath, [PROPOSE], (err, stdout) => {
          if (err && !stdout) return reject(err);
          resolve(JSON.parse(stdout));
        });
        child.stdin.end(JSON.stringify(request));
      }),
  };
}

/** The launcher over a host, with the shipped server (run from its source) unless `over` says otherwise; stopped after. */
export function launcherFor(where, over = {}) {
  const host = over.host ?? hostSpawn();
  const launcher = new EditorLauncher({
    spawn: host.spawn,
    read: async (path) => readFileSync(path, 'utf8'),
    settings: async () => gateSettings(over.settings),
    exists: async (path) => existsSync(path),
    realPath: async (path) => realpathSync(path),
    cwd: where.top,
    server: [process.execPath, ENTRY],
    drafts: where.data,
    after: (ms, fn) => {
      const timer = setTimeout(fn, ms);
      timer.unref();
      return { cancel: () => clearTimeout(timer) };
    },
    ...(over.proposals === false ? {} : proposalPorts(over.sent)),
    ...over.ports,
  });
  after(() => launcher.stop('the test ended'));
  if (!over.raw) {
    // the person typing, unless a test says who else: the launcher itself fails closed on an origin it is not given
    const edit = launcher.edit.bind(launcher);
    const confirm = launcher.confirm.bind(launcher);
    launcher.edit = (given, cwd, origin = COMPOSER) => edit(given, cwd, origin);
    launcher.confirm = (origin = COMPOSER) => confirm(origin);
  }
  return { launcher, host };
}

/** Opens `path` in the launcher's editor, failing with the launcher's own why when it does not, so a failure names its cause. */
export async function opens(launcher, path) {
  const outcome = await launcher.edit(path);
  assert.equal(outcome.ok, true, `the editor did not open: ${outcome.why}`);
  return outcome;
}

/** The token in an address's fragment, and the note id beside it. */
export function partsOf(link) {
  const url = new URL(link);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return { url, token: fragment.get('token'), note: fragment.get('note'), port: Number(url.port) };
}
