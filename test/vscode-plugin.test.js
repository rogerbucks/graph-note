// The VS Code extension draws and edits the graph blocks of a Markdown file in a webview (spec §41, vscode_plugin).
// The extension is built as it ships (packages/vscode/esbuild.config.mjs). It is loaded against a stand-in for VS
// Code's API over a real folder (packages/vscode/test/fake-vscode.js). Its tab's page then runs in a real browser, served as a
// webview serves it: VS Code's messages are carried both ways, and nothing else. The page must:
// - draw the note's graph, and write an edit typed in it to the note on disk;
// - load only the extension's own files, under the tab's content policy;
// - reach the folder only through the checked calls.
// The notes it reads and writes that way pass the core's storage contract (storage_contract).
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser cases skip with one line, except in CI, where a missing Chrome fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { buildExtension } from '../packages/vscode/esbuild.config.mjs';
import { fakeVscode, loadExtension, Uri } from '../packages/vscode/test/fake-vscode.js';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { storageContract } from '../packages/core/src/storage-contract.ts';
import { workspaceStorage } from '../packages/core/src/workspace-storage.ts';
import { tauriFiles } from '../packages/app/src/tauri-files.ts';
import { folderCalls } from '../packages/vscode/src/folder-calls.ts';
import { EDITED, GRAPH, NOTE } from './repository/journey-note.js';
import { until as untilTrue } from '../packages/obsidian/test/host/load-plugin.js';

