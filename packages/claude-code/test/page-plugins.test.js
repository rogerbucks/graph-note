// The plug-ins from outside on the browser page (editor spec §54, plugin_outside_page; API-10). The page turns none on.
// The server serves only the files turned on in Obsidian, each while its SHA-256 is the one it was turned on with. Each
// is sealed before its first line and served under a policy with no connection. The page runs each in a worker and
// draws the note's graph by a diagram type one adds. A file left out is said on the page, with why.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as Thread } from 'node:worker_threads';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { PLUGIN_START } from '../server/page-assets.ts';
import { PLUGIN_DATA, OUTSIDE_FOLDER, PLUGIN_CSP, pagePlugins, pluginPath } from '../server/page-plugins.ts';
import { built, cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(() => cleanUp());

const SAMPLE = readFileSync(new URL('../../../examples/sample-plugin/plugin.js', import.meta.url), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const fence = (text) => ['```gql', text, '```'].join('\n');
const TRIP =
  "// graph: trip\n(home:Place {name: 'Home'}),\n(park:Place {name: 'The <b>park</b>'}),\n(home)-[:NEAR]->(park)";
const ROW = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'example.sample.row'})";
const NOTE = ['# Trip', '', fence(TRIP), '', fence(ROW), ''].join('\n');

/** The vault's Obsidian settings with `on` turned on, each as `{ name: text }`, and the plug-in folder's files. */
const vaultFiles = (on, folder = on) => ({
  [join('.obsidian', PLUGIN_DATA)]: JSON.stringify({
    outside: Object.fromEntries(Object.entries(on).map(([n, t]) => [n, { sha: sha(t) }])),
  }),
  ...Object.fromEntries(Object.entries(folder).map(([n, t]) => [`${OUTSIDE_FOLDER}/${n}`, t])),
});

