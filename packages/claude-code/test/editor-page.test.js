// The browser editor's page (editor spec §26; test_cc_page). It is proved here a requirement at a time, as the workstreams
// that build the page arrive:
//   - cc_core_only (C4, this file's first cases): the page takes every reading, drawing, check and edit from the core and
//     from the display layer shared with the Obsidian host (`packages/core/src/display/`), and imports no Obsidian code or
//     stand-in for it. Tried on the import graph, on a real bundle of the page's side, and on the layer run with no
//     Obsidian in the process.
//   - C5 adds the page's own cases below (one Markdown renderer, text shown as text, the worker, the theme, icons,
//     offline, settings read only); C8 adds the accessibility and motion ones. The page's own entry joins PAGE_SIDE.
// Until the file proves every rule its record covers, test_cc_page is `partial`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const LAYER = 'packages/core/src/display';
const at = (p) => join(ROOT, p);

/** The modules the page runs: what the browser editor holds of its own, and the layer's drawing, details and forms. C5 adds its entry. */
const PAGE_SIDE = [
  'packages/claude-code/src/editor-session.ts',
  `${LAYER}/graph-view/graph-view.ts`,
  `${LAYER}/properties/properties.ts`,
  `${LAYER}/export/export-form.ts`,
];

/** Every file under a folder, as paths from the repository's root. */
function files(dir) {
  return readdirSync(at(dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(at(p)).isDirectory() ? files(p) : [p];
  });
}

/** The module names a source file imports or re-exports. */
const importsOf = (text) =>
  [
    ...text.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2]);

/** A bundle of `entries` for a page: its metafile says every source file that went in. */
async function bundled(entries, extra = {}) {
  return build({
    absWorkingDir: ROOT,
    entryPoints: entries,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    metafile: true,
    outdir: 'out',
    logLevel: 'silent',
    ...extra,
  });
}

