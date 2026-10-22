// A headless Chrome driven over the DevTools protocol with Node's own WebSocket, so no browser library is installed.
// The user guide's screenshots (wiki-screens.mjs) and the checks run in a real browser (spec §41:
// a11y_targets_reflow_auto) share it. Chrome is the one given, or the first of the usual names on the PATH.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

/**
 * Chrome's first page, from `list`, its list of pages. The list is asked again, up to `tries` times, while it cannot be
 * read or holds no page yet: Chrome answers with an empty list before its first page is open.
 */
export async function firstPage(list, { tries = 100, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 0; i < tries; i++) {
    const pages = await list().catch(() => null);
    const page = Array.isArray(pages) ? pages.find((p) => p.type === 'page') : undefined;
    if (page) return page;
    await wait(100);
  }
  throw new Error('Chrome opened no page');
}

/**
 * The port Chrome's DevTools took, from the file it writes in its profile once it listens. Chrome is asked for any free
 * port, so two Chromes started at once never pick the same one. The file is read again, up to `tries` times, until then.
 */
export async function portOf(
  profile,
  {
    tries = 100,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    read = () => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8'),
  } = {},
) {
  for (let i = 0; i < tries; i++) {
    let text = '';
    try {
      text = read();
    } catch {
      // not written yet
    }
    const port = Number.parseInt(text.split('\n')[0] ?? '', 10);
    if (port > 0) return port;
    await wait(100);
  }
  throw new Error('Chrome opened no DevTools port');
}

/** A DevTools session on Chrome's first page: send(method, params) resolves with the result, or throws its error. */
async function devtools(port) {
  const page = await firstPage(() => fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()));
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
 * Removes a Chrome profile folder, trying again for two seconds while Chrome's helpers still write to it. A folder still
 * busy after that (ENOTEMPTY or EBUSY) is left in the temporary folder for the system to clear. Any other error is thrown.
 */
export function removeProfile(profile, remove = rmSync) {
  try {
    remove(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (e) {
    if (e?.code !== 'ENOTEMPTY' && e?.code !== 'EBUSY') throw e;
  }
}

/**
 * Starts a headless Chrome on a fresh profile, its page `width` by `height` CSS pixels at `scale`.
 * - send speaks the DevTools protocol.
 * - run runs a line of script in the page.
 * - resize sets a new width.
 * - stop ends it all.
 * `flags` are more of Chrome's switches, such as those that let it paint with WebGL and WebGPU in software.
 */
export async function startChrome({ chrome, width = 1400, height = 1000, scale = 2, flags = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'thoughtknot-chrome-'));
  const browser = spawn(
    findChrome(chrome),
    [
      '--headless=new',
      '--no-sandbox',
      ...(flags.length ? [] : ['--disable-gpu']),
      '--no-proxy-server',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      ...flags,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const exited = new Promise((done) => browser.once('exit', done));
  const stop = async () => {
    browser.kill();
    await exited;
    // Chrome's helpers may still write to the profile for a moment after it exits, so its removal is tried again for two
    // seconds. A profile still busy after that is left in the temporary folder, which is no reason to fail a check.
    removeProfile(profile);
  };
  try {
    const { send, close } = await devtools(await portOf(profile));
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
