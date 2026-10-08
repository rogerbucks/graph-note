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
import { fakeObsidian, fakeContext, fakeCodeMirror } from './lib/fake-obsidian.js';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const styles = readFileSync(`${root}styles.css`, 'utf8');

before(() => {
  const r = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: `${root}packages/obsidian`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

/** Loads the built plugin against fresh fakes; returns the plugin, the fakes' record, and the document. */
async function load(options = {}) {
  const doc = fakeDocument(options.width ?? 700),
    uninstall = installGlobals(doc),
    state = { taken: options.taken, mobile: options.mobile };
  const obsidian = fakeObsidian(state);
  // main.js is CommonJS, as Obsidian loads it; the repository's own package type would make Node read it as a module
  const Module = require('node:module'),
    real = Module._load,
    file = `${root}main.js`;
  const cm = fakeCodeMirror(state);
  Module._load = (req, ...rest) => (req === 'obsidian' ? obsidian : (cm[req] ?? real(req, ...rest)));
  let Plugin;
  try {
    const m = new Module(file);
    m.filename = file;
    m.paths = Module._nodeModulePaths(root);
    m._compile(readFileSync(file, 'utf8'), file);
    Plugin = m.exports.default;
  } finally {
    Module._load = real;
  }
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
  const lines = note.split('\n'),
    fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const fenceLine = fences[n];
  let end = fenceLine + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const source = lines.slice(fenceLine + 1, end).join('\n');
  const el = env.doc.body.createDiv({ cls: 'block-language-gql' });
  const ctx = fakeContext(note, fenceLine);
  await env.state.processors.get('gql')(source, el, ctx);
  return { el, ctx };
}

const labelled = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const svgOf = (el) => el.querySelector('svg');

describe('drawn where it is written', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

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
    const note = [
      fence(GRAPH),
      'Then:',
      fence("// graph: reader · SOURCE\n(price:Reason {title: 'Costs more'}),\n(price)-[:COUNTS_AGAINST]->(large)"),
    ].join('\n');
    const first = await show(env, note, 0),
      second = await show(env, note, 1);
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
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the drawing carries a problems badge, Fit, zoom out, zoom in, Full screen and Edit', async () => {
    const { el } = await show(env, fence(GRAPH));
    const bar = el.querySelector('.graph-note-bar');
    assert.equal(bar.getAttribute('role'), 'toolbar');
    for (const label of ['No problems', 'Fit', 'Zoom out', 'Zoom in', 'Full screen', 'Edit here', 'Edit in pane'])
      assert.ok(labelled(bar, label), label);
  });

  test('each control says what it is in words and an icon, not by colour', async () => {
    const { el } = await show(env, fence(GRAPH));
    for (const b of el.querySelector('.graph-note-bar').querySelectorAll('button')) {
      assert.ok(b.getAttribute('aria-label'), 'a name for screen readers');
      assert.ok(b.getAttribute('data-icon'), `an icon on ${b.getAttribute('aria-label')}`);
    }
    assert.match(labelled(el, 'No problems').textContent, /No problems/, 'the badge says its count in words');
  });

  test('in Live Preview the bar leaves room for Obsidian’s own edit-block button, which appears at the block’s top right on hover', () => {
    assert.match(styles, /\.cm-embed-block \.graph-note-bar\s*\{\s*padding-inline-end:\s*var\(--size-4-9\);/);
  });

  test('touch targets are at least 44 points', () => {
    assert.match(styles, /\.graph-note-bar button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
  });

  test('Edit asks the plugin to open the edit pane on this block', async () => {
    const opened = [];
    env.plugin.openEditor = (target) => opened.push(target);
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Edit in pane').click();
    assert.equal(opened.length, 1);
    assert.deepEqual(
      { path: opened[0].path, line: opened[0].line, graph: opened[0].graph },
      { path: 'Some note.md', line: 0, graph: 'reader' },
    );
  });
});

describe('a graph with problems is still drawn', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('what can be read is drawn, and the rest is listed behind the badge', async () => {
    const note = fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(broken:Reason {title: })');
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
    assert.match(items[0], /^✖ Error — Line 9: .*nowhere/);
    assert.match(items[1], /^✖ Error — Line 10: /);
  });

  test('a block nothing can be read from shows its text and its problems, never a blank', async () => {
    const { el } = await show(env, fence('// graph: g\n(a:T {name: })'));
    assert.equal(svgOf(el), null);
    assert.match(el.querySelector('code').textContent, /\(a:T \{name: \}\)/);
    assert.match(el.querySelector('.graph-note-problems').textContent, /Line 3/);
    assert.ok(
      !el.querySelector('.graph-note-problems').hidden,
      'shown at once: there is no drawing to look at instead',
    );
  });

  test('an empty graph opens on a prompt to start with a thing', async () => {
    const { el } = await show(env, fence('// graph: fresh'));
    assert.match(el.textContent, /start/i);
    assert.ok(labelled(el, 'Edit'), 'with a way to start');
  });
});

