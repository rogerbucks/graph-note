// The desktop app, built and run for real (spec §41, standalone_app). The app is started on a folder of notes, and
// driven as a person uses it through tauri-driver, Tauri's WebDriver server. It must:
// - list the folder's notes, and open one in the editor;
// - draw the note's graph;
// - write an edit to the note on disk;
// - load only its own files, and refuse any other address, by the window's policy.
// The desktop app workflow (.github/workflows/desktop-app.yml) builds the app on Linux, macOS and Windows. It runs this
// test on Linux, under a virtual display. tauri-driver has no macOS driver, so the other two are built and their Rust
// tests run. Elsewhere it skips with one line when there is no app, driver or display. Where THOUGHTKNOT_APP_REQUIRED
// is set, as that workflow sets it, a missing one fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './repository/repo.js';
import { EDITED, NOTE } from './repository/journey-note.js';

const TARGET = join(ROOT, 'packages/app/src-tauri/target');
const NAME = process.platform === 'win32' ? 'thoughtknot-app.exe' : 'thoughtknot-app';

/** The built app: the one THOUGHTKNOT_APP names, else a release build, else a debug build. */
function findApp() {
  const given = process.env.THOUGHTKNOT_APP;
  if (given) return existsSync(given) ? given : null;
  return ['release', 'debug'].map((b) => join(TARGET, b, NAME)).find((f) => existsSync(f)) ?? null;
}

/** tauri-driver: the one THOUGHTKNOT_TAURI_DRIVER names, else on the PATH, else where cargo installs it. */
function findDriver() {
  const given = process.env.THOUGHTKNOT_TAURI_DRIVER;
  if (given) return existsSync(given) ? given : null;
  try {
    return execFileSync('which', ['tauri-driver'], { encoding: 'utf8' }).trim() || null;
  } catch {
    const installed = join(homedir(), '.cargo/bin/tauri-driver');
    return existsSync(installed) ? installed : null;
  }
}

/** Why the app cannot be driven here, or null when it can. */
function missing(app, driver) {
  if (process.platform !== 'linux') return 'the app is driven on Linux only: tauri-driver has no macOS driver';
  if (!app) return 'no built app (cd packages/app/src-tauri && cargo build, or set THOUGHTKNOT_APP)';
  if (!driver) return 'no tauri-driver (cargo install tauri-driver --locked, or set THOUGHTKNOT_TAURI_DRIVER)';
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return 'no display (run under xvfb-run)';
  return null;
}

/** A free port on this machine. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the desktop app, run for real: open a folder, draw a note, edit it, offline', () => {
  const app = findApp(),
    driver = findDriver();
  const why = missing(app, driver);
  if (why) {
    if (process.env.THOUGHTKNOT_APP_REQUIRED) throw new Error(`the desktop app must be driven here, but: ${why}`);
    console.warn(`standalone-app: skipped: ${why}`);
  }
  const options = { skip: why ?? false, timeout: 120_000 };

  let folder, server, base, session;
  /** One WebDriver call: its value, or the error the driver gave, thrown. */
  const call = async (method, path, body) => {
    const reply = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    const { value } = await reply.json();
    if (value?.error) throw new Error(`${method} ${path}: ${value.error}: ${value.message}`);
    return value;
  };
  /** Runs `script` in the app's window; gives what it returns. */
  const run = (script, args = []) => call('POST', `/session/${session}/execute/sync`, { script, args });
  /** Waits until `script` returns something truthy in the window; gives it. */
  const until = async (script, ms = 20_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const value = await run(script).catch(() => null);
      if (value) return value;
      if (Date.now() > end) throw new Error(`the app never showed: ${script}`);
      await pause(250);
    }
  };

  before(async () => {
    if (why) return;
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'standalone-app-')));
    writeFileSync(join(folder, 'Reader.md'), NOTE);
    const [port, native] = [await freePort(), await freePort()];
    server = spawn(driver, ['--port', String(port), '--native-port', String(native)], { stdio: 'ignore' });
    base = `http://127.0.0.1:${port}`;
    const end = Date.now() + 20_000;
    for (;;) {
      const up = await fetch(`${base}/status`).then(
        (r) => r.ok,
        () => false,
      );
      if (up) break;
      if (Date.now() > end) throw new Error('tauri-driver did not start');
      await pause(200);
    }
    const started = await call('POST', '/session', {
      capabilities: { alwaysMatch: { 'tauri:options': { application: app, args: [folder] } } },
    });
    session = started.sessionId;
  });

  after(async () => {
    if (session) await call('DELETE', `/session/${session}`).catch(() => {});
    server?.kill();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test('it lists the folder it was started on, and opens a note in the editor', options, async () => {
    const listed = await until(
      "const a = [...document.querySelectorAll('#gn-app li a')]; return a.length ? a.map((l) => l.textContent) : null",
    );
    assert.deepEqual(listed, ['Reader.md']);
    await run("document.querySelector('#gn-app li a').click()");
    await until("return location.pathname.endsWith('editor.html') && !!document.querySelector('textarea')");
  });

  test("it draws the note's graph", options, async () => {
    const boxes = await until("return document.querySelectorAll('.thoughtknot-svg g.node').length");
    assert.equal(boxes, 3);
  });

  test('an edit typed in the editor is written to the note on disk', options, async () => {
    await run(
      `const t = document.querySelector('textarea.thoughtknot-text');
       t.value = arguments[0];
       t.dispatchEvent(new Event('input', { bubbles: true }));`,
      [NOTE.replace(/```gql\n[\s\S]*```/, '```gql\n' + EDITED + '\n```')],
    );
    const end = Date.now() + 20_000;
    while (!readFileSync(join(folder, 'Reader.md'), 'utf8').includes("(small:Option {name: 'Small reader'})")) {
      if (Date.now() > end) assert.fail('the edit was never written to the note');
      await pause(250);
    }
  });

  test('the window loads only its own files, and its policy refuses any other address', options, async () => {
    const own = await run(
      `return [...document.querySelectorAll('script[src], link[href], img[src]')]
         .map((e) => new URL(e.src || e.href, location.href))
         .filter((u) => u.origin !== location.origin).map(String)`,
    );
    assert.deepEqual(own, [], 'every page part comes from the app itself');
    const asked = await call('POST', `/session/${session}/execute/async`, {
      // the refusal must be the policy's, not a network that happens to be down: the policy says what it stopped
      script: `const done = arguments[arguments.length - 1];
        let stopped = null;
        document.addEventListener('securitypolicyviolation', (e) => (stopped = e.effectiveDirective));
        fetch('https://example.com/').then(
          () => done('fetched'),
          () => setTimeout(() => done('refused by ' + stopped), 500),
        );`,
      args: [],
    });
    assert.equal(asked, 'refused by connect-src');
  });
});