const made = [];
/** A new empty folder, real path, put away after the tests. */
const folder = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'thoughtknot-vscode-')));
  made.push(dir);
  return dir;
};
after(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

let building;
/** The extension, built once into a folder of its own: the folder VS Code would install it in. */
const built = () =>
  (building ??= (async () => {
    const dir = folder();
    await buildExtension(join(dir, 'dist'));
    return dir;
  })());

/** A workspace folder holding the journey's note, the extension loaded and activated in a stand-in VS Code. */
async function opened({ language = 'en', origin, note = 'Reader.md', text = NOTE } = {}) {
  const extension = await built();
  const workspace = folder();
  mkdirSync(join(workspace, note, '..'), { recursive: true });
  writeFileSync(join(workspace, note), text);
  const fake = fakeVscode({ language, folders: [workspace], origin, served: extension });
  const context = { subscriptions: [], extensionUri: Uri.file(extension) };
  loadExtension(join(extension, 'dist/extension.cjs'), fake.vscode).activate(context);
  fake.vscode.window.activeTextEditor = { document: { uri: Uri.file(join(workspace, note)) } };
  return { ...fake, extension, workspace, open: (...args) => fake.commands.get('thoughtknot.openGraph')(...args) };
}

describe('Open in ThoughtKnot, in VS Code', () => {
  test('opens one tab beside the note, named for it, in VS Code’s language; asked again, it shows that tab', async () => {
    const vs = await opened({ language: 'fr' });
    await vs.open();
    assert.equal(vs.tabs.length, 1);
    const [tab] = vs.tabs;
    assert.equal(tab.title, 'Reader.md in ThoughtKnot');
    assert.equal(tab.options.enableScripts, true);
    assert.deepEqual(
      tab.options.localResourceRoots.map((u) => u.path),
      [join(vs.extension, 'dist/webview')],
      'the page reaches only the extension’s own page files',
    );
    const settings = JSON.parse(/<script id="thoughtknot-vscode"[^>]*>([^<]*)<\/script>/.exec(tab.webview.html)[1]);
    assert.equal(settings.note, 'Reader.md');
    assert.equal(settings.language, 'fr');
    assert.match(tab.webview.html, /<html lang="fr"/);
    await vs.open();
    assert.equal(vs.tabs.length, 1, 'no second tab for the same note');
    assert.equal(tab.revealed, 1);
  });

  test('a note in a sub-folder opens by its path in the workspace; outside one, its own folder is the folder', async () => {
    const inside = await opened({ note: 'plans/2026/Reader.md' });
    await inside.open();
    assert.match(inside.tabs[0].webview.html, /"note":"plans\/2026\/Reader.md"/);
    const outside = await opened();
    outside.vscode.workspace.getWorkspaceFolder = () => undefined;
    await outside.open();
    assert.match(outside.tabs[0].webview.html, /"note":"Reader.md"/);
  });

  test('with no Markdown note, or one in a hidden folder, nothing opens and VS Code says why', async () => {
    const none = await opened();
    none.vscode.window.activeTextEditor = undefined;
    await none.open();
    const hidden = await opened({ note: '.notes/Reader.md' });
    await hidden.open();
    assert.equal(none.tabs.length + hidden.tabs.length, 0);
    assert.deepEqual(
      [...none.said, ...hidden.said],
      [
        'Open a Markdown note first, then choose Open in ThoughtKnot.',
        'This note is in a hidden folder, such as .git. ThoughtKnot never opens notes there.',
      ],
    );
  });

  test('the page reaches the folder only through checked calls: out of the folder, hidden or through a link is refused', async () => {
    const vs = await opened();
    await vs.open();
    const [tab] = vs.tabs;
    const outside = folder();
    writeFileSync(join(outside, 'secret.md'), 'kept outside');
    symlinkSync(outside, join(vs.workspace, 'elsewhere'));
    const replies = [];
    tab.toPage = (m) => replies.push(m);
    const ask = async (call, args) => (
      await tab.fromPage({ kind: 'call', id: replies.length + 1, call, args }),
      replies.at(-1)
    );
    assert.deepEqual(await ask('read_text', { path: 'Reader.md' }), { kind: 'reply', id: 1, ok: true, value: NOTE });
    assert.deepEqual(await ask('read_dir', { path: '' }), {
      kind: 'reply',
      id: 2,
      ok: true,
      value: [['Reader.md', false]],
    });
    for (const path of ['../secret.md', '/etc/passwd', '.git/config', 'elsewhere/secret.md', 'a\\b.md'])
      assert.equal((await ask('read_text', { path })).ok, false, path);
    assert.deepEqual(await ask('read_text', { path: 'gone.md' }), { kind: 'reply', id: 8, ok: false, error: 'ENOENT' });
    assert.equal((await ask('run', { command: 'ls' })).error, 'no such call: run');
    const names = await ask('write_new', {
      into: '',
      files: [
        ['Reader.svg', [60, 115]],
        ['Reader.svg', [60]],
      ],
    });
    assert.deepEqual(names.value, ['Reader.svg', 'Reader-2.svg'], 'an export is written as new files, never over one');
    assert.equal(readFileSync(join(vs.workspace, 'Reader.md'), 'utf8'), NOTE);
  });
});

describe('notes in a VS Code workspace, read and written through the tab’s calls, pass the storage contract', () => {
  let vscodeDisk, vscode;
  before(async () => {
    const extension = await built();
    ({ vscode } = fakeVscode());
    ({ vscodeDisk } = loadExtension(join(extension, 'dist/extension.cjs'), vscode));
  });
  /** The page's side of the calls (the desktop app's), answered by the extension's side over a new folder. */
  const storage = () => {
    const answer = folderCalls(vscodeDisk(vscode.Uri.file(folder())));
    return workspaceStorage(
      tauriFiles(async (call, args) => {
        const reply = await answer({ kind: 'call', id: 1, call, args });
        if (!reply.ok) throw reply.error;
        return reply.value;
      }),
    );
  };
  for (const check of storageContract(storage)) test(check.name, check.run);
});

describe('the tab’s page, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the VS Code tab is run in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must run the VS Code tab, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 180_000 };
  let browser, server, vs, origin;
  const outside = [];

  /** Waits in the page until `expression` gives something truthy, and gives that; the page itself looks every 100 ms. */
  const until = (expression, ms = 60_000) =>
    browser.run(`new Promise((done, fail) => {
      const end = Date.now() + ${ms};
      const look = () => {
        let value = null;
        try { value = (${expression}); } catch {}
        if (value) return done(value);
        if (Date.now() > end) return fail(new Error('never true'));
        setTimeout(look, 100);
      };
      look();
    })`);

  before(async () => {
    if (why) return;
    const extension = await built();
    // the webview's files from the extension's folder, and the tab's own page; anything else is counted and refused
    server = createServer((request, reply) => {
      const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };
      if (path === '/tab.html')
        return reply.writeHead(200, { 'content-type': 'text/html' }).end(vs.tabs[0].webview.html);
      // the browser asks for this of its own accord; a webview has none
      if (path === '/favicon.ico') return reply.writeHead(404).end();
      const file = normalize(join(extension, path));
      if (!file.startsWith(join(extension, 'dist/webview/'))) return (outside.push(path), reply.writeHead(404).end());
      try {
        reply
          .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
          .end(readFileSync(file));
      } catch {
        outside.push(path);
        reply.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    origin = `http://127.0.0.1:${server.address().port}`;
    vs = await opened({ origin });
    await vs.open();
    const [tab] = vs.tabs;
    browser = await startChrome({ chrome, width: 1200, height: 900, scale: 1 });
    // VS Code's side of a webview: acquireVsCodeApi posts to the extension, and the extension's posts arrive as messages
    await browser.send('Runtime.enable');
    await browser.send('Runtime.addBinding', { name: 'thoughtknotToHost' });
    browser.on('Runtime.bindingCalled', ({ name, payload }) => {
      if (name === 'thoughtknotToHost') void tab.fromPage(JSON.parse(payload));
    });
    tab.toPage = (message) =>
      void browser
        .run(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(message)} }))`)
        .catch(() => undefined);
    await browser.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.acquireVsCodeApi = () => ({ postMessage: (m) => window.thoughtknotToHost(JSON.stringify(m)) });',
    });
    await browser.send('Page.navigate', { url: `${origin}/tab.html` });
  });
  after(async () => {
    await browser?.stop();
    server?.close();
  });

  test('it draws the note’s graph', options, async () => {
    assert.equal(await until("document.querySelectorAll('.thoughtknot-svg g.node').length"), 3);
  });

  test('an edit typed in the tab is written to the note on disk', options, async () => {
    await until("!!document.querySelector('textarea.thoughtknot-text')");
    const edited = NOTE.replace(GRAPH, EDITED);
    await browser.run(`(() => {
      const t = document.querySelector('textarea.thoughtknot-text');
      t.value = ${JSON.stringify(EDITED)};
      t.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await untilTrue(() => readFileSync(join(vs.workspace, 'Reader.md'), 'utf8') === edited, 20_000);
    assert.equal(await until("document.querySelectorAll('.thoughtknot-svg g.node').length === 4"), true);
  });

  test('it loads only the extension’s own files, and its content policy stops any other script', options, async () => {
    const parts = await browser.run(
      `[...document.querySelectorAll('script[src], link[href], img[src]')].map((e) => new URL(e.src || e.href).origin)`,
    );
    assert.deepEqual([...new Set(parts)], [origin]);
    assert.deepEqual(outside, [], 'nothing was asked for outside the page’s files');
    const stopped = await browser.run(`new Promise((done) => {
      document.addEventListener('securitypolicyviolation', (e) => done(e.effectiveDirective), { once: true });
      const s = document.createElement('script');
      s.textContent = 'window.ran = true';
      document.head.append(s);
      setTimeout(() => done(window.ran ? 'ran' : 'nothing said'), 2000);
    })`);
    assert.equal(stopped, 'script-src-elem');
  });
});