describe('code that is not a graph', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('a query, a schema or an excerpt is shown as coloured code, as gql-highlight shows it', async () => {
    const { el } = await show(env, fence('// graph: reader · QUERY\nMATCH (n:Option) RETURN n.name'));
    assert.equal(svgOf(el), null);
    const code = el.querySelector('code');
    assert.equal(code.textContent, '// graph: reader · QUERY\nMATCH (n:Option) RETURN n.name');
    assert.deepEqual(
      code.querySelectorAll('span.gql-kw').map((s) => s.textContent),
      ['MATCH', 'RETURN'],
    );
    assert.deepEqual(
      code.querySelectorAll('span.gql-label').map((s) => s.textContent),
      ['Option'],
    );
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
    } finally {
      env.uninstall();
    }
  });

  test('if the drawing engine cannot start, the text is shown with a banner, never a blank', async () => {
    const env = await load({
      engine: async () => {
        throw new Error('no WebAssembly here');
      },
    });
    try {
      const { el } = await show(env, fence(GRAPH));
      assert.equal(svgOf(el), null);
      assert.match(el.querySelector('.graph-note-banner').textContent, /could not start/);
      assert.match(el.querySelector('.graph-note-banner').textContent, /stale/);
      assert.match(el.querySelector('code').textContent, /large_reader|large/);
    } finally {
      env.uninstall();
    }
  });
});

describe('zoom in the note', () => {
  let env;
  before(async () => {
    env = await load({ width: 300 });
  });
  after(() => env.uninstall());
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
    labelled(el, 'Zoom out').click();
    labelled(el, 'Zoom out').click();
    assert.ok(widthOf(el) < fitted);
    labelled(el, 'Fit').click();
    assert.equal(widthOf(el), fitted);
    assert.ok(!svgOf(el).getAttribute('style')?.includes('scale'), 'resized, not scaled');
  });

  test('plus, minus and zero work when the drawing has focus', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'),
      fitted = widthOf(el);
    assert.equal(vp.getAttribute('tabindex'), '0', 'the drawing can take focus');
    assert.ok(vp.dispatch('keydown', { key: '+' }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
    vp.dispatch('keydown', { key: '0' });
    assert.equal(widthOf(el), fitted);
  });

  test('the wheel alone scrolls the note; with Ctrl or Command it zooms the drawing', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport'),
      fitted = widthOf(el);
    assert.equal(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 }).defaultPrevented, false);
    assert.equal(widthOf(el), fitted);
    assert.ok(vp.dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10, ctrlKey: true }).defaultPrevented);
    assert.ok(widthOf(el) > fitted);
  });

  test('one finger on a fitted drawing is left to scroll the note', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport');
    assert.equal(vp.cssProps['--graph-note-touch'], 'pan-x pan-y');
    assert.equal(
      vp.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50, button: 0 })
        .defaultPrevented,
      false,
    );
    labelled(el, 'Zoom in').click();
    assert.equal(vp.cssProps['--graph-note-touch'], 'none', 'once zoomed in, one finger pans');
  });
});

describe('full screen', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

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
    assert.ok(
      overlay.querySelector('.graph-note-viewport').dispatch('wheel', { deltaY: -100, clientX: 10, clientY: 10 })
        .defaultPrevented,
    );
    labelled(overlay, 'Close full screen').click();
    assert.equal(env.doc.body.querySelector('.graph-note-fullscreen'), null);
  });
});

