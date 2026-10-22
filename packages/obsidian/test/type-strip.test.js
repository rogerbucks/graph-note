// Diagram types on a drawing's card (editor spec §15).
// - Diagram type lists the seven types. Each that fits can be chosen. Each that does not says why.
// - The suggested one says so, and nothing is drawn as it until chosen.
// - Choosing writes the type into the style graph, for the graph or the view the card shows.
// - A chosen type that has stopped fitting is said, with the nearest that fits offered. The graph is drawn as a network
//   meanwhile.
// - A graph of more than 1,000 things offers the table or a view as the way in.
// Reading view says how the graph is drawn, and draws it as another type to look at, never saved. Where the note is
// edited, a type looked at can be kept.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { fakeContext } from './host/fake-obsidian.js';
import { installWorkers } from './host/workers.js';

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
        ['Timeline', true, ''],
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
      await settled();
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
        '',
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
      await settled();
      assert.equal(env.state.files.get(PATH).match(/:Diagram /g).length, 1, 'the choice changed in place');
    } finally {
      env.uninstall();
    }
  });
});

describe('a graph of more than 1,000 things', () => {
  const graphOf = (n) =>
    `// graph: big\n${Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`).join(',\n')}`;
  const big = graphOf(1001);
  /** The card, laid out in a worker as Obsidian lays it out: the page's own thread draws at most 300 things. */
  const bigCard = async (note) => {
    const workers = installWorkers();
    const { env, el } = await card(note);
    await until(() => el.querySelector('svg, .thoughtknot-table, .thoughtknot-banner'), 60_000);
    const done = () => {
      env.plugin.onunload();
      workers.uninstall();
      env.uninstall();
    };
    return { env, el, done };
  };

  // proves: large_way_in
  test('one of 1,000 things is drawn with no way in', async () => {
    const { el, done } = await bigCard(noteOf(graphOf(1000)));
    try {
      assert.ok(el.querySelector('svg'), 'it is drawn');
      assert.equal(el.querySelector('.thoughtknot-way-in'), null);
    } finally {
      done();
    }
  });

  // proves: large_way_in
  test('offers the table or a view as the way in, and Show as table writes the table', async () => {
    const { env, el, done } = await bigCard(noteOf(big));
    try {
      const way = el.querySelector('.thoughtknot-way-in');
      assert.match(
        way.textContent,
        /1,001 things, too many to read in one drawing: open it as a table, or make a view/,
      );
      labelled(el, 'Show as table').click();
      await until(() => /type: 'table'/.test(env.state.files.get(PATH)));
      await settled();
    } finally {
      done();
    }
  });

  // proves: large_way_in
  test('drawn as a table, offers no way in again', async () => {
    const { env, el } = await card(noteOf(big, "// graph: big_style · STYLE big\n(d1:Diagram {type: 'table'})"));
    try {
      assert.equal(el.querySelectorAll('.thoughtknot-table tr[data-key]').length, 1001, 'its way in is the table');
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
      await settled();
      assert.match(env.state.files.get(PATH), /\(diagram_1:Diagram \{type: 'radial', view: 'top'\}\)/);
    } finally {
      env.uninstall();
    }
  });
});

/** Shows block `n` of `note` as reading view does, read-only, in a card that is drawn again as renderShown draws it. */
async function readCard(env, note, n = 0) {
  const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
  const inner = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
  const el = inner.createDiv({ cls: 'block-language-gql' });
  const lines = note.split('\n'),
    fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const source = lines.slice(fences[n] + 1, lines.indexOf('```', fences[n] + 1)).join('\n');
  await env.state.processors.get('gql')(source, el, fakeContext(note, fences[n]));
  await until(() => !!el.querySelector('svg, .thoughtknot-table'));
  return el;
}
/** Taps type `name` in the Diagram type list of the card in `el`. */
const pick = (el, name) => {
  labelled(el, 'Diagram type').click();
  el.querySelectorAll('.thoughtknot-type-list button')
    .find((b) => b.textContent === name)
    .click();
};

