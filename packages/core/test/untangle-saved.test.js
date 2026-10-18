// The legend's choices saved with a view (editor spec §25, untangle_legend; §7, view_saved_as_shown). What the legend
// brings forward and hides is written to the style graph, beside the view's zoom and place. That happens when the user
// saves the view as shown, and never otherwise. Read back, the view's legend stands as it was saved. A legend written
// by hand is checked as every style is: each fault a problem on its line with its fix, the rest kept.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { edgesOf } from '../src/focus.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { LegendFilter, Untangle } from '../src/untangle.ts';

const fence = (b) => '```gql\n' + b + '\n```';
const DATA = [
  '// graph: trip',
  "(home:Place {name: 'Home'}),",
  "(park:Place {name: 'Park'}),",
  "(ann:Person {name: 'Ann'}),",
  '(home)-[:NEAR]->(park),',
  '(ann)-[:LIVES_AT]->(home)',
].join('\n');
const VIEW = "// graph: trip · QUERY view both\nMATCH (n) WHERE n.id IN ['home', 'park', 'ann'] RETURN n";
const NOTE = `# Trip\n\n${fence(DATA)}\n\n${fence(VIEW)}\n`;
const texts = (note) => gqlBlocks(note).map((b) => b.text);
const read = (note) => {
  const t = texts(note),
    reading = readNote(t);
  return { reading, ...readStyle(t, 'trip', reading) };
};
const drawing = () => readNote(texts(NOTE)).graphs.get('trip');
const sets = ({ forward, hidden }) => ({
  forward: forward && { things: [...forward.things].sort(), edges: [...forward.edges].sort() },
  hidden: { things: [...hidden.things].sort(), edges: [...hidden.edges].sort() },
});
/** A legend with Person brought forward and NEAR hidden, chosen as the user chooses: once, and twice. */
const chosen = () => {
  const f = new LegendFilter();
  f.choose('type:NEAR');
  f.choose('type:NEAR');
  f.choose('kind:Person');
  return f;
};
const saved = (note, legend) => styleEdit(note, 'trip', { shown: { view: 'both', zoom: 1, x: 0, y: 0, legend } });

describe('the legend’s choices saved with the view', () => {
  // proves: untangle_legend
  test('are what the legend brings forward and hides, kinds first and then types, each by name', () => {
    assert.deepEqual(chosen().choices(), [
      { id: 'kind:Person', state: 'forward' },
      { id: 'type:NEAR', state: 'hidden' },
    ]);
    const f = chosen();
    f.choose('kind:Person');
    f.choose('kind:Person'); // round again: as it is, so not a choice
    assert.deepEqual(f.choices(), [{ id: 'type:NEAR', state: 'hidden' }]);
    assert.deepEqual(new LegendFilter().choices(), [], 'none chosen, none to save');
  });

  // proves: untangle_legend
  test('are written to the style graph, beside the view saved as shown, when the user saves it; the data untouched', () => {
    const r = saved(NOTE, chosen().choices());
    assert.ok('note' in r, r.refused);
    assert.match(r.note, /\(shown_1:Shown \{view: 'both', .*legend: 'kind:Person forward, type:NEAR hidden'\}\)/);
    const after = texts(r.note);
    assert.ok(after.includes(DATA), 'the data block is untouched');
    assert.ok(after.includes(VIEW), 'the view block is untouched');
    const { style, problems } = read(r.note);
    assert.deepEqual(problems, []);
    assert.deepEqual(style.shown.get('both').legend, chosen().choices());
  });

  // proves: untangle_legend
  test('reopened, the view’s legend stands as it was saved: the same brought forward, the same hidden', () => {
    const { style } = read(saved(NOTE, chosen().choices()).note);
    const d = drawing(),
      again = new LegendFilter();
    again.restore(style.shown.get('both').legend);
    assert.equal(again.state('kind:Person'), 'forward');
    assert.equal(again.state('type:NEAR'), 'hidden');
    assert.deepEqual(sets(again.apply(d, edgesOf(d))), sets(chosen().apply(d, edgesOf(d))));
    const u = new Untangle(d, style.shown.get('both').legend);
    assert.deepEqual(u.legend.choices(), chosen().choices(), 'an untangling started from a saved view');
  });

  // proves: untangle_legend
  test('never otherwise: saved again with nothing chosen, the legend goes; no other style change writes one', () => {
    const first = saved(NOTE, chosen().choices()).note;
    assert.match(first, /legend: /);
    const again = saved(first, []).note;
    assert.doesNotMatch(again, /legend/, 'saved as shown with the legend clear: nothing of it kept');
    assert.equal((again.match(/:Shown/g) ?? []).length, 1, 'changed in place');
    for (const change of [
      { shown: { view: 'both', zoom: 1, x: 0, y: 0 } },
      { outside: { view: 'both', outside: 'hide' } },
      { diagram: { type: 'network', view: 'both' } },
      { arrows: { arrowheads: 'hide', view: 'both' } },
    ]) {
      const r = styleEdit(NOTE, 'trip', change);
      assert.ok('note' in r, r.refused);
      assert.doesNotMatch(r.note, /legend/, JSON.stringify(change));
    }
    assert.equal(read(saved(NOTE, []).note).style.shown.get('both').legend, undefined);
  });

  // proves: untangle_legend
  test('a choice that is no legend’s is refused before anything is written', () => {
    for (const legend of [
      [{ id: 'colour:red', state: 'forward' }],
      [{ id: 'kind:Place', state: 'faded' }],
      [{ id: 'kind:', state: 'hidden' }],
      [{ id: 'kind:Two words', state: 'hidden' }],
      [
        { id: 'kind:Place', state: 'hidden' },
        { id: 'kind:Place', state: 'forward' },
      ],
    ]) {
      const r = saved(NOTE, legend);
      assert.ok('refused' in r, JSON.stringify(legend));
      assert.match(r.refused, /legend/);
    }
  });
});