describe('details on demand', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('tapping a box shows its text, its kind, and its links in and out', async () => {
    const { el } = await show(env, fence(GRAPH));
    const box = el.querySelectorAll('g.node')[1];
    const vp = el.querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', {
      target: box,
      pointerId: 3,
      pointerType: 'touch',
      clientX: 20,
      clientY: 20,
      button: 0,
    });
    vp.dispatch('pointerup', { target: box, pointerId: 3, pointerType: 'touch', clientX: 21, clientY: 20, button: 0 });
    const panel = el.querySelector('.graph-note-details');
    assert.ok(!panel.hidden);
    const text = panel.textContent;
    for (const s of ['Large reader', 'Option', 'answers → Which device?', 'Easy on the eyes favours this'])
      assert.ok(text.includes(s), s);
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

describe('each bar and its details belong to their own drawing', () => {
  // bar_and_details_belong (spec §3, slice 1; Roger, 7 Oct 2026: "the tool strip is not visibly connected to the graphic,
  // which makes it less than obvious which tool strip belongs to which diagram. Also, the same applies to the info
  // window."): with several drawings in one note, each bar and each details card sit inside their own drawing's card. How
  // plain that is in a theme is the device check's to judge.
  const rule = (sel) =>
    new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(styles)?.[2] ?? '';
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('with two drawings in a note, each bar and each details card sit inside their own drawing’s card', async () => {
    const OTHER = "// graph: trip\n(home:Place {name: 'Home'}), (walk:Leg {name: 'Walk'}), (walk)-[:STARTS_AT]->(home)";
    const note = [fence(GRAPH), 'Between the two.', fence(OTHER)].join('\n\n');
    const cards = [(await show(env, note, 0)).el, (await show(env, note, 1)).el];
    const box = cards[1].querySelectorAll('g.node')[0];
    const vp = cards[1].querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', { target: box, pointerId: 4, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
    vp.dispatch('pointerup', { target: box, pointerId: 4, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
    cards.forEach((el, i) => {
      const card = el.querySelector('.graph-note-view');
      assert.equal(el.querySelectorAll('.graph-note-view').length, 1, `one card for drawing ${i + 1}`);
      // compared by identity: a failing equal on two fake elements would print the whole page
      assert.ok(card.children[0]?.classList.contains('graph-note-bar'), 'the bar is the card’s header');
      assert.ok(el.querySelector('.graph-note-bar').closest('.graph-note-view') === card, 'the bar is inside the card');
      const details = el.querySelector('.graph-note-details');
      assert.ok(details.closest('.graph-note-view') === card, 'the details are inside the card');
      const order = card.children.map((c) => c.getAttribute('class') ?? '');
      assert.ok(
        order.findIndex((c) => c.includes('graph-note-details')) >
          order.findIndex((c) => c.includes('graph-note-viewport')),
        'the details sit under the drawing',
      );
      assert.equal(details.hidden, i === 0, i === 0 ? 'the other drawing shows no details' : 'the tapped one does');
    });
  });

  test('the card has its own border round the bar, the drawing and the details, with the bar as a header strip', () => {
    const card = rule('.graph-note-view');
    assert.match(card, /border:\s*1px solid var\(--background-modifier-border(-focus)?\)/);
    assert.match(card, /border-radius:/);
    assert.match(card, /overflow:\s*hidden/);
    const bar = rule('.graph-note-view > .graph-note-bar');
    assert.match(bar, /background:\s*var\(--background-secondary\)/);
    assert.match(bar, /border-bottom:\s*1px solid/);
    assert.match(
      rule('.graph-note-view > .graph-note-problems,\n.graph-note-view > .graph-note-details'),
      /border-top:\s*1px solid/,
    );
  });

  // Roger chose A, 8 Oct 2026: the theme's ordinary border is too faint to tie a bar to its drawing (1.32 : 1 on white,
  // 1.38 : 1 on Obsidian's dark), so the card and the bar's rule take the theme's focus border, still the theme's own
  test('the card and the bar’s rule are drawn in the theme’s focus border, which stands out from the page in light and dark', () => {
    assert.match(rule('.graph-note-view'), /border:\s*1px solid var\(--background-modifier-border-focus\)/);
    assert.match(
      rule('.graph-note-view > .graph-note-bar'),
      /border-bottom:\s*1px solid var\(--background-modifier-border-focus\)/,
    );
    // Obsidian's default themes, as the app ships them (8 Oct 2026): the page, its ordinary border and its focus border
    const themes = { light: ['#ffffff', '#e0e0e0', '#bdbdbd'], dark: ['#1e1e1e', '#363636', '#555555'] };
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const [theme, [page, plain, focus]] of Object.entries(themes)) {
      assert.ok(contrast(page, focus) >= 1.8, `${theme}: ${contrast(page, focus).toFixed(2)} : 1`);
      assert.ok(
        contrast(page, focus) > contrast(page, plain) * 1.35,
        `${theme}: plainly stronger than the ordinary border`,
      );
    }
  });
});

describe('estimated links', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());
  const TYPO = fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(tablett)');

  test('a near miss is drawn as a guess: one more link, dashed, with a warning sign and the word estimated', async () => {
    const { el } = await show(env, TYPO);
    const edges = el.querySelectorAll('g.edge');
    assert.equal(edges.length, 5);
    const guess = edges[4];
    assert.equal(guess.getAttribute('data-estimate'), '0');
    assert.ok(
      guess.querySelectorAll('path').some((p) => p.getAttribute('stroke-dasharray')),
      'dashed',
    );
    assert.match(guess.textContent, /⚠ favours \(estimated\)/);
    assert.ok(labelled(el, '1 problem'), 'and counted behind the badge');
  });

  test('tapping an estimated link explains it in a sentence, on the note’s own line', async () => {
    const { el } = await show(env, TYPO);
    const guess = el.querySelectorAll('g.edge')[4],
      vp = el.querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', {
      target: guess,
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
      button: 0,
    });
    vp.dispatch('pointerup', {
      target: guess,
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
      button: 0,
    });
    assert.equal(
      el
        .querySelector('.graph-note-details')
        .textContent.includes(
          'Line 9 links to tablett, which is not in graph reader. It was taken to mean tablet, one letter away. To fix it, change tablett to tablet.',
        ),
      true,
    );
  });

  test('an estimated link can be reached and explained from the keyboard', async () => {
    const { el } = await show(env, TYPO);
    const guess = el.querySelectorAll('g.edge')[4];
    assert.equal(guess.getAttribute('tabindex'), '0');
    assert.match(guess.getAttribute('aria-label'), /^Estimated link: Easy on the eyes favours Tablet/);
    guess.dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.graph-note-details').textContent, /taken to mean tablet/);
  });
});

