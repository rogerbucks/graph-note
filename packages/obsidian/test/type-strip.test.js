// Diagram types on a drawing's card (editor spec §15): Diagram type lists the seven types, each that fits to choose and
// each that does not with why; the suggested one says so, and nothing is drawn as it until chosen; choosing writes the
// type into the style graph, for the graph or the view the card shows; a chosen type that has stopped fitting is said,
// with the nearest that fits offered, and the graph is drawn as a network meanwhile; and a graph of more than 50 things
// offers the table or a view as the way in. Reading view says how the graph is drawn and writes nothing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';
const ORG = `// graph: org
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy),
(bea)-[:MANAGES]->(dee)`;
const styled = (...lines) => ['// graph: org_style · STYLE org', ...lines].join('\n');
const noteOf = (...blocks) => ['# Org', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** Shows block `n` of a note held at PATH, keeping each drawing the plugin is asked to lay out. */
async function card(note, n = 0, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  const asked = [];
  const layout = env.plugin.layout.bind(env.plugin);
  env.plugin.layout = (drawing, owner) => {
    asked.push(drawing);
    return layout(drawing, owner);
  };
  const { el } = await show(env, note, n);
  return { env, el, asked };
}
/** Each type the list offers: its words, whether it can be chosen, and what is said beside it. */
const offered = (el) =>
  el.querySelectorAll('.thoughtknot-type-list li').map((li) => {
    const b = li.querySelector('button');
    return [b.textContent, !b.disabled, li.querySelector('.thoughtknot-type-why')?.textContent ?? ''];
  });

describe('Diagram type on a card', () => {
  // proves: diagram_type_set, type_only_when_fits, suggest_type
  test('lists the seven types: each that fits to choose, each that does not with why, the suggested one said', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      const toggle = labelled(el, 'Diagram type');
      assert.ok(toggle, 'offered on the card');
      const list = el.querySelector('.thoughtknot-type-list');
      assert.equal(list.hidden, true, 'folded away until asked');
      toggle.click();
      assert.equal(list.hidden, false);
      assert.deepEqual(offered(el), [
        ['Network', true, 'drawn now'],
        ['Tree', true, 'suggested: each thing has at most one parent along MANAGES'],
        ['Flow', true, ''],
        ['Radial', true, ''],
        ['Lanes', false, 'lanes need things of two kinds or more'],
        ['Timeline', false, 'a timeline needs every thing to carry a date, and Ada carries none'],
        ['Table', true, ''],
      ]);
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
    } finally {
      env.uninstall();
    }
  });

  // proves: suggest_type
  test('a suggestion is never drawn unless chosen: the graph is laid out as a network', async () => {
    const { env, el, asked } = await card(noteOf(ORG));
    try {
      assert.equal(asked.at(-1).diagram, undefined);
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
      assert.equal(el.querySelector('.thoughtknot-type-stopped'), null, 'nothing to say has stopped fitting');
    } finally {
      env.uninstall();
    }
  });

  // proves: type_remembered
  test('choosing a type writes it into the style graph, never the data, and the card says so', async () => {
    const note = noteOf(ORG);
    const { env, el } = await card(note);
    try {
      labelled(el, 'Diagram type').click();
      el.querySelectorAll('.thoughtknot-type-list button')
        .find((b) => b.textContent === 'Tree')
        .click();
      await until(() => /:Diagram /.test(env.state.files.get(PATH)));
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(ORG)), 'the data block untouched');
      assert.match(now, /STYLE org[\s\S]*\(diagram_1:Diagram \{type: 'tree', relationship: 'MANAGES'\}\)/);
      assert.match(env.state.notices.at(-1), /drawn as a tree/);
    } finally {
      env.uninstall();
    }
  });

  // proves: diagram_type_set
  test('a type chosen is drawn: laid out as it, and said', async () => {
    const { env, el, asked } = await card(noteOf(ORG, styled("(d1:Diagram {type: 'tree', relationship: 'MANAGES'})")));
    try {
      assert.deepEqual(asked.at(-1).diagram, { type: 'tree', tree: [0, 1, 2] });
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a tree/);
      labelled(el, 'Diagram type').click();
      const tree = el.querySelectorAll('.thoughtknot-type-list button').find((b) => b.textContent === 'Tree');
      assert.equal(tree.getAttribute('aria-pressed'), 'true');
    } finally {
      env.uninstall();
    }
  });
});

describe('the Diagram type list looks native', () => {
  test('its button says Diagram type in words, and each type is a tile marked drawn, suggested or not fitting', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      const toggle = labelled(el, 'Diagram type');
      assert.equal(
        toggle.querySelector('.thoughtknot-badge-text')?.textContent,
        'Diagram type',
        'words, not an icon alone',
      );
      toggle.click();
      const marks = el
        .querySelectorAll('.thoughtknot-type-list li')
        .map((li) =>
          ['thoughtknot-type-now', 'thoughtknot-type-suggested', 'thoughtknot-type-unfit']
            .filter((c) => li.classList.contains(c))
            .join(' '),
        );
      assert.deepEqual(marks, [
        'thoughtknot-type-now',
        'thoughtknot-type-suggested',
        '',
        '',
        'thoughtknot-type-unfit',
        'thoughtknot-type-unfit',
        '',
      ]);
    } finally {
      env.uninstall();
    }
  });
});

