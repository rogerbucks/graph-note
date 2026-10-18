// A headless Chrome driven over the DevTools protocol with Node's own WebSocket, so no browser library is installed:
// the user guide's screenshots (wiki-screens.mjs) and the checks run in a real browser (spec §41: a11y_targets_reflow_auto)
// share it. Chrome is the one given, or the first of the usual names on the PATH.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The Chrome to run: the one given, or the first of the usual names found on the PATH. */
export function findChrome(given, which = (n) => execFileSync('which', [n], { encoding: 'utf8' }).trim()) {
  if (given) return given;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'])
    try {
      const found = which(name);
      if (found) return found;
    } catch {
      // not this one
    }
  throw new Error('no Chrome found: give one with --chrome PATH');
}

/** A DevTools session on Chrome's first page: send(method, params) resolves with the result, or throws its error. */
async function devtools(port) {
  let pages;
  for (let i = 0; i < 100 && !pages; i++)
    pages = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .catch(() => new Promise((r) => setTimeout(r, 100)));
  const page = (pages ?? []).find((p) => p.type === 'page');
  if (!page) throw new Error('Chrome opened no page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, fail) => ((ws.onopen = done), (ws.onerror = fail)));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (!waiting.has(m.id)) return;
    const [done, fail] = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.error) fail(new Error(m.error.message));
    else done(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      waiting.set(++id, [done, fail]);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** Runs a line of script in the page and gives back its value. */
export async function run(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description ?? 'failed'}`);
  return r.result.value;
}

/**
 * Starts a headless Chrome on a fresh profile, its page `width` by `height` CSS pixels at `scale`: send speaks the
 * DevTools protocol, run runs a line of script in the page, resize sets a new width, and stop ends it all.
 */
export async function startChrome({ chrome, width = 1400, height = 1000, scale = 2 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'thoughtknot-chrome-'));
  const browser = spawn(
    findChrome(chrome),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-proxy-server',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const exited = new Promise((done) => browser.once('exit', done));
  const stop = async () => {
    browser.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  try {
    const { send, close } = await devtools(port);
    await send('Page.enable');
    const resize = (w, h = height) =>
      send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    await resize(width);
    return {
      send,
      run: (expression) => run(send, expression),
      resize,
      stop: () => {
        close();
        return stop();
      },
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