describe('a legend written by hand', () => {
  const style = (shown) => `${NOTE}\n${fence(`// graph: trip_style · STYLE trip\n${shown}`)}\n`;
  const problems = (legend) =>
    read(style(`(s1:Shown {view: 'both', legend: ${legend}})`)).problems.map((p) => [p.line, p.message, p.fix]);
  const kept = (legend) => read(style(`(s1:Shown {view: 'both', legend: ${legend}})`)).style.shown.get('both').legend;

  // proves: untangle_legend
  test('is read with spaces anywhere around its commas, and an empty one chooses nothing', () => {
    assert.deepEqual(problems("'  kind:Place   hidden ,type:NEAR forward  '"), []);
    assert.deepEqual(kept("'  kind:Place   hidden ,type:NEAR forward  '"), [
      { id: 'kind:Place', state: 'hidden' },
      { id: 'type:NEAR', state: 'forward' },
    ]);
    assert.deepEqual([problems("''"), kept("''")], [[], []]);
  });

  // proves: untangle_legend
  test('each fault is a problem on the Shown’s line with its fix, and only the choices that are sound are kept', () => {
    const legend =
      "'kind:Plase forward, type:NEAR foward, colour:red hidden, kind:Place hidden, kind:Place forward, , type:FLIES hidden'";
    assert.deepEqual(problems(legend), [
      [2, 'Plase is not a kind in graph trip', 'change Plase to Place'],
      [2, "foward is not a legend choice's state: forward or hidden", 'change foward to forward'],
      [
        2,
        'colour:red hidden is not a legend choice: write kind:<Kind> or type:<TYPE>, then forward or hidden',
        'write it as kind:<Kind> forward or type:<TYPE> hidden, or remove it',
      ],
      [2, 'kind:Place is chosen twice in the legend', 'keep one of them'],
      [2, 'the legend has an empty choice between its commas', 'remove the extra comma'],
      [2, 'FLIES is not a relationship type in graph trip', 'write a relationship type in graph trip, or remove it'],
    ]);
    assert.deepEqual(kept(legend), [{ id: 'kind:Place', state: 'hidden' }]);
  });

  // proves: untangle_legend
  test('a legend that is not text is a problem, and the rest of the view saved as shown is kept', () => {
    assert.deepEqual(problems('3'), [[2, 'legend must be text', 'write legend in quotes']]);
    const shown = read(style("(s1:Shown {view: 'both', zoom: 2, legend: 3})")).style.shown.get('both');
    assert.deepEqual([shown.zoom, shown.legend], [2, undefined]);
  });
});
