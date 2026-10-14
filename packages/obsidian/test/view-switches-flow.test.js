// The View menu's folds with links that move and paths that play (editor spec §25 with §7): a graph laid out again by a
// switch keeps its moving links marked and stops a path playing (view_switch_view_only); a link merged into a trunk moves
// along both its lines, and a dot playing a path runs both (untangle_merge, links_show_flow, path_autoplay); and a link
// folded into a busy hub's stub is no moving link of the drawing, so the legend leaves it out (untangle_hubs).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const noteOf = (...blocks) => ['# Town', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
/** Two groups of places, two links running from one to the other, and a walk along one of them. */
const TOWN = `// graph: town
(home:Place {name: 'Home'}),
(inn:Place {name: 'Inn'}),
(park:Place {name: 'Park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(inn)-[:NEAR]->(cafe),
(tour:Path {title: 'Evening walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park)`;
const GROUPS = (...more) =>
  [
    '// graph: town_style · STYLE town',
    "(n1:Nudge {word: 'group', thing: 'home', group: 'North'}),",
    "(n2:Nudge {word: 'group', thing: 'inn', group: 'North'}),",
    "(n3:Nudge {word: 'group', thing: 'park', group: 'South'}),",
    `(n4:Nudge {word: 'group', thing: 'cafe', group: 'South'})${more.length ? ',' : ''}`,
    ...more,
  ].join('\n');
/** A box with thirteen tools, its links moving. */
const KIT = [
  '// graph: kit',
  "(box:Box {name: 'Toolbox'}), (ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}),",
  ...Array.from({ length: 13 }, (_, i) => `(t${i}:Tool {name: 'Tool ${i}'}),`),
  ...Array.from({ length: 13 }, (_, i) => `(box)-[:HOLDS]->(t${i}),`),
  '(ann)-[:ASKS]->(bob)',
].join('\n');
const KIT_FLOW = `// graph: kit_style · STYLE kit
(f1:Flow {motion: 'dashes', type: 'HOLDS', means: 'kept in the box'})`;

const edge = (el, id) => el.querySelectorAll('g.edge').find((g) => g.getAttribute('id') === id);
const turn = (el, name) =>
  el.querySelectorAll('.graph-note-view-menu button').find((b) => b.textContent.startsWith(name));
const legend = (el) => el.querySelector('.graph-note-flow-legend');

async function card(note) {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note);
  return { env, el };
}

describe('a graph laid out again by a switch', () => {
  test('keeps its moving links moving, both lines of a merged one, a dot on each', async () => {
    const note = noteOf(TOWN, GROUPS("(f1:Flow {motion: 'dot', type: 'NEAR', means: 'people walk this way'})"));
    const { env, el } = await card(note);
    try {
      assert.ok(edge(el, 'edge1').classList.contains('graph-note-flow-dot'));
      turn(el, 'Parallel links merged').click();
      await until(() => !!edge(el, 'trunk_1'));
      for (const id of ['edge1', 'edge1_tail', 'edge2', 'edge2_tail']) {
        assert.ok(edge(el, id).classList.contains('graph-note-flow-dot'), id);
        assert.equal(edge(el, id).querySelectorAll('.graph-note-flow-runner').length, 1, `${id} has its dot`);
      }
      assert.match(edge(el, 'edge1_tail').getAttribute('aria-label'), /people walk this way/);
    } finally {
      env.uninstall();
    }
  });

  test('stops a path playing, so no step is left marked on the new drawing', async () => {
    const { env, el } = await card(noteOf(TOWN, GROUPS()));
    try {
      labelled(el, 'Play Evening walk').click();
      assert.ok(labelled(el, 'Pause'), 'playing');
      turn(el, 'Parallel links merged').click();
      await until(() => !!edge(el, 'trunk_1'));
      assert.ok(!labelled(el, 'Pause'), 'stopped');
      assert.ok(labelled(el, 'Play Evening walk'), 'Play is offered again');
      assert.equal(el.querySelectorAll('.graph-note-step-current').length, 0);
    } finally {
      env.uninstall();
    }
  });
});

describe('a path played along a link merged into a trunk', () => {
  test('runs its dot along both of the link’s lines', async () => {
    const env = await load({ files: { [PATH]: noteOf(TOWN, GROUPS("(r1:Links {merge: 'on'})")) } });
    // the steps' waits kept, to be run by hand; any other wait runs as ever
    const win = env.doc.defaultView,
      [set, clear] = [win.setTimeout, win.clearTimeout],
      waiting = [];
    win.setTimeout = (run, ms) => (ms === 2000 ? `step ${waiting.push(run)}` : set(run, ms));
    win.clearTimeout = (handle) => (String(handle).startsWith('step') ? undefined : clear(handle));
    try {
      const { el } = await show(env, env.state.files.get(PATH));
      assert.ok(edge(el, 'trunk_1'), 'merged as the style graph says');
      labelled(el, 'Play Evening walk').click();
      waiting.shift()();
      for (const id of ['edge1', 'edge1_tail'])
        assert.equal(edge(el, id).querySelectorAll('.graph-note-path-runner').length, 1, id);
      assert.equal(edge(el, 'edge2').querySelectorAll('.graph-note-path-runner').length, 0);
    } finally {
      env.uninstall();
    }
  });
});

describe('the legend of moving links', () => {
  test('leaves out the links folded into a stub, and says them again once they are drawn', async () => {
    const { env, el } = await card(noteOf(KIT, KIT_FLOW));
    try {
      assert.ok(el.querySelector('#fold_hub_1'), 'the box’s links folded');
      assert.equal(legend(el), null, 'no moving link is drawn, so nothing to say');
      turn(el, 'Busy hubs folded').click();
      await until(() => !!legend(el));
      assert.match(legend(el).textContent, /kept in the box/);
      turn(el, 'Busy hubs folded').click();
      await until(() => !legend(el));
    } finally {
      env.uninstall();
    }
  });
});
