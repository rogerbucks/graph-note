// The browser editor's page (editor spec §26; test_cc_page). It is proved here a requirement at a time, as the workstreams
// that build the page arrive:
//   - cc_core_only (C4, this file's first cases): the page takes every reading, drawing, check and edit from the core and
//     from the display layer shared with the Obsidian host (`packages/core/src/display/`), and imports no Obsidian code or
//     stand-in for it. Tried on the import graph, on a real bundle of the page's side, and on the layer run with no
//     Obsidian in the process.
//   - C5 (the second describe below) proves the page's host shell on the page as built and served: one Markdown renderer,
//     text shown as text, the worker, the theme, icons, offline, settings read only. C8 adds the accessibility and
//     motion cases.
//   - C6 (editor-page-export.js, registered below) proves cc_export_same: the page's export is the shared export.
// Until the file proves every rule its record covers, test_cc_page is `partial`.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { FakeElement, fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { ask, POLICY } from './editor-threats-support.js';
import { exportSameCases } from './editor-page-export.js';
import { PACKAGE, built, cleanUp, pageSources, runWorker, servePage } from './editor-page-support.js';

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

test('a page that has installed no host fails drawing a card with the layer’s NO_HOST words, not a TypeError', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'graph-note-page-'));
  const doc = fakeDocument(700),
    uninstall = installGlobals(doc);
  try {
    const out = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `export { GraphView } from './${LAYER}/graph-view/graph-view.ts'; export { NO_HOST } from './${LAYER}/host.ts';`,
        resolveDir: ROOT,
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'node',
      write: false,
      logLevel: 'silent',
    });
    const file = join(dir, 'bare.mjs');
    writeFileSync(file, out.outputFiles[0].text);
    const layer = await import(pathToFileURL(file).href);
    assert.throws(
      () => new layer.GraphView(doc.body, {}),
      (e) => e.message === layer.NO_HOST,
    );
  } finally {
    uninstall();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('C5: the page’s host shell, built and served as the mod ships it', () => {
  after(cleanUp);
  const sources = () => pageSources();
  const allSource = () => Object.values(sources()).join('\n');
  const hostWith = async () => {
    const { browserHost } = await import(`${at('packages/claude-code/page')}/browser-host.ts`);
    const doc = fakeDocument(700);
    doc.getElementById = () => null;
    Object.defineProperty(FakeElement.prototype, 'style', { get: () => ({}), configurable: true });
    return { doc, host: browserHost({ document: doc, setTimeout: () => 0, matchMedia: () => ({ matches: false }) }) };
  };
  const NOTE = "// graph: g\n(a:Thing {name: 'A'}),\n(b:Thing {name: 'B'}),\n(a)-[:KNOWS]->(b)";

  test('cc_one_renderer: one pinned Markdown renderer is the only dependency added, and no icon library ships', async () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@graph-note/core', 'marked']);
    assert.match(pkg.dependencies.marked, /^\d+\.\d+\.\d+$/, 'an exact version');
    const { page, worker } = await built();
    // the packages whose code is in a bundle's output (tree-shaken ones are not), by name
    const packages = (m) => [
      ...new Set(
        Object.values(m.outputs)
          .flatMap((o) => Object.entries(o.inputs))
          .filter(([i, v]) => v.bytesInOutput > 0 && i.includes('node_modules/'))
          .map(([i]) => i.split('node_modules/').pop().split('/'))
          .map((parts) => parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/')),
      ),
    ];
    assert.deepEqual(packages(page), ['marked'], 'the page holds the renderer and nothing else from outside');
    assert.deepEqual(packages(worker), ['@viz-js/viz'], 'the worker holds the Graphviz engine alone');
    const icons = readdirSync(join(PACKAGE, 'page/icons'));
    assert.ok(icons.length >= 40 && icons.every((f) => f.endsWith('.svg')), 'icons ship as image files');
    for (const f of icons) {
      const svg = readFileSync(join(PACKAGE, 'page/icons', f), 'utf8');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /, f);
      assert.doesNotMatch(svg, /<script|<image|foreignObject|href|on\w+=/i, `${f} holds no script or reference`);
    }
    const served = await ask((await servePage()).port, { path: '/icons/copy.svg' });
    assert.equal(served.headers['content-type'], 'image/svg+xml');
  });

  test('cc_text_not_html: raw HTML is shown as text, a link only to a web or mail address, an image never loaded', async () => {
    const { markdownHtml } = await import(`${at('packages/claude-code/page')}/markdown.ts`);
    const html = markdownHtml(
      '**ok** <script>alert(1)</script> <img src=x onerror=alert(1)> [a](javascript:alert(1)) [b](  JaVaScRiPt:x) ' +
        '[c](https://example.com "t") ![i](https://evil.example/p.png)\n\n<div onclick="x">block</div>\n\n<!-- c -->',
    );
    const tags = new Set([...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1]));
    assert.deepEqual([...tags].sort(), ['a', 'p', 'strong'], 'no element the note wrote itself');
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'the tag is its own text');
    assert.doesNotMatch(html, /href="(?!https?:|mailto:)/i, 'no other kind of link is made');
    assert.match(html, /<a href="https:\/\/example\.com" rel="noopener noreferrer" target="_blank" title="t">c<\/a>/);
    assert.match(html, /<a href="https:\/\/evil\.example\/p\.png"[^>]*>i<\/a>/, 'an image stays a link');
    assert.doesNotMatch(
      allSource(),
      /\b(?:innerHTML|outerHTML|insertAdjacentHTML|srcdoc|setHTMLUnsafe)\b|document\.write|\beval\(|new Function/,
    );
    const { doc, host } = await hostWith();
    host.notice('<b>name</b>');
    const note = doc.body.querySelector('.gn-notice');
    assert.equal(note.textContent, '<b>name</b>');
    assert.equal(note.children.length, 0, 'a notice is text, never markup');
  });

  test('cc_text_not_html: a menu’s titles are text, a click runs its row and closes it', async () => {
    const { doc, host } = await hostWith();
    let ran = 0;
    host.menu(
      [{ title: '<i>Trash</i>', icon: 'trash-2', warning: true, onClick: () => ran++ }, 'separator'],
      { x: 3, y: 4 },
      doc,
    );
    const menu = doc.body.querySelector('.gn-menu');
    const row = menu.querySelector('button');
    assert.equal(row.textContent, '<i>Trash</i>');
    assert.ok(row.hasClass('gn-menu-warning'));
    row.click();
    assert.equal(ran, 1);
    assert.equal(doc.body.querySelector('.gn-menu'), null, 'closed once a row ran');
  });

  test('cc_worker_same_origin: the worker is the server’s own file, and runs the core’s layout under its limits', async () => {
    const layout = sources()['layout-runner.ts'];
    assert.match(layout, /WORKER_PATH = '\/layout-worker\.js'/);
    assert.match(layout, /new win\.Worker\(WORKER_PATH\)/);
    assert.doesNotMatch(layout, /Blob|createObjectURL|data:|https?:/, 'never a Blob, a data address or another site');
    const server = await servePage();
    const worker = await ask(server.port, { path: '/layout-worker.js' });
    assert.equal(worker.status, 200);
    assert.match(worker.headers['content-type'], /^text\/javascript/);
    assert.equal(
      worker.headers['content-security-policy'],
      POLICY.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'"),
    );
    for (const path of ['/', '/page.js', '/page.css'])
      assert.equal(
        (await ask(server.port, { path })).headers['content-security-policy'],
        POLICY,
        `${path} under the policy unchanged`,
      );
    const { readNote } = await import('@graph-note/core');
    const [drawing] = readNote([NOTE]).graphs.values();
    const thread = runWorker(join((await built()).dir, 'layout-worker.js'));
    assert.deepEqual(await thread.ready(), { ready: true });
    const drawn = await thread.ask({ id: 1, drawing, sourceBytes: 1e6, theme: 'dark' });
    assert.match(drawn.drawn.svg, /<svg/);
    const refused = await thread.ask({ id: 2, drawing, sourceBytes: 100 });
    assert.equal(refused.refusal.reason, 'too-large', 'over the core’s source limit it draws nothing');
  });

  test('cc_theme_follows: the core’s light and dark colours, under the scheme the system is in, at the locked contrast', async () => {
    const { themeCss } = await import(`${at('packages/claude-code/page')}/theme-css.ts`);
    const { THEME_COLOURS } = await import(at('packages/core/src/palette.ts'));
    const [light, dark] = themeCss().split('@media (prefers-color-scheme: dark)');
    const luminance = (hex) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const [css, t] of [
      [light, THEME_COLOURS.light],
      [dark, THEME_COLOURS.dark],
    ]) {
      assert.ok(
        css.includes(`--background-primary:${t.page}`) &&
          css.includes(`--text-normal:${t.text}`) &&
          css.includes(`--text-muted:${t.muted}`),
      );
      for (const [hue, hex] of Object.entries(t))
        if (!['page', 'text', 'muted'].includes(hue)) assert.ok(css.includes(`--color-${hue}:${hex}`), hue);
      assert.ok(ratio(t.text, t.page) >= 4.5 && ratio(t.muted, t.page) >= 4.5, 'text and muted text reach 4.5:1');
    }
    const doc = fakeDocument(700);
    const { showGraph } = await import(`${at('packages/claude-code/page')}/graph-section.ts`);
    const themes = [];
    let change;
    const query = { matches: true, addEventListener: (_t, f) => (change = f) };
    const win = {
      document: doc,
      matchMedia: () => query,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      Blob: class {},
    };
    await showGraph(win, doc.body, `\`\`\`gql\n${NOTE}\n\`\`\``, {
      draw: async (_d, _o, theme) => (themes.push(theme), { svg: '<svg/>' }),
    });
    query.matches = false;
    change();
    assert.deepEqual(themes, ['dark', 'light'], 'drawn again in the other scheme when the system changes');
    const served = await ask((await servePage()).port, { path: '/page.css' });
    assert.ok(served.text.includes(themeCss()), 'the served sheet carries the theme');
  });

  test('cc_icons: every icon the layer names is a file, shown as an image and never as its name', async () => {
    const names = new Set();
    for (const f of files(LAYER).filter((p) => p.endsWith('.ts'))) {
      const text = readFileSync(at(f), 'utf8');
      for (const m of text.matchAll(/setIcon\([^)]*\)|icon: '[a-z0-9-]+'|^.*\bbutton\(.*$/gm))
        // a button's icon comes before its callback, which may hold lower-case words of its own
        for (const n of m[0]
          .slice(Math.max(0, m[0].indexOf('button(')))
          .split(/,\s*\(/)[0]
          .replace(/addClass\([^)]*\)|[=!]==\s*'[^']*'/g, '')
          .matchAll(/'([a-z][a-z0-9]*(?:-[a-z0-9]+)*)'/g))
          if (!n[1].startsWith('mod-')) names.add(n[1]); // `mod-cta` is a class of a text button, not an icon
    }
    for (const n of ['copy', 'pencil', 'trash-2', 'layout-dashboard', 'panel-right-open'])
      assert.ok(names.has(n), `${n} is one the layer asks for`);
    for (const n of names)
      if (!['text-button-icon'].includes(n)) assert.ok(existsSync(join(PACKAGE, 'page/icons', `${n}.svg`)), `${n}.svg`);
    const { doc, host } = await hostWith();
    const el = doc.createElement('button');
    host.icon(el, 'copy');
    assert.equal(el.children[0].className, 'gn-icon gn-icon-copy');
    assert.equal(el.textContent, '', 'no name shown');
    host.icon(el, '../x" onload="y');
    assert.equal(el.children[0].className, 'gn-icon', 'a name that is no file’s is the plain square');
    const css = (await ask((await servePage()).port, { path: '/page.css' })).text;
    for (const f of readdirSync(join(PACKAGE, 'page/icons')))
      assert.ok(css.includes(`.gn-icon-${f.slice(0, -4)}{--gn-icon-image:url('/icons/${f}')}`), f);
  });

  test('cc_offline: every file of the page is the server’s own, and nothing in it reaches another origin', async () => {
    const server = await servePage();
    const page = await ask(server.port, { path: '/' });
    const css = (await ask(server.port, { path: '/page.css' })).text;
    const refs = [...page.text.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    const urls = [...css.matchAll(/url\(['"]?([^'")]+)/g)].map((m) => m[1]);
    assert.ok(refs.length >= 2 && urls.length >= 40);
    for (const ref of [...refs, ...urls]) {
      assert.match(ref, /^\/[a-z]/, `${ref} is from the server's own root`);
      assert.equal((await ask(server.port, { path: ref })).status, 200, ref);
    }
    assert.doesNotMatch(css, /@import/);
    assert.doesNotMatch(POLICY, /https?:|\*/, 'the policy names no other origin');
    const text = allSource();
    assert.doesNotMatch(text, /https?:\/\//, 'the page’s source names no address');
    assert.doesNotMatch(text, /XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|import\(/);
    assert.deepEqual(
      [...text.matchAll(/\bfetch(?:er)?\(\s*([^,)]+)/g)].map((m) => m[1]).filter((u) => !u.startsWith('`/api/')),
      [],
      'every call is to the server’s /api/',
    );
    const { serverCalls, takeFragment } = await import(`${at('packages/claude-code/page')}/server-calls.ts`);
    const asked = [];
    const calls = serverCalls(
      'tok',
      async (url, init) => (
        asked.push([url, init.headers.authorization]),
        { ok: true, json: async () => ({ indent: 'two' }) }
      ),
    );
    await calls.settings();
    await calls.note('n 1');
    assert.deepEqual(asked, [
      ['/api/settings', 'Bearer tok'],
      ['/api/notes/n%201', 'Bearer tok'],
    ]);
    const replaced = [];
    const got = takeFragment({
      location: { hash: '#token=abc&note=n1', pathname: '/' },
      history: { replaceState: (...a) => replaced.push(a) },
    });
    assert.deepEqual(got, { token: 'abc', note: 'n1' });
    assert.deepEqual(replaced, [[null, '', '/']], 'the token leaves the address once read');
  });

  test('cc_settings_shared: the page is told the mod’s settings, read only', async () => {
    const { settingsFrom } = await import('@graph-note/core');
    const { settingsEnvironment } = await import(at('packages/claude-code/src/editor-settings-env.ts'));
    const saved = {
      classifications: ['Public', 'Secret'],
      aiUnlabelled: 'Public',
      indent: 'tab',
      direction: 'LR',
      aiModels: [{ name: 'Claude', ceiling: 'Public', endpoint: 'https://x.example/v1', model: 'm' }],
    };
    const { settingsForServer } = await import(at('packages/claude-code/src/editor-launch.ts'));
    const sent = settingsEnvironment(saved, settingsForServer(saved));
    const keys = Object.keys(JSON.parse(sent));
    for (const k of ['aiModels', 'aiUnlabelled', 'classifications', 'direction', 'indent'])
      assert.ok(keys.includes(k), k);
    assert.doesNotMatch(sent, /endpoint|x\.example/, 'no model’s address goes to the server');
    const server = await servePage(sent);
    const headers = { authorization: `Bearer ${server.token}` };
    const reply = await ask(server.port, { path: '/api/settings', headers });
    assert.equal(reply.status, 200);
    assert.deepEqual(JSON.parse(reply.text), { ...settingsFrom(JSON.parse(sent)), aiModels: [] });
    assert.equal(JSON.parse(reply.text).indent, 'tab', 'the mod’s setting, not the default');
    assert.equal((await ask(server.port, { path: '/api/settings' })).status, 401);
    const write = await ask(server.port, {
      method: 'PUT',
      path: '/api/settings',
      body: '{}',
      headers: { ...headers, origin: server.origin, 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(write.status, 405, 'settings are never written from the page');
    assert.doesNotMatch(sources()['server-calls.ts'], /PUT|method:/);
  });
  test('the note’s id is encoded in the address’s fragment, so no character in it can add or end a field', async () => {
    const { pageAddress } = await import(at('packages/claude-code/server/editor-process.ts'));
    const url = new URL(pageAddress('http://127.0.0.1:1', 'tok', 'a%b+c&d#e'));
    const fields = new URLSearchParams(url.hash.slice(1));
    assert.deepEqual([...fields.keys()], ['token', 'note']);
    assert.equal(fields.get('note'), 'a%b+c&d#e');
    assert.equal(fields.get('token'), 'tok');
  });

  test('a start with no built page fails in plain words, and never serves the page’s source folder', async () => {
    const { pageFiles } = await import(at('packages/claude-code/server/editor-main.ts'));
    const here = mkdtempSync(join(tmpdir(), 'graph-note-nopage-'));
    try {
      await assert.rejects(() => pageFiles(join(here, 'bin')), /not built/);
      await assert.rejects(() => pageFiles(join(here, 'server')), /not built/);
    } finally {
      rmSync(here, { recursive: true, force: true });
    }
  });
});

// C6: cc_export_same, the page's export is the shared export (cases in editor-page-export.js, within the size baseline).
exportSameCases({ at, ROOT, LAYER, importsOf });

// C8: the page's cases for cc_keyboard, cc_reduced_motion and cc_text_version go here.