describe('in reading view', () => {
  // proves: type_one_way_to_work, type_try_reading
  test('the card says how the graph is drawn, offers the types to look at, and writes nothing', async () => {
    const note = noteOf(
      `${ORG},\n(cy)-[:MANAGES]->(dee)`,
      styled("(d1:Diagram {type: 'tree', relationship: 'MANAGES'})"),
    );
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
      assert.match(el.querySelector('.thoughtknot-type-stopped').textContent, /no longer fits a tree/);
      assert.ok(labelled(el, 'Diagram type'), 'the types are offered, to look at');
      labelled(el, 'Use flow').click();
      await until(() => /Drawn as a flow/.test(el.querySelector('.thoughtknot-type-drawn')?.textContent ?? ''));
      assert.equal(env.state.files.get(PATH), note, 'the note unchanged');
    } finally {
      env.uninstall();
    }
  });

  // proves: type_try_reading
  test('a type chosen is drawn at once, said not saved, and Back to saved draws the saved type again', async () => {
    const note = noteOf(ORG);
    const env = await load({ files: { [PATH]: note } });
    const asked = [];
    const layout = env.plugin.layout.bind(env.plugin);
    env.plugin.layout = (drawing, owner) => {
      asked.push(drawing);
      return layout(drawing, owner);
    };
    try {
      const el = await readCard(env, note);
      assert.equal(el.querySelector('.thoughtknot-type-tried'), null, 'nothing tried yet');
      pick(el, 'Tree');
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      assert.deepEqual(asked.at(-1).diagram, { type: 'tree', tree: [0, 1, 2] }, 'laid out as a tree');
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a tree/);
      const said = el.querySelector('.thoughtknot-type-tried');
      assert.equal(said.getAttribute('role'), 'status');
      assert.match(said.textContent, /Just looking: not saved/);
      assert.equal(labelled(el, 'Keep it'), undefined, 'nothing to keep in reading view');
      assert.equal(env.state.files.get(PATH), note, 'the note unchanged');
      labelled(el, 'Back to saved').click();
      await until(() => !el.querySelector('.thoughtknot-type-tried') && !!el.querySelector('svg'));
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
      assert.equal(asked.at(-1).diagram, undefined);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_try_reading
  test('choosing the saved type again goes back to it, with nothing said', async () => {
    const note = noteOf(ORG);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      pick(el, 'Flow');
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      pick(el, 'Network');
      await until(() => !el.querySelector('.thoughtknot-type-tried') && !!el.querySelector('svg'));
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a network/);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_try_reading
  test('the type looked at shows where the note is edited too, with Keep it, which writes it', async () => {
    const note = noteOf(ORG);
    const env = await load({ files: { [PATH]: note } });
    try {
      pick(await readCard(env, note), 'Tree');
      const { el } = await show(env, note, 0);
      await until(() => !!el.querySelector('.thoughtknot-type-tried'));
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a tree/);
      labelled(el, 'Keep it').click();
      await until(() => /:Diagram /.test(env.state.files.get(PATH)));
      await settled();
      assert.match(
        env.state.files.get(PATH),
        /STYLE org[\s\S]*\(diagram_1:Diagram \{type: 'tree', relationship: 'MANAGES'\}\)/,
      );
      const again = await show(env, env.state.files.get(PATH), 0);
      assert.equal(again.el.querySelector('.thoughtknot-type-tried'), null, 'kept: nothing left only looked at');
    } finally {
      env.uninstall();
    }
  });
});

describe('changing the type keeps the place', () => {
  /** Opens the details of the thing `key` in the card in `el`, as a tap by keyboard does. */
  const select = (el, key) =>
    el
      .querySelectorAll('g.node')
      .find((n) => n.getAttribute('data-key') === key)
      .dispatch('keydown', { key: 'Enter' });
  /** The thing selected in `el`, by its key, or null. */
  const selected = (el) => el.querySelector('g.node.is-selected')?.getAttribute('data-key') ?? null;
  /** How far the drawing in `el` is zoomed: its width shown over its width laid out. */
  const scaleOf = (el) => {
    const svg = el.querySelector('svg.thoughtknot-svg');
    return Number(svg.getAttribute('width')) / parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
  };

  // proves: type_keeps_place
  test('in reading view: the thing selected stays selected, its details open, and the zoom kept', async () => {
    const note = noteOf(ORG);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      labelled(el, 'Zoom in').click();
      labelled(el, 'Zoom in').click();
      const zoomed = scaleOf(el);
      select(el, 'bea');
      assert.equal(selected(el), 'bea');
      pick(el, 'Tree');
      await until(() => !!el.querySelector('.thoughtknot-type-tried') && selected(el) === 'bea');
      assert.equal(el.querySelector('.thoughtknot-details').hidden, false, 'its details still open');
      assert.ok(Math.abs(scaleOf(el) - zoomed) < 0.01, `zoom kept: ${scaleOf(el)} against ${zoomed}`);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_keeps_place
  test('in full screen: the card stays full screen, with the thing selected', async () => {
    const note = noteOf(ORG);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      labelled(el, 'Full screen').click();
      let full = env.doc.body.querySelector('.thoughtknot-fullscreen');
      select(full, 'cy');
      pick(full, 'Tree');
      await until(() => {
        full = env.doc.body.querySelector('.thoughtknot-fullscreen');
        return !!full?.querySelector('.thoughtknot-type-tried') && selected(full) === 'cy';
      });
      assert.equal(env.doc.body.querySelectorAll('.thoughtknot-fullscreen').length, 1, 'one full screen, not two');
      assert.match(full.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a tree/);
    } finally {
      env.uninstall();
    }
  });

  // proves: type_keeps_place
  test('where the note is edited: the type saved, the card drawn again keeps the thing selected', async () => {
    const note = noteOf(ORG);
    const { env, el } = await card(note);
    try {
      select(el, 'dee');
      pick(el, 'Flow');
      await until(() => /:Diagram /.test(env.state.files.get(PATH)));
      await settled();
      const again = await show(env, env.state.files.get(PATH), 0);
      await until(() => selected(again.el) === 'dee');
      assert.match(again.el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as a flow/);
    } finally {
      env.uninstall();
    }
  });
});
