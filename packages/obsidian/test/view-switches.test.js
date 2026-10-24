// The View menu on a graph's bar (editor spec §25, slice 3). It has labels by zoom, busy hubs folded, groups folded and
// parallel links merged.
// - Each is switched on and off there (view_switches).
// - Each starts as the plugin's settings hold it (view_switch_defaults).
// - Each, when turned, redraws the graph at once, keeping the selection and the focus. It is saved with the graph only
//   when the user saves the view (view_switch_view_only).
// The built plugin, loaded against the stand-ins for the page, laying out with the real engine.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show, styles } from './host/view-notes.js';
import { showIn } from './host/card-notes.js';
import { open } from './host/pane-notes.js';
import { rules, winner } from './host/cascade.js';

before(() => build());

const PATH = 'Some note.md';
const TOOLS = [
  'Hammer',
  'Saw',
  'Drill',
  'Level',
  'Tape',
  'Chisel',
  'Plane',
  'File',
  'Clamp',
  'Square',
  'Knife',
  'Pliers',
  'Wrench',
];
/** A toolbox holding 13 tools, one link more than a busy hub needs, and four people in two groups. */
const KIT = [
  '// graph: kit',
  "(box:Box {name: 'Toolbox'}),",
  ...TOOLS.map((t, i) => `(t${i + 1}:Tool {name: '${t}'}),`),
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}), (dee:Person {name: 'Dee'}),",
  ...TOOLS.map((_, i) => `(box)-[:HOLDS]->(t${i + 1}),`),
  '(ann)-[:ASKS]->(cy), (bob)-[:ASKS]->(dee), (ann)-[:USES]->(box)',
].join('\n');
// the links, in order: 0–12 the box holds each tool, 13 Ann asks Cy, 14 Bob asks Dee, 15 Ann uses the box
const GROUPS = `// graph: kit_style · STYLE kit
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})`;
const VIEW = '// graph: kit · QUERY view people\nMATCH (n:Person) RETURN n';
const noteOf = (...blocks) => ['# Kit', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const NOTE = noteOf(KIT, GROUPS);

const node = (el, id) => el.querySelectorAll('g.node').find((g) => g.getAttribute('id') === id);
const edge = (el, id) => el.querySelectorAll('g.edge').find((g) => g.getAttribute('id') === id);
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const switches = (el) =>
  el
    .querySelectorAll('.thoughtknot-view-menu button')
    .map((b) => [
      b.querySelector('.thoughtknot-switch-name')?.textContent ?? b.textContent.replace(/ — (on|off)$/, ''),
      b.getAttribute('role'),
      b.getAttribute('aria-checked'),
    ]);
const turn = (el, name) =>
  el.querySelectorAll('.thoughtknot-view-menu button').find((b) => b.textContent.startsWith(name));
const tap = (el, g) => {
  const vp = el.querySelector('.thoughtknot-viewport');
  const init = { target: g, pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const offers = (el, text) =>
  el.querySelectorAll('.thoughtknot-details button').find((b) => b.textContent.includes(text));

/** The settings with busy hubs folded, for the tests of folding them: every thing starts open by default. */
const FOLDED = { data: { settings: { foldHubs: 'on' } } };

async function card(note = NOTE, options = {}) {
  const env = await load({ files: { [PATH]: note }, ...options });
  const { el } = await show(env, note);
  return { env, el };
}

describe('the View menu', () => {
  test('a View button in the bar opens the four switches, each on or off as the settings hold them', async () => {
    const { env, el } = await card();
    try {
      const menu = el.querySelector('.thoughtknot-view-menu');
      assert.ok(menu.hidden, 'closed until asked');
      labelled(el, 'View').click();
      assert.ok(!menu.hidden);
      assert.equal(labelled(el, 'View').getAttribute('aria-expanded'), 'true');
      assert.deepEqual(switches(el), [
        ['Labels by zoom', 'switch', 'true'],
        ['Busy hubs folded', 'switch', 'false'],
        ['Groups folded', 'switch', 'false'],
        ['Parallel links merged', 'switch', 'false'],
      ]);
    } finally {
      env.uninstall();
    }
  });

  test('each switch is drawn as a toggle, its name its accessible name and on or off said in words beside it', async () => {
    const { env, el } = await card();
    try {
      labelled(el, 'View').click();
      const b = turn(el, 'Labels by zoom');
      assert.equal(b.querySelector('.thoughtknot-switch-name')?.textContent, 'Labels by zoom');
      assert.equal(
        b.querySelector('.thoughtknot-switch-track')?.getAttribute('aria-hidden'),
        'true',
        'the toggle is drawn',
      );
      const says = b.querySelector('.thoughtknot-switch-state');
      assert.equal(says.getAttribute('aria-hidden'), 'true', 'aria-checked says it to a screen reader');
      assert.equal(says.textContent, 'on');
    } finally {
      env.uninstall();
    }
  });

  test('the edit pane’s drawing has it too, its busy hub folded as the settings start it', async () => {
    const env = await open({ note: NOTE, line: 2, ...FOLDED });
    try {
      await until(() => !!env.el.querySelector('.thoughtknot-viewport svg'));
      assert.ok(labelled(env.el, 'View'));
      assert.ok(node(env.el, 'fold_hub_1'), 'the stub');
      turn(env.el, 'Busy hubs folded').click();
      await until(() => !node(env.el, 'fold_hub_1'));
    } finally {
      env.uninstall();
    }
  });

  test('every graph starts from the settings: changed there, a new card starts as they now say', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      await env.plugin.saveSettings({ ...env.plugin.settings, foldHubs: 'off', foldGroups: 'on', labelsByZoom: 'off' });
      const { el } = await show(env, NOTE);
      assert.deepEqual(
        switches(el).map(([name, , on]) => [name, on]),
        [
          ['Labels by zoom', 'false'],
          ['Busy hubs folded', 'false'],
          ['Groups folded', 'true'],
          ['Parallel links merged', 'false'],
        ],
      );
      assert.ok(!node(el, 'fold_hub_1'), 'no hub folded');
      assert.ok(node(el, 'fold_group_1') && node(el, 'fold_group_2'), 'each group folded into its box');
    } finally {
      env.uninstall();
    }
  });
});

describe('busy hubs folded', () => {
  test('a busy hub is drawn with its links folded into one stub marked with their count, a button to open them', async () => {
    const { env, el } = await card(NOTE, FOLDED);
    try {
      const stub = node(el, 'fold_hub_1');
      assert.ok(stub, 'the stub');
      assert.match(stub.textContent, /14 links/);
      assert.equal(stub.getAttribute('role'), 'button');
      assert.equal(stub.getAttribute('aria-label'), 'Toolbox: 14 links folded. Open them.');
      assert.ok(!thing(el, 't2'), 'a tool hung only from the box is folded with its link');
      assert.ok(thing(el, 'box') && thing(el, 'ann'));
    } finally {
      env.uninstall();
    }
  });

  test('tapping the stub opens them, and the hub’s details fold them again', async () => {
    const { env, el } = await card(NOTE, FOLDED);
    try {
      tap(el, node(el, 'fold_hub_1'));
      await until(() => !!thing(el, 't2'));
      assert.ok(!node(el, 'fold_hub_1'));
      assert.equal(thing(el, 't2').getAttribute('id'), 'node3', 'each thing under its own number');
      tap(el, thing(el, 'box'));
      offers(el, 'Fold its 14 links').click();
      await until(() => !!node(el, 'fold_hub_1'));
      assert.ok(!thing(el, 't2'));
      tap(el, thing(el, 'box'));
      offers(el, 'Open its 14 links').click();
      await until(() => !!thing(el, 't2'));
    } finally {
      env.uninstall();
    }
  });

  test('by default every link is drawn, and the hub’s details fold it alone, then open it again', async () => {
    const { env, el } = await card();
    try {
      assert.ok(!node(el, 'fold_hub_1') && thing(el, 't2'), 'nothing folded to start');
      tap(el, thing(el, 'box'));
      offers(el, 'Fold its 14 links').click();
      await until(() => !!node(el, 'fold_hub_1'));
      assert.ok(!thing(el, 't2'));
      assert.equal(turn(el, 'Busy hubs folded').getAttribute('aria-checked'), 'false', 'the switch stays off');
      tap(el, thing(el, 'box'));
      offers(el, 'Open its 14 links').click();
      await until(() => !!thing(el, 't2'));
    } finally {
      env.uninstall();
    }
  });

  test('switched off, every link is drawn; on again, the hub is folded', async () => {
    const { env, el } = await card(NOTE, FOLDED);
    try {
      turn(el, 'Busy hubs folded').click();
      await until(() => !node(el, 'fold_hub_1'));
      assert.equal(turn(el, 'Busy hubs folded').getAttribute('aria-checked'), 'false');
      assert.ok(thing(el, 't13') && edge(el, 'edge13'));
      turn(el, 'Busy hubs folded').click();
      await until(() => !!node(el, 'fold_hub_1'));
    } finally {
      env.uninstall();
    }
  });
});

describe('groups folded and links merged', () => {
  test('a group folds into one box showing its count, its links drawn to it; tapping the box opens it', async () => {
    const { env, el } = await card();
    try {
      turn(el, 'Groups folded').click();
      await until(() => !!node(el, 'fold_group_1'));
      assert.match(node(el, 'fold_group_1').textContent, /Makers.*2 things/);
      assert.equal(node(el, 'fold_group_1').getAttribute('aria-label'), 'Makers: 2 things folded. Open the group.');
      assert.ok(!thing(el, 'ann'));
      assert.equal(edge(el, 'edge14').getAttribute('data-link'), '13', 'Ann asks Cy, drawn box to box, still itself');
      tap(el, node(el, 'fold_group_1'));
      await until(() => !!thing(el, 'ann'));
      assert.ok(node(el, 'fold_group_2'), 'the other group stays folded');
    } finally {
      env.uninstall();
    }
  });

  test('Enter on a folded box opens it; a thing found inside a folded group opens it, and is selected', async () => {
    const { env, el } = await card();
    try {
      turn(el, 'Groups folded').click();
      await until(() => !!node(el, 'fold_group_2'));
      const vp = el.querySelector('.thoughtknot-viewport');
      vp.dispatch('keydown', { key: 'Enter', target: node(el, 'fold_group_1') });
      await until(() => !!thing(el, 'ann'));
      labelled(el, 'Find a thing').click();
      const input = el.querySelector('.thoughtknot-find input');
      input.value = 'Dee';
      input.dispatch('input');
      el.querySelectorAll('.thoughtknot-find-results button')[0].click();
      await until(() => !!thing(el, 'dee') && thing(el, 'dee').getAttribute('aria-pressed') === 'true');
      assert.ok(!node(el, 'fold_group_2'), 'the Helpers opened');
      assert.match(el.querySelector('.thoughtknot-details').textContent, /Dee/);
    } finally {
      env.uninstall();
    }
  });

  test('a thing selected, then folded into its group’s box: the box is selected, the thing’s details kept', async () => {
    const { env, el } = await card();
    try {
      tap(el, thing(el, 'ann'));
      turn(el, 'Groups folded').click();
      await until(() => !!node(el, 'fold_group_1'));
      assert.ok(!thing(el, 'ann'));
      assert.ok(node(el, 'fold_group_1').hasClass('is-selected'));
      assert.equal(node(el, 'fold_group_1').getAttribute('aria-pressed'), 'true');
      assert.ok(!node(el, 'fold_group_2').hasClass('is-selected'));
      assert.match(el.querySelector('.thoughtknot-details').textContent, /Ann/, 'Ann’s details still open');
    } finally {
      env.uninstall();
    }
  });

  test('Enter on a busy hub’s stub opens it and takes the keyboard to the hub', async () => {
    const { env, el } = await card(NOTE, FOLDED);
    try {
      const stub = node(el, 'fold_hub_1');
      stub.focus();
      el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'Enter', target: stub });
      await until(() => !!thing(el, 't2') && env.doc.activeElement === thing(el, 'box'));
    } finally {
      env.uninstall();
    }
  });

  test('a Links that merges, written after the graph was first drawn, starts it merged when drawn again', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const before = (await show(env, NOTE)).el;
      assert.equal(turn(before, 'Parallel links merged').getAttribute('aria-checked'), 'false');
      const merged = NOTE.replace("group: 'Helpers'})\n```", "group: 'Helpers'}),\n(r1:Links {merge: 'on'})\n```");
      assert.notEqual(merged, NOTE);
      env.state.files.set(PATH, merged);
      const after = (await show(env, merged)).el;
      assert.equal(turn(after, 'Parallel links merged').getAttribute('aria-checked'), 'true');
      assert.ok(edge(after, 'trunk_1'), 'drawn merged, as the style graph now says');
    } finally {
      env.uninstall();
    }
  });

  test('links between the same two groups share one trunk, each still tapped and read as itself', async () => {
    const { env, el } = await card();
    try {
      turn(el, 'Parallel links merged').click();
      await until(() => !!edge(el, 'trunk_1'));
      const tail = edge(el, 'edge14_tail');
      assert.equal(tail.getAttribute('data-link'), '13');
      assert.equal(tail.getAttribute('aria-label'), edge(el, 'edge14').getAttribute('aria-label'));
      assert.equal(edge(el, 'edge14').getAttribute('aria-label'), 'Link: Ann asks Cy');
      tap(el, tail);
      assert.match(el.querySelector('.thoughtknot-details').textContent, /Ann asks Cy/);
    } finally {
      env.uninstall();
    }
  });
});