describe('help behind the badge', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the completeness report is behind the badge: covered, deferred and missing, with a fix for each gap', async () => {
    const rule =
      GRAPH +
      ",\n(every_option_answers:Cardinality {kind: 'Option', relationship: 'ANSWERS', direction: 'out', min: 1, says: 'every option answers the question'}),\n(spare:Option {name: 'Spare'})";
    const { el } = await show(env, fence(rule));
    const badge = labelled(el, '1 gap');
    assert.ok(badge, 'the badge counts the gap');
    badge.click();
    const panel = el.querySelector('.graph-note-problems');
    assert.match(panel.textContent, /Completeness/);
    assert.match(panel.textContent, /every option answers the question: 2 of 3 covered, 1 missing/);
    assert.match(panel.textContent, /Spare: add a ANSWERS link/);
  });

  test('many problems are grouped by kind, the worst first', async () => {
    const many =
      GRAPH +
      ',\n' +
      Array.from({ length: 6 }, (_, i) => `(eyes)-[:FAVOURS]->(gone_${i})`).join(',\n') +
      ',\n' +
      Array.from({ length: 4 }, (_, i) => `(x${i}:T {v: })`).join(',\n') +
      ',\n(eyes)-[:FAVOURS]->(tablett)';
    const { el } = await show(env, fence(many));
    const groups = el.querySelectorAll('.graph-note-problems details');
    assert.ok(groups.length >= 2, 'grouped');
    const titles = groups.map((g) => g.querySelector('summary').textContent);
    assert.match(titles[0], /^Error/);
    assert.match(titles[titles.length - 1], /^Warning/);
    assert.match(titles.join('|'), /6 × .*not in the graph/);
  });

  test('a few problems are listed one by one, each with a sign as well as its words', async () => {
    const { el } = await show(env, fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(eyes)-[:FAVOURS]->(tablett)'));
    const items = el.querySelectorAll('.graph-note-problems li');
    assert.equal(items.length, 2);
    assert.ok(
      items.every((li) => /^(✖ Error|⚠ Warning)/.test(li.textContent)),
      items.map((li) => li.textContent).join('|'),
    );
  });

  test('the drawing has a text version for screen readers: every thing and every link, in sentences', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport');
    const sr = el.querySelector(`#${vp.getAttribute('aria-describedby')}`);
    assert.ok(sr.classList.contains('graph-note-sr'));
    assert.match(sr.textContent, /Graph reader: 4 things, 4 links\./);
    assert.match(sr.textContent, /Easy on the eyes favours Large reader\./);
  });
});

