// The drawing in a note (spec §3), as the built plugin puts it on the page: loaded in Node with a stand-in for Obsidian
// and a small fake DOM. What it looks like and how it feels is checked on the devices (device-checklist.md); this checks
// what is there and what each control does. Here: what is drawn, and what is shown when it cannot be.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { fence, labelled } from './host/notes.js';
import { load, styles, GRAPH, show, svgOf } from './host/view-notes.js';

before(() => build());

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
    assert.ok(el.querySelector('.thoughtknot'), 'inside the plugin’s own box');
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
    const list = el.querySelector('.thoughtknot-problems');
    assert.ok(list.hidden, 'listed behind the badge');
    badge.click();
    assert.ok(!list.hidden);
    assert.equal(badge.getAttribute('aria-expanded'), 'true');
    const items = list.querySelectorAll('li').map((li) => li.textContent);
    assert.equal(items.length, 2);
    assert.match(items[0], /^✖ Error — Line 9: .*nowhere/);
    assert.match(items[1], /^✖ Error — Line 10: /);
  });

  test('a graph whose only finding is a hint shows no problems count, and the hint is still listed, as a hint', async () => {
    const { el } = await show(env, fence('// graph: g\n(large_reader:Option)'));
    assert.equal(el.querySelectorAll('g.node').length, 1);
    const badge = labelled(el, 'No problems');
    assert.ok(badge, 'a hint is not a problem');
    badge.click();
    const items = el.querySelector('.thoughtknot-problems').querySelectorAll('li');
    assert.equal(items.length, 1);
    assert.match(items[0].textContent, /^ℹ Hint — Line 3:.*Large reader/);
    assert.equal(items[0].className, 'is-hint');
  });

  test('a hint with an error is counted as the error alone', async () => {
    const note = fence("// graph: g\n(large_reader:Option),\n(a:T {name: 'A'})-[:R]->(nowhere)");
    const { el } = await show(env, note);
    assert.ok(labelled(el, '1 problem'));
  });

  test('a block nothing can be read from shows its text and its problems, never a blank', async () => {
    const { el } = await show(env, fence('// graph: g\n(a:T {name: })'));
    assert.equal(svgOf(el), null);
    assert.match(el.querySelector('code').textContent, /\(a:T \{name: \}\)/);
    assert.match(el.querySelector('.thoughtknot-problems').textContent, /Line 3/);
    assert.ok(
      !el.querySelector('.thoughtknot-problems').hidden,
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

  test('a copy the device refuses says so in a notice, never fails without a word', async () => {
    const { el } = await show(env, fence('MATCH (n) RETURN n'));
    const clipboard = globalThis.navigator.clipboard,
      writeText = clipboard.writeText;
    clipboard.writeText = () => Promise.reject(new Error('not allowed'));
    try {
      labelled(el, 'Copy').click();
      await until(() => env.state.notices.some((n) => /could not copy/i.test(n)));
    } finally {
      clipboard.writeText = writeText;
    }
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
      assert.match(el.querySelector('.thoughtknot-banner').textContent, /could not start/);
      assert.match(el.querySelector('.thoughtknot-banner').textContent, /stale/);
      assert.match(el.querySelector('code').textContent, /large_reader|large/);
    } finally {
      env.uninstall();
    }
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

describe('the drawing’s words are not text to select', () => {
  // the try-out: the labels of the boxes and links sat on the theme's selection colour after a double click to zoom
  test('the drawing cannot be selected as text, so a double click zooms without highlighting its words', () => {
    assert.match(styles, /\.thoughtknot-svg\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/);
  });
});