/** A vault folder holding `files`; removed after the file's cases. */
function vault(files) {
  const dir = mkdtempSync(join(tmpdir(), 'page-plugins-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe('the server serves only the plug-ins turned on in Obsidian (plugin_outside_page)', () => {
  test('a file turned on is served sealed, at its SHA-256, under a policy with no connection', async () => {
    const start = readFileSync(join((await built()).dir, PLUGIN_START), 'utf8');
    const { list, files } = await pagePlugins(vault(vaultFiles({ 'sample.js': SAMPLE })), start);
    assert.deepEqual(list, [{ name: 'sample.js', sha: sha(SAMPLE) }]);
    const file = files.get(pluginPath(sha(SAMPLE)));
    assert.equal(file.csp, PLUGIN_CSP);
    assert.match(PLUGIN_CSP, /default-src 'none'/);
    const body = file.body.toString();
    assert.ok(body.startsWith(`const thoughtknotServe = (${start})(self);`), 'the seal runs first');
    assert.match(body, /thoughtknotServe\(thoughtknotPlugin\)/);
  });

  test('a file changed since, one that imports, a name with a folder in it and one not on are never served', async () => {
    const importing = `import x from 'y';\n${SAMPLE}`;
    const dir = vault({
      ...vaultFiles(
        { 'changed.js': SAMPLE, 'importing.js': importing, '../outside.js': SAMPLE },
        { 'changed.js': `${SAMPLE}\n// changed`, 'importing.js': importing, 'off.js': SAMPLE },
      ),
    });
    const { list, files } = await pagePlugins(dir, 'function (scope) {}');
    assert.equal(files.size, 0);
    assert.deepEqual(
      list.map((p) => p.name),
      ['changed.js', 'importing.js', '../outside.js'],
    );
    assert.match(list[0].why, /changed after it was turned on/);
    assert.match(list[1].why, /imports other code/);
    assert.match(list[2].why, /not a plain file name/);
  });

  test('with no Obsidian settings in the vault, none is served', async () => {
    const { list, files } = await pagePlugins(vault({ [`${OUTSIDE_FOLDER}/sample.js`]: SAMPLE }), 'x');
    assert.deepEqual([list, files.size], [[], 0]);
  });
});

/** The page's Worker: a plug-in's file from the server, run in a thread with a worker's `self`; the layout's as before. */
function pluginWorkers(window, threads) {
  const Layout = window.Worker;
  const SELF =
    "const { parentPort } = require('node:worker_threads');" +
    'const self = { onmessage: null, postMessage: (m) => parentPort.postMessage(m) };' +
    "parentPort.on('message', (data) => self.onmessage && self.onmessage({ data }));\n";
  window.Worker = class {
    constructor(url) {
      if (!url.startsWith('/plugins/')) return new Layout(url);
      this.thread = fetch(`${window.location.origin}${url}`).then(async (r) => {
        this.csp = r.headers.get('content-security-policy');
        const t = new Thread(SELF + (await r.text()), { eval: true });
        threads.push(t);
        t.on('message', (data) => this.onmessage?.({ data }));
        t.on('error', (e) => this.onerror?.({ message: e.message }));
        return t;
      });
      window.started = [...(window.started ?? []), this];
    }
    postMessage(m) {
      void this.thread.then((t) => t.postMessage(m));
    }
    terminate() {
      void this.thread.then((t) => t.terminate());
    }
  };
}

describe('the page runs them and draws the graph by a type one adds (plugin_outside_page)', () => {
  test('the sample turned on draws the note’s graph as its row, and the worker’s file has no connection', async () => {
    const threads = [];
    const blobs = [];
    const page = await livePage(NOTE, {
      files: vaultFiles({ 'sample.js': SAMPLE }),
      plugins: true,
      before: (window) => {
        pluginWorkers(window, threads);
        window.URL.createObjectURL = (b) => (blobs.push(b), 'blob:drawing');
      },
    });
    try {
      const doc = page.doc;
      await until(() => doc.querySelector('.gn-plugins img'), 8000);
      const img = doc.querySelector('.gn-plugins img');
      assert.match(img.getAttribute('alt'), /example\.sample\.row.*example\.sample/);
      const svg = await blobs.at(-1).text();
      assert.match(svg, /data-thing="home"/);
      assert.match(svg, /data-thing="park"/);
      assert.doesNotMatch(svg, /<b>/, 'a label’s markup is drawn as text');
      assert.equal(page.window.started[0].csp, PLUGIN_CSP);
    } finally {
      await Promise.all(threads.map((t) => t.terminate()));
      await page.stop();
    }
  });

  test('the colours the sample adds join the page as a sheet of their own, light and dark (plugin_theme_tokens)', async () => {
    const threads = [];
    const sheets = [];
    const page = await livePage(NOTE, {
      files: vaultFiles({ 'sample.js': SAMPLE }),
      plugins: true,
      before: (window) => {
        pluginWorkers(window, threads);
        // jsdom adopts no sheet made in code: this keeps the CSS each was given, as the browser applies it
        window.CSSStyleSheet = class {
          replaceSync(css) {
            this.text = css;
          }
        };
        Object.defineProperty(window.document, 'adoptedStyleSheets', {
          get: () => sheets,
          set: (all) => sheets.splice(0, sheets.length, ...all),
        });
      },
    });
    try {
      await until(() => sheets.length, 8000);
      assert.match(sheets[0].text, /:root,\.theme-light\{--gn-plugin-example-sample-mark:#1a1a1a\}/);
      assert.match(sheets[0].text, /prefers-color-scheme: dark\)\{:root\{--gn-plugin-example-sample-mark:#f0f0f0\}/);
    } finally {
      await Promise.all(threads.map((t) => t.terminate()));
      await page.stop();
    }
  });

  test('a file changed since it was turned on is not run, and the page says so by its name', async () => {
    const page = await livePage(NOTE, {
      files: vaultFiles({ 'sample.js': SAMPLE }, { 'sample.js': `${SAMPLE}\n// changed` }),
      plugins: true,
    });
    try {
      await until(() => page.doc.querySelector('.gn-plugins'), 8000);
      const said = page.doc.querySelector('.gn-plugins').textContent;
      assert.match(said, /sample\.js is not run here: its file changed after it was turned on/);
      assert.match(said, /comes from the plug-in example\.sample/, 'and the graph is not drawn by its type');
    } finally {
      await page.stop();
    }
  });
});