describe('cc_core_only: the page takes everything from the core and the shared display layer', () => {
  test('the display layer is a folder of the core, and the Obsidian plugin keeps no copy of it', () => {
    for (const f of ['host.ts', 'lifecycle.ts', 'dom-helpers.ts', 'graph-view/graph-view.ts'])
      assert.ok(existsSync(at(`${LAYER}/${f}`)), `${LAYER}/${f}`);
    assert.ok(!existsSync(at('packages/obsidian/src/graph-view')), 'the drawing lives in the layer alone');
    for (const f of ['properties', 'export/export-form.ts', 'proposals/proposal-strip.ts'])
      assert.ok(!existsSync(at(`packages/obsidian/src/${f}`)), f);
    const block = readFileSync(at('packages/obsidian/src/graph-card.ts'), 'utf8');
    assert.ok(
      importsOf(block).includes('@graph-note/core/display/graph-view/graph-view'),
      'the plugin draws with the layer',
    );
  });

  test('the layer imports only the core, the graph library and itself: no Obsidian, no Node, no editor', () => {
    const own = files(LAYER).filter((f) => /\.ts$/.test(f));
    assert.ok(own.length >= 40, `${own.length} modules in the layer`);
    for (const f of own) {
      for (const m of importsOf(readFileSync(at(f), 'utf8'))) {
        const fine = /^\.\.?\//.test(m) || /^@graph-note\/(core|graph-spec)(\/|$)/.test(m);
        assert.ok(fine, `${f} imports ${m}`);
      }
    }
  });

  test('a bundle of the page’s side holds the core, the graph library and the layer alone', async () => {
    const { metafile } = await bundled(PAGE_SIDE);
    const inputs = Object.keys(metafile.inputs);
    const allowed = [
      /^packages\/core\/src\//,
      /^packages\/graph-spec\/src\//,
      /^packages\/claude-code\/src\//,
      /^python\/graph_spec\/src\/[\w.]+\.json$/, // the style data the graph library reads
      /^node_modules\/@viz-js\//,
    ];
    assert.deepEqual(
      inputs.filter((i) => !allowed.some((a) => a.test(i))),
      [],
      'only the core, the graph library, the Graphviz engine and the page’s own modules',
    );
    assert.ok(
      inputs.some((i) => i.startsWith(`${LAYER}/graph-view/`)),
      'the layer is in it',
    );
    assert.deepEqual(
      inputs.filter((i) => /obsidian|codemirror|lezer|electron/i.test(i)),
      [],
    );
  });

  test('no host is installed until the page or the plugin installs one, and a missing one is said', async () => {
    const { installHost, displayHost, NO_HOST } = await import(`${at(LAYER)}/host.ts`);
    assert.throws(
      () => displayHost(),
      (e) => e.message === NO_HOST,
    );
    const plain = { icon() {}, isPhone: () => false, notice() {}, menu() {} };
    installHost(plain);
    assert.equal(displayHost(), plain);
  });

  test('the layer’s own lifecycle loads, unloads and takes back every listener and child', async () => {
    const { Lifecycle } = await import(`${at(LAYER)}/lifecycle.ts`);
    const said = [];
    class Card extends Lifecycle {
      onload() {
        said.push('load');
      }
      onunload() {
        said.push('unload');
      }
    }
    const card = new Card(),
      child = new Card(),
      target = new EventTarget();
    let heard = 0;
    card.registerDomEvent(target, 'ping', () => heard++);
    card.register(() => said.push('registered'));
    card.addChild(child);
    assert.deepEqual(said, [], 'nothing loads before the card does');
    card.load();
    card.load();
    assert.deepEqual(said, ['load', 'load'], 'the card, then its child, once each');
    target.dispatchEvent(new Event('ping'));
    assert.equal(heard, 1);
    card.removeChild(child);
    assert.deepEqual(said, ['load', 'load', 'unload']);
    card.addChild(child);
    assert.equal(said.length, 4, 'a child added to a loaded card loads at once');
    card.unload();
    card.unload();
    target.dispatchEvent(new Event('ping'));
    assert.equal(heard, 1, 'the listener went with the card');
    assert.deepEqual(
      said.slice(4).sort(),
      ['registered', 'unload', 'unload'],
      'the card, its child and the callback, once',
    );
  });

  test('the DOM helpers the layer draws with are put on a plain window, and only where they are missing', async () => {
    const { installDomHelpers } = await import(`${at(LAYER)}/dom-helpers.ts`);
    class Node_ {
      constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.classes = new Set();
        this.attrs = {};
        this.textContent = '';
      }
      appendChild(c) {
        this.children.push(c);
        return c;
      }
      get ownerDocument() {
        return { createElement: (t) => new Node_(t), createElementNS: (_n, t) => new Node_(t) };
      }
      get classList() {
        return {
          add: (...c) => c.forEach((x) => this.classes.add(x)),
          remove: (...c) => c.forEach((x) => this.classes.delete(x)),
          toggle: (c, on) => ((on ?? !this.classes.has(c)) ? this.classes.add(c) : this.classes.delete(c)),
          contains: (c) => this.classes.has(c),
        };
      }
      setAttribute(k, v) {
        this.attrs[k] = v;
      }
      replaceChildren() {
        this.children = [];
      }
    }
    const win = { Element: Node_, HTMLElement: Node_, SVGElement: Node_, document: {}, innerHeight: 5 };
    installDomHelpers(win);
    const root = new Node_('div'),
      row = root.createDiv({ cls: 'a b', text: 'hello', attr: { role: 'row' } });
    assert.equal(row.tag, 'div');
    assert.deepEqual([...row.classes], ['a', 'b']);
    assert.equal(row.textContent, 'hello');
    assert.equal(row.attrs.role, 'row');
    assert.equal(root.children[0], row);
    row.createSpan({ text: 'x' });
    assert.equal(row.children[0].tag, 'span');
    row.empty();
    assert.deepEqual(row.children, []);
    row.addClass('c');
    assert.ok(row.hasClass('c'));
    row.toggleClass('c', false);
    assert.ok(!row.hasClass('c'));
    const own = () => 'mine';
    Node_.prototype.createDiv = own;
    installDomHelpers(win);
    assert.equal(Node_.prototype.createDiv, own, 'a helper already there is left as it is');
  });

  test('the layer draws through the host it is given, in a process with no Obsidian in it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'graph-note-page-'));
    const doc = fakeDocument(700),
      uninstall = installGlobals(doc);
    try {
      const out = await build({
        absWorkingDir: ROOT,
        stdin: {
          contents: `export { button } from './${LAYER}/graph-view/view-bar.ts'; export { installHost } from './${LAYER}/host.ts';`,
          resolveDir: ROOT,
          loader: 'ts',
        },
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        logLevel: 'silent',
      });
      const file = join(dir, 'layer.mjs');
      writeFileSync(file, out.outputFiles[0].text);
      const layer = await import(pathToFileURL(file).href);
      const drawn = [];
      layer.installHost({ icon: (el, name) => drawn.push([el, name]), isPhone: () => false, notice() {}, menu() {} });
      let clicks = 0;
      const b = layer.button(doc.body, 'Fit', 'maximize', () => clicks++, 'Fit');
      assert.equal(b.getAttribute('aria-label'), 'Fit');
      assert.deepEqual(drawn, [[b, 'maximize']], 'the icon is the host’s to draw');
      b.click();
      assert.equal(clicks, 1);
      assert.ok(
        !/(from|require\()\s*["']obsidian["']/.test(out.outputFiles[0].text),
        'no Obsidian module in the bundle',
      );
    } finally {
      uninstall();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// C5: the page's cases for cc_one_renderer, cc_text_not_html, cc_worker_same_origin, cc_theme_follows, cc_icons, cc_offline
// and cc_settings_shared go here.
// C8: the page's cases for cc_keyboard, cc_reduced_motion and cc_text_version go here.