describe('older phones', () => {
  const styleOf = (el) =>
    el
      .querySelectorAll('path, polygon')
      .map((p) => p.getAttribute('style') ?? '')
      .join(' ');

  test('where CSS color-mix is supported, the drawing keeps the locked style’s blends', async () => {
    const env = await load();
    try {
      globalThis.CSS = { supports: () => true };
      const { el } = await show(env, fence(GRAPH));
      assert.match(styleOf(el), /color-mix/);
    } finally {
      delete globalThis.CSS;
      env.uninstall();
    }
  });

  test('where it is not (iOS before 16.2), each blend falls back to its plain theme hue, never to black', async () => {
    const env = await load();
    try {
      globalThis.CSS = { supports: (_p, v) => !/color-mix/.test(v) };
      const { el } = await show(env, fence(GRAPH));
      assert.doesNotMatch(styleOf(el), /color-mix/);
      assert.match(styleOf(el), /var\(--color-\w+\)/);
    } finally {
      delete globalThis.CSS;
      env.uninstall();
    }
  });
});

describe('one frame: the bar and the details belong to their drawing', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the bar, the drawing and the details sit in one framed card, the bar as its header strip', async () => {
    const { el } = await show(env, fence(GRAPH));
    const card = el.querySelector('.graph-note-view');
    for (const part of ['.graph-note-bar', '.graph-note-viewport', '.graph-note-details', '.graph-note-problems'])
      assert.ok(card.querySelector(part), part);
    assert.equal(card.children[0].className, 'graph-note-bar', 'the bar comes first, at the top edge');
    assert.match(
      styles,
      /\.graph-note-view\s*\{[^}]*border:\s*1px solid var\(--background-modifier-border\);[^}]*border-radius:/,
    );
    assert.match(
      styles,
      /\.graph-note-view > \.graph-note-bar\s*\{[^}]*background:\s*var\(--background-secondary\);[^}]*border-bottom:/,
    );
  });

  test('the box whose details are open is marked as selected, by a heavier outline as well as for screen readers', async () => {
    const { el } = await show(env, fence(GRAPH));
    const [first, second] = el.querySelectorAll('g.node');
    first.dispatch('keydown', { key: 'Enter' });
    assert.ok(first.classList.contains('is-selected'));
    assert.equal(first.getAttribute('aria-pressed'), 'true');
    second.dispatch('keydown', { key: 'Enter' });
    assert.ok(!first.classList.contains('is-selected'), 'one at a time');
    assert.ok(second.classList.contains('is-selected'));
    const panel = el.querySelector('.graph-note-details');
    assert.equal(panel.getAttribute('aria-label'), 'Details of Large reader');
    labelled(panel, 'Close details').click();
    assert.ok(!second.classList.contains('is-selected'), 'closing the details clears the mark');
    assert.match(styles, /\.graph-note-svg g\.is-selected > :is\(path, polygon\)\s*\{[^}]*stroke-width:\s*3;/);
  });
});

describe('details of a link', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('tapping a link shows its reading, the things at either end, and its properties', async () => {
    const { el } = await show(
      env,
      fence(GRAPH.replace('(eyes)-[:FAVOURS]->(large)', "(eyes)-[:FAVOURS {strength: 'strong'}]->(large)")),
    );
    const link = el.querySelectorAll('g.edge')[2];
    const vp = el.querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', {
      target: link,
      pointerId: 5,
      pointerType: 'touch',
      clientX: 40,
      clientY: 40,
      button: 0,
    });
    vp.dispatch('pointerup', { target: link, pointerId: 5, pointerType: 'touch', clientX: 40, clientY: 40, button: 0 });
    const panel = el.querySelector('.graph-note-details');
    assert.ok(!panel.hidden);
    for (const s of ['Easy on the eyes', 'favours', 'Large reader', 'FAVOURS', 'strength', 'strong'])
      assert.ok(panel.textContent.includes(s), s);
    assert.ok(link.classList.contains('is-selected'), 'the link is marked as selected');
  });

  test('each link can be reached and opened from the keyboard, and is named for screen readers', async () => {
    const { el } = await show(env, fence(GRAPH));
    const link = el.querySelectorAll('g.edge')[0];
    assert.equal(link.getAttribute('tabindex'), '0');
    assert.equal(link.getAttribute('aria-label'), 'Link: Large reader answers Which device?');
    link.dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.graph-note-details').textContent, /answers/);
  });
});

describe('the drawing’s words are not text to select', () => {
  // the try-out: the labels of the boxes and links sat on the theme's selection colour after a double click to zoom
  test('the drawing cannot be selected as text, so a double click zooms without highlighting its words', () => {
    assert.match(styles, /\.graph-note-svg\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/);
  });
});