describe('a wide flow', () => {
  const note = noteOf(
    `${ORG},\n(eve:Person {name: 'Eve'}),\n(fay:Person {name: 'Fay'}),\n(dee)-[:MANAGES]->(eve),\n(eve)-[:MANAGES]->(fay)`,
    styled("(d1:Diagram {type: 'flow'})"),
  );

  // proves: wide_types_phone
  test('on a phone scrolls across only, fitted to its height; on a desktop it is fitted as ever', async () => {
    const phone = await card(note, 0, { mobile: true, width: 300 });
    try {
      const vp = phone.el.querySelector('.thoughtknot-viewport');
      assert.equal(
        vp.cssProps['--thoughtknot-touch'],
        'pan-y',
        'up and down scroll the note; across moves the drawing',
      );
      const svg = phone.el.querySelector('svg');
      assert.ok(Number(svg.getAttribute('width')) > 300, 'not shrunk to the card’s width');
      assert.equal(vp.cssProps['--thoughtknot-x'], '0px', 'from its start');
    } finally {
      phone.env.uninstall();
    }
    const desk = await card(note, 0, { width: 300 });
    try {
      const vp = desk.el.querySelector('.thoughtknot-viewport');
      assert.equal(vp.cssProps['--thoughtknot-touch'], 'pan-x pan-y');
      assert.ok(Number(desk.el.querySelector('svg').getAttribute('width')) <= 300, 'fitted to the card');
    } finally {
      desk.env.uninstall();
    }
  });
});

describe('a chosen type that has stopped fitting', () => {
  const twice = `${ORG},\n(cy)-[:MANAGES]->(dee)`;
  const note = noteOf(twice, styled("(d1:Diagram {type: 'tree', relationship: 'MANAGES'})"));

  // proves: type_stops_fitting
  test('is said, with why, the graph drawn as a network, and the nearest type that fits offered', async () => {
    const { env, el, asked } = await card(note);
    try {
      const banner = el.querySelector('.thoughtknot-type-stopped');
      assert.ok(banner, 'said');
      assert.equal(banner.getAttribute('role'), 'alert');
      assert.match(
        banner.textContent,
        /no longer fits a tree: along MANAGES, Dee has two parents, Bea and Cy\. It is drawn as a network/,
      );
      assert.equal(asked.at(-1).diagram, undefined, 'never drawn wrongly');
      labelled(el, 'Use flow').click();
      await until(() => /type: 'flow'/.test(env.state.files.get(PATH)));
      assert.equal(env.state.files.get(PATH).match(/:Diagram /g).length, 1, 'the choice changed in place');
    } finally {
      env.uninstall();
    }
  });
});

describe('a graph of more than 50 things', () => {
  const big = `// graph: big\n${Array.from({ length: 51 }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`).join(',\n')}`;

  // proves: large_way_in
  test('offers the table or a view as the way in, and Show as table writes the table', async () => {
    const note = noteOf(big);
    const { env, el } = await card(note);
    try {
      const way = el.querySelector('.thoughtknot-way-in');
      assert.match(way.textContent, /51 things, too many to read in one drawing: open it as a table, or make a view/);
      labelled(el, 'Show as table').click();
      await until(() => /type: 'table'/.test(env.state.files.get(PATH)));
    } finally {
      env.uninstall();
    }
  });

  // proves: large_way_in
  test('drawn as a table, offers no way in again', async () => {
    const { env, el } = await card(noteOf(big, "// graph: big_style · STYLE big\n(d1:Diagram {type: 'table'})"));
    try {
      assert.equal(el.querySelectorAll('.thoughtknot-table tr[data-key]').length, 51, 'its way in is the table');
      assert.equal(el.querySelector('.thoughtknot-way-in'), null);
    } finally {
      env.uninstall();
    }
  });
});

describe('a view’s card', () => {
  const VIEW = "// graph: org · QUERY view top\nMATCH (n {id: 'ada'})-[]-{1,1}(m) RETURN n, m";

  // proves: type_remembered
  test('chooses the type for its view alone', async () => {
    const note = noteOf(ORG, VIEW);
    const { env, el } = await card(note, 1);
    try {
      labelled(el, 'Diagram type').click();
      el.querySelectorAll('.thoughtknot-type-list button')
        .find((b) => b.textContent === 'Radial')
        .click();
      await until(() => /:Diagram /.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /\(diagram_1:Diagram \{type: 'radial', view: 'top'\}\)/);
    } finally {
      env.uninstall();
    }
  });
});

describe('in reading view', () => {
  // proves: type_one_way_to_work
  test('the card says how the graph is drawn, and offers nothing that writes', async () => {
    const note = noteOf(
      `${ORG},\n(cy)-[:MANAGES]->(dee)`,
      styled("(d1:Diagram {type: 'tree', relationship: 'MANAGES'})"),
    );
    const env = await load({ files: { [PATH]: note } });
    try {
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const inner = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
      const el = inner.createDiv({ cls: 'block-language-gql' });
      const fences = note.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      const source = note
        .split('\n')
        .slice(fences[0] + 1, note.split('\n').indexOf('```', fences[0] + 1))
        .join('\n');
      await env.state.processors.get('gql')(source, el, fakeContext(note, fences[0]));
      await until(() => !!el.querySelector('svg'));
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
      assert.match(el.querySelector('.thoughtknot-type-stopped').textContent, /no longer fits a tree/);
      assert.equal(labelled(el, 'Diagram type'), undefined);
      assert.equal(labelled(el, 'Use flow'), undefined);
    } finally {
      env.uninstall();
    }
  });
});