describe('labels by zoom', () => {
  test('in a narrow note link labels are hidden until zoomed in far enough to read them; switched off, always shown', async () => {
    const { env, el } = await card(NOTE, { width: 150 });
    try {
      const svg = el.querySelector('svg');
      assert.ok(svg.hasClass('thoughtknot-labels-hidden'), 'too small to read');
      for (let i = 0; i < 12 && svg.hasClass('thoughtknot-labels-hidden'); i++) labelled(el, 'Zoom in').click();
      assert.ok(!svg.hasClass('thoughtknot-labels-hidden'), 'zoomed in, the labels read');
      labelled(el, 'Fit').click();
      assert.ok(svg.hasClass('thoughtknot-labels-hidden'));
      turn(el, 'Labels by zoom').click();
      assert.ok(!svg.hasClass('thoughtknot-labels-hidden'), 'at once, with no new layout');
      assert.equal(turn(el, 'Labels by zoom').getAttribute('aria-checked'), 'false');
    } finally {
      env.uninstall();
    }
  });

  test('a link in focus, highlighted or selected keeps its label when the rest are hidden, on the labels drawn', async () => {
    const { env, el } = await card(NOTE, { width: 150 });
    try {
      const all = rules(styles, 'styles.css'),
        svg = el.querySelector('svg');
      // each label as drawn: its own element, inside its link's group as marked now, inside the drawing as marked now
      const labelOf = (g) => ({
        tag: 'text',
        classes: [],
        ancestors: [
          { tag: 'g', classes: g.className.split(' ') },
          { tag: 'svg', classes: svg.className.split(' ') },
        ],
      });
      const painted = (g) => winner(all, labelOf(g), 'fill-opacity')?.value ?? '1';
      tap(el, thing(el, 'cy'));
      assert.ok(svg.hasClass('thoughtknot-labels-hidden'));
      const check = () => {
        const withLabels = el.querySelectorAll('g.edge').filter((g) => g.querySelector('text'));
        assert.ok(withLabels.length >= 2);
        for (const g of withLabels) {
          const shown = ['thoughtknot-kept', 'thoughtknot-hot', 'is-selected'].some((c) => g.hasClass(c));
          assert.equal(painted(g) !== '0', shown, `${g.getAttribute('id')}: ${g.className}`);
        }
      };
      check();
      assert.notEqual(painted(edge(el, 'edge14')), '0', 'Ann asks Cy: in focus');
      assert.equal(painted(edge(el, 'edge15')), '0', 'Bob asks Dee: neither in focus nor highlighted');
      edge(el, 'edge15').classList.add('thoughtknot-hot'); // under the pointer, as hover.ts marks it
      check();
      assert.notEqual(painted(edge(el, 'edge15')), '0', 'Bob asks Dee: highlighted');
      edge(el, 'edge15').classList.remove('thoughtknot-hot');
      turn(el, 'Labels by zoom').click();
      assert.notEqual(painted(edge(el, 'edge15')), '0', 'switched off, every label is painted');
    } finally {
      env.uninstall();
    }
  });
});

