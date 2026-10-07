// The drawing in a note (spec §3), as the built plugin puts it on the page: loaded in Node with a stand-in for Obsidian
// and a small fake DOM. What it looks like and how it feels is checked on the devices (device-checklist.md); this checks
// what is there and what each control does.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { fakeDocument, installGlobals } from './lib/fake-dom.js';
import { fakeObsidian, fakeContext } from './lib/fake-obsidian.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const styles = readFileSync(`${root}styles.css`, 'utf8');

before(() => {
  const r = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: `${root}packages/obsidian`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

/** Loads the built plugin against fresh fakes; returns the plugin, the fakes' record, and the document. */
async function load(options = {}) {
  const doc = fakeDocument(options.width ?? 700), uninstall = installGlobals(doc), state = { taken: options.taken, mobile: options.mobile };
  const obsidian = fakeObsidian(state);
  // main.js is CommonJS, as Obsidian loads it; the repository's own package type would make Node read it as a module
  const Module = require('node:module'), real = Module._load, file = `${root}main.js`;
  Module._load = (req, ...rest) => (req === 'obsidian' ? obsidian : real(req, ...rest));
  let Plugin;
  try {
    const m = new Module(file);
    m.filename = file; m.paths = Module._nodeModulePaths(root);
    m._compile(readFileSync(file, 'utf8'), file);
    Plugin = m.exports.default;
  } finally { Module._load = real; }
  const plugin = new Plugin();
  if (options.engine) plugin.loadEngine = options.engine;
  await plugin.onload();
  return { plugin, state, doc, uninstall };
}

const fence = (body) => '```gql\n' + body + '\n```';
const GRAPH = `// graph: reader · SOURCE
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(tablet:Option {name: 'Tablet'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(q), (tablet)-[:ANSWERS]->(q),
(eyes)-[:FAVOURS]->(large), (eyes)-[:COUNTS_AGAINST]->(tablet)`;

/** Runs the gql processor on block `n` of a note, as Obsidian would; resolves when it has drawn. */
async function show(env, note, n = 0) {
  const lines = note.split('\n'), fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const fenceLine = fences[n];
  let end = fenceLine + 1; while (!/^```\s*$/.test(lines[end])) end++;
  const source = lines.slice(fenceLine + 1, end).join('\n');
  const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
  const ctx = fakeContext(note, fenceLine);
  await env.state.processors.get('gql')(source, el, ctx);
  return { el, ctx };
}

const labelled = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const svgOf = (el) => el.querySelector('svg');

describe('drawn where it is written', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('the plugin draws gql blocks, in reading view and in Live Preview alike', () => {
    assert.ok(env.state.processors.has('gql'));
  });

  test('a graph block is drawn as the graph, from the bundled engine', async () => {
    const { el } = await show(env, fence(GRAPH));
    const svg = svgOf(el);
    assert.ok(svg, 'there is a drawing');
    assert.equal(el.querySelectorAll('g.node').length, 4);
    assert.equal(el.querySelectorAll('g.edge').length, 4);
    assert.ok(el.querySelector('.graph-note'), 'inside the plugin’s own box');
  });

  test('the drawing is never inside a .mermaid box, so the Mermaid Zoom plugin never adds a second set of controls', async () => {
    const { el } = await show(env, fence(GRAPH));
    assert.equal(svgOf(el).closest('.mermaid'), null);
  });

  test('a later block draws the graph as built so far', async () => {
    const note = [fence(GRAPH), 'Then:', fence("// graph: reader · SOURCE\n(price:Reason {title: 'Costs more'}),\n(price)-[:COUNTS_AGAINST]->(large)")].join('\n');
    const first = await show(env, note, 0), second = await show(env, note, 1);
    assert.equal(first.el.querySelectorAll('g.node').length, 4);
    assert.equal(second.el.querySelectorAll('g.node').length, 5);
  });

  test('a block shown on its own, with no note around it, is still drawn', async () => {
    const el = env.doc.body.createDiv();
    await env.state.processors.get('gql')(GRAPH, el, fakeContext('', -1));
    assert.equal(el.querySelectorAll('g.node').length, 4);
  });
});

describe('the bar', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('the drawing carries a problems badge, Fit, zoom out, zoom in, Full screen and Edit', async () => {
    const { el } = await show(env, fence(GRAPH));
    const bar = el.querySelector('.graph-note-bar');
    assert.equal(bar.getAttribute('role'), 'toolbar');
    for (const label of ['No problems', 'Fit', 'Zoom out', 'Zoom in', 'Full screen', 'Edit']) assert.ok(labelled(bar, label), label);
  });

  test('each control says what it is in words and an icon, not by colour', async () => {
    const { el } = await show(env, fence(GRAPH));
    for (const b of el.querySelector('.graph-note-bar').querySelectorAll('button')) {
      assert.ok(b.getAttribute('aria-label'), 'a name for screen readers');
      assert.ok(b.getAttribute('data-icon'), `an icon on ${b.getAttribute('aria-label')}`);
    }
    assert.match(labelled(el, 'No problems').textContent, /No problems/, 'the badge says its count in words');
  });

  test('touch targets are at least 44 points', () => {
    assert.match(styles, /\.graph-note-bar button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
  });

  test('Edit asks the plugin to open the edit pane on this block', async () => {
    const opened = [];
    env.plugin.openEditor = (target) => opened.push(target);
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Edit').click();
    assert.equal(opened.length, 1);
    assert.deepEqual({ path: opened[0].path, line: opened[0].line, graph: opened[0].graph }, { path: 'Some note.md', line: 0, graph: 'reader' });
  });
});

describe('a graph with problems is still drawn', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('what can be read is drawn, and the rest is listed behind the badge', async () => {
    const note = fence(GRAPH + ",\n(eyes)-[:FAVOURS]->(nowhere),\n(broken:Reason {title: })");
    const { el } = await show(env, note);
    assert.equal(el.querySelectorAll('g.node').length, 4);
    const badge = labelled(el, '2 problems');
    assert.ok(badge, 'the badge counts them');
    const list = el.querySelector('.graph-note-problems');
    assert.ok(list.hidden, 'listed behind the badge');
    badge.click();
    assert.ok(!list.hidden);
    assert.equal(badge.getAttribute('aria-expanded'), 'true');
    const items = list.querySelectorAll('li').map((li) => li.textContent);
    assert.equal(items.length, 2);
    assert.match(items[0], /^Line 9: .*nowhere/);
    assert.match(items[1], /^Line 10: /);
  });

  test('a block nothing can be read from shows its text and its problems, never a blank', async () => {
    const { el } = await show(env, fence('// graph: g\n(a:T {name: })'));
    assert.equal(svgOf(el), null);
    assert.match(el.querySelector('code').textContent, /\(a:T \{name: \}\)/);
    assert.match(el.querySelector('.graph-note-problems').textContent, /Line 3/);
    assert.ok(!el.querySelector('.graph-note-problems').hidden, 'shown at once: there is no drawing to look at instead');
  });

  test('an empty graph opens on a prompt to start with a thing', async () => {
    const { el } = await show(env, fence('// graph: fresh'));
    assert.match(el.textContent, /start/i);
    assert.ok(labelled(el, 'Edit'), 'with a way to start');
  });
});

describe('code that is not a graph', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('a query, a schema or an excerpt is shown as coloured code, as gql-highlight shows it', async () => {
    const { el } = await show(env, fence('// graph: reader · QUERY\nMATCH (n:Option) RETURN n.name'));
    assert.equal(svgOf(el), null);
    const code = el.querySelector('code');
    assert.equal(code.textContent, '// graph: reader · QUERY\nMATCH (n:Option) RETURN n.name');
    assert.deepEqual(code.querySelectorAll('span.gql-kw').map((s) => s.textContent), ['MATCH', 'RETURN']);
    assert.deepEqual(code.querySelectorAll('span.gql-label').map((s) => s.textContent), ['Option']);
  });

  test('its copy button copies the code', async () => {
    const { el } = await show(env, fence('MATCH (n) RETURN n'));
    labelled(el, 'Copy').click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(env.doc.clipboard, 'MATCH (n) RETURN n');
  });
});

describe('when something else is wrong, it says so', () => {
  test('if another plugin already draws gql blocks, a notice says which setting to change, and nothing breaks', async () => {
    const env = await load({ taken: new Set(['gql']) });
    try {
      assert.equal(env.state.processors.has('gql'), false);
      assert.equal(env.state.notices.length, 1);
      assert.match(env.state.notices[0], /gql/);
      assert.match(env.state.notices[0], /gql-highlight/);
    } finally { env.uninstall(); }
  });

  test('if the drawing engine cannot start, the text is shown with a banner, never a blank', async () => {
    const env = await load({ engine: async () => { throw new Error('no WebAssembly here'); } });
    try {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      assert.match(el.querySelector('.graph-note-banner').textContent, /could not start/);
      assert.match(el.querySelector('.graph-note-banner').textContent, /stale/);
      assert.match(el.querySelector('code').textContent, /large_reader|large/);
    } finally { env.uninstall(); }
  });
});

describe('zoom in the note', () => {
  let env; before(async () => { env = await load({ width: 300 }); }); after(() => env.uninstall());
  const widthOf = (el) => Number(svgOf(el).getAttribute('width'));

  test('the drawing starts fitted to the note, no wider than it', async () => {
    const { el } = await show(env, fence(GRAPH));
    assert.ok(widthOf(el) <= 300 + 1e-6, `${widthOf(el)} fits 300`);
  });

  test('Zoom in, Zoom out and Fit change the drawing’s size, not its sharpness', async () => {
    const { el } = await show(env, fence(GRAPH));
    const fitted = widthOf(el);
    labelled(el, 'Zoom in').click();
    assert.ok(widthOf(el) > fitted);
    labelled(el, 'Zoom out').click(); labelled(el, 'Zoom out').click();
    assert.ok(widthOf(el) < fitted);
    labelled(el, 'Fit').click();
    assert.equal(widthOf(el), fitted);
    assert.ok(!svgOf(el).getAttribute('style')?.includes('scale'), 'resized, not scaled');
  });

  test('plus, minus and zero work when the drawing has focus', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'), fitted = widthOf(el);
    assert.equal(vp.getAttribute('tabindex'), '0', 'the drawing can take focus');
    assert.ok(vp.dispatch('keydown', { key: '+' }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
    vp.dispatch('keydown', { key: '0' });
    assert.equal(widthOf(el), fitted);
  });

  test('the wheel alone scrolls the note; with Ctrl or Command it zooms the drawing', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'), fitted = widthOf(el);
    assert.equal(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 }).defaultPrevented, false);
    assert.equal(widthOf(el), fitted);
    assert.ok(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10, ctrlKey: true }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
  });

  test('one finger on a fitted drawing is left to scroll the note', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport');
    assert.equal(vp.cssProps['--graph-note-touch'], 'pan-x pan-y');
    assert.equal(vp.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50, button: 0 }).defaultPrevented, false);
    labelled(el, 'Zoom in').click();
    assert.equal(vp.cssProps['--graph-note-touch'], 'none', 'once zoomed in, one finger pans');
  });
});

describe('full screen', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('Full screen shows the drawing over the whole window, and Escape leaves it', async () => {
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Full screen').click();
    const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
    assert.ok(overlay);
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.querySelectorAll('g.node').length, 4);
    assert.ok(labelled(overlay, 'Close full screen'));
    overlay.querySelector('.graph-note-viewport').dispatch('keydown', { key: 'Escape' });
    assert.equal(env.doc.body.querySelector('.graph-note-fullscreen'), null);
  });

  test('in full screen the wheel alone zooms', async () => {
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Full screen').click();
    const overlay = env.doc.body.querySelector('.graph-note-fullscreen');
    assert.ok(overlay.querySelector('.graph-note-viewport').dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 }).defaultPrevented);
    labelled(overlay, 'Close full screen').click();
    assert.equal(env.doc.body.querySelector('.graph-note-fullscreen'), null);
  });
});

describe('details on demand', () => {
  let env; before(async () => { env = await load(); }); after(() => env.uninstall());

  test('tapping a box shows its text, its kind, and its links in and out', async () => {
    const { el } = await show(env, fence(GRAPH));
    const box = el.querySelectorAll('g.node')[1];
    const vp = el.querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', { target: box, pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 });
    vp.dispatch('pointerup', { target: box, pointerId: 3, pointerType: 'touch', clientX: 21, clientY: 20, button: 0 });
    const panel = el.querySelector('.graph-note-details');
    assert.ok(!panel.hidden);
    const text = panel.textContent;
    for (const s of ['Large reader', 'Option', 'answers', 'Which device?', 'favours', 'Easy on the eyes']) assert.ok(text.includes(s), s);
  });

  test('each box can be reached and opened from the keyboard', async () => {
    const { el } = await show(env, fence(GRAPH));
    const box = el.querySelectorAll('g.node')[0];
    assert.equal(box.getAttribute('tabindex'), '0');
    assert.equal(box.getAttribute('aria-label'), 'Question: Which device?');
    box.dispatch('keydown', { key: 'Enter' });
    assert.ok(el.querySelector('.graph-note-details').textContent.includes('Which device?'));
  });

  test('a problem on a box is shown with it', async () => {
    const { el } = await show(env, fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(nowhere)'));
    el.querySelectorAll('g.node')[3].dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.graph-note-details').textContent, /nowhere/);
  });
});