describe('a switch turned', () => {
  test('redraws at once, keeping the selection, the focus on the drawing and the keyboard’s place', async () => {
    const { env, el } = await card();
    try {
      tap(el, thing(el, 'ann'));
      const kept = () =>
        el
          .querySelectorAll('g.node')
          .filter((g) => g.hasClass('thoughtknot-kept'))
          .map((g) => g.getAttribute('data-key'))
          .sort();
      // the box is at the other end of a link of Ann's, folded into its stub
      assert.deepEqual(kept(), ['ann', 'box', 'cy']);
      labelled(el, 'View').click();
      // the keyboard on the first box, as Tab leaves it; the switch turned by a pointer, which leaves the focus there
      const first = el.querySelector('#node1');
      first.focus();
      assert.equal(env.doc.activeElement, first);
      turn(el, 'Parallel links merged').click();
      await until(() => !!edge(el, 'trunk_1'));
      assert.equal(thing(el, 'ann').getAttribute('aria-pressed'), 'true', 'still selected');
      assert.ok(thing(el, 'ann').hasClass('is-selected'));
      assert.deepEqual(kept(), ['ann', 'box', 'cy'], 'the focus kept');
      assert.ok(
        edge(el, 'edge14').hasClass('thoughtknot-kept') && edge(el, 'edge14_tail').hasClass('thoughtknot-kept'),
      );
      assert.ok(thing(el, 'bob').hasClass('thoughtknot-dim'));
      assert.match(el.querySelector('.thoughtknot-details').textContent, /Ann/, 'its details still open');
      // the drawing is new, and the keyboard is on the same box in it
      const now = el.querySelector('#node1');
      assert.notEqual(now, first, 'drawn afresh');
      assert.equal(env.doc.activeElement, now, 'the keyboard is on the first box, as it was');
    } finally {
      env.uninstall();
    }
  });

  test('changes only the drawing: nothing is written, in editing view or reading view', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...FOLDED });
    try {
      const live = await showIn(env, 'live', { note: NOTE });
      turn(live, 'Groups folded').click();
      await until(() => !!node(live, 'fold_group_1'));
      turn(live, 'Busy hubs folded').click();
      await until(() => !node(live, 'fold_hub_1'));
      // the graph's View menu is the same in reading view: drawn as it was left, and turned there too
      const reading = await showIn(env, 'reading', { note: NOTE });
      assert.ok(node(reading, 'fold_group_1') && !node(reading, 'fold_hub_1'));
      turn(reading, 'Groups folded').click();
      await until(() => !node(reading, 'fold_group_1'));
      turn(reading, 'Busy hubs folded').click();
      await until(() => !!node(reading, 'fold_hub_1'));
      assert.equal(env.state.files.get(PATH), NOTE);
      assert.deepEqual(env.state.writes ?? [], []);
    } finally {
      env.uninstall();
    }
  });

  test('is saved with a view only when the view is saved as shown, and the view opens so again', async () => {
    const note = noteOf(KIT, GROUPS, VIEW);
    const env = await load({ files: { [PATH]: note }, ...FOLDED });
    let saved;
    try {
      const { el } = await show(env, note, 2);
      turn(el, 'Groups folded').click();
      await until(() => !!node(el, 'fold_group_1'));
      turn(el, 'Labels by zoom').click();
      assert.equal(env.state.files.get(PATH), note, 'not saved by turning');
      labelled(el, 'Save as shown').click();
      await until(() => /:Shown/.test(env.state.files.get(PATH)));
      saved = env.state.files.get(PATH);
      assert.match(saved, /labels: 'off', hubs: 'on', groups: 'on', merge: 'off'/);
    } finally {
      env.uninstall();
    }
    // opened again, as when Obsidian starts again: the view starts as it was saved, not as the settings say
    const again = await load({ files: { [PATH]: saved } });
    try {
      const { el } = await show(again, saved, 2);
      assert.equal(turn(el, 'Groups folded').getAttribute('aria-checked'), 'true');
      assert.equal(turn(el, 'Labels by zoom').getAttribute('aria-checked'), 'false');
      assert.ok(node(el, 'fold_group_1'), 'drawn folded, as saved');
    } finally {
      again.uninstall();
    }
  });
});
