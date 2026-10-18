// The changes view (editor spec §41, changes_view): two versions of a note's graph drawn as one. Each thing and link
// added, removed or changed is marked on the drawing by its line as well as its hue, in both themes. Each is listed as
// text too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { CHANGE_LOOKS, NO_CHANGES, changesText, changesView, markedChanges } from '../src/changes-view.ts';
import { chosen, directions } from '../src/render.ts';
import { PALETTES } from '../src/palette.ts';
import { hueColour } from '../src/theme.ts';

const engine = await loadEngine();
const fence = (body) => '# Reading\n\n```gql\n' + body + '\n```\n';

const BEFORE = fence(`// graph: reader · SOURCE
(question:Question {title: 'Which reader?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(tablet:Option {name: 'Tablet'}),
(alice:Person {name: 'Alice'}),
(large_reader)-[:ANSWERS {weight: 1}]->(question),
(tablet)-[:ANSWERS]->(question),
(alice)-[:ASKS]->(question)`);

const AFTER = fence(`// graph: reader · SOURCE
(question:Question {title: 'Which reader?'}),
(large_reader:Option {name: 'Large reader', price: 4}),
(tablet:Option {name: 'Tablet'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS {weight: 2}]->(question),
(tablet)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)`);

const markOf = (shown, key) => shown.marks.boxes.get(key)?.kind;
const group = (svg, id) => new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>`).exec(svg)?.[0] ?? '';

describe('the changes view', () => {
  // proves: changes_view
  test('draws both versions as one: what the newer adds and what the older held that it has not', () => {
    const shown = changesView(BEFORE, AFTER, 'reader');
    const d = shown.reading.graphs.get('reader');
    assert.deepEqual(
      d.boxes.map((b) => b.key),
      ['question', 'large_reader', 'tablet', 'small_reader', 'alice'],
    );
    assert.deepEqual(
      d.links.map((l) => `${l.from} ${l.type} ${l.to}`),
      [
        'large_reader ANSWERS question',
        'tablet ANSWERS question',
        'small_reader ANSWERS question',
        'alice ASKS question',
      ],
    );
  });

  // proves: changes_view
  test('marks every thing and link added, removed or changed, and nothing that stayed the same', () => {
    const shown = changesView(BEFORE, AFTER, 'reader');
    assert.equal(markOf(shown, 'small_reader'), 'add');
    assert.equal(markOf(shown, 'alice'), 'remove');
    assert.equal(markOf(shown, 'large_reader'), 'change');
    assert.equal(markOf(shown, 'question'), undefined);
    assert.equal(markOf(shown, 'tablet'), undefined);
    assert.deepEqual(
      [...shown.marks.links].map(([n, m]) => [n, m.kind]),
      [
        [0, 'change'],
        [2, 'add'],
        [3, 'remove'],
      ],
    );
  });

  // proves: changes_view
  test('lists the same changes as text, each change of a property on its own line', () => {
    const shown = changesView(BEFORE, AFTER, 'reader');
    assert.equal(
      changesText(shown),
      [
        'Changed: Large reader (Option)',
        '  price: 3 → 4',
        'Added: Small reader (Option)',
        'Removed: Alice (Person)',
        'Changed: Large reader answers Which reader?',
        '  weight: 1 → 2',
        'Added: Small reader answers Which reader?',
        'Removed: Alice asks Which reader?',
      ].join('\n'),
    );
    // each listed change names the mark it put on the drawing
    for (const c of shown.changes) {
      const [on, at] = c.id.split(':');
      const mark = on === 'thing' ? shown.marks.boxes.get(at) : shown.marks.links.get(Number(at));
      assert.equal(mark?.kind, c.mark, c.id);
    }
  });

  // proves: changes_view
  test('a change of kind is a change, said with both kinds', () => {
    const shown = changesView(
      fence("// graph: g\n(a:Option {name: 'A'})"),
      fence("// graph: g\n(a:Choice {name: 'A'})"),
      'g',
    );
    assert.deepEqual(
      shown.changes.map((c) => [c.said, c.details]),
      [['Changed: A (Choice)', ['kind: Option → Choice']]],
    );
  });

  // proves: changes_view
  test('two versions the same show no marks and say so', () => {
    const shown = changesView(AFTER, AFTER, 'reader');
    assert.equal(shown.marks.boxes.size + shown.marks.links.size, 0);
    assert.equal(changesText(shown), NO_CHANGES);
  });

  // proves: changes_view
  test('a graph only one version holds is all added or all removed', () => {
    const none = fence('// graph: other\n(x:Thing)');
    assert.ok(changesView(none, AFTER, 'reader').changes.every((c) => c.mark === 'add'));
    const gone = changesView(BEFORE, none, 'reader');
    assert.ok(gone.changes.length > 0 && gone.changes.every((c) => c.mark === 'remove'));
    assert.equal(gone.reading.graphs.get('reader').boxes.length, 4);
    assert.equal(changesView(none, none, 'reader').reading.graphs.has('reader'), false);
  });

  // proves: changes_view
  test('marks the drawing by line as well as hue, in the light and the dark theme alike', () => {
    const shown = changesView(BEFORE, AFTER, 'reader');
    const laid = directions(shown.reading.graphs.get('reader'));
    const drawnIn = (p) =>
      chosen(
        laid,
        laid.map((d) => engine.render(d.dot)),
        p,
      ).svg;
    const boxes = shown.reading.graphs.get('reader').boxes.map((b) => b.key);
    const nodeOf = (key) => `node${boxes.indexOf(key) + 1}`;
    for (const theme of ['light', 'dark']) {
      const p = PALETTES[theme];
      const svg = markedChanges(drawnIn(p), shown, p);
      const added = group(svg, nodeOf('small_reader'));
      const changed = group(svg, nodeOf('large_reader'));
      const removed = group(svg, nodeOf('alice'));
      // the line tells them apart without colour: heavy, dashed, dotted
      assert.match(added, /stroke-width:3/, theme);
      assert.match(changed, /stroke-dasharray:6 4/, theme);
      assert.match(removed, /stroke-dasharray:2 3/, theme);
      assert.match(removed, /font-style:italic/, theme);
      // and each in its own hue, in the theme's own fixed colours
      for (const [g, kind] of [
        [added, 'add'],
        [changed, 'change'],
        [removed, 'remove'],
      ])
        assert.ok(g.includes(`stroke:${hueColour(CHANGE_LOOKS[kind].hue, 'line', p)}`), `${theme} ${kind}`);
      assert.doesNotMatch(group(svg, nodeOf('tablet')), /stroke-dasharray|stroke-width:3/, theme);
      assert.match(group(svg, 'edge3'), /stroke-width:3/, theme);
      assert.match(group(svg, 'edge4'), /stroke-dasharray:2 3/, theme);
      assert.doesNotMatch(svg, /var\(--|color-mix\(/, theme);
    }
    assert.notEqual(
      markedChanges(drawnIn(PALETTES.light), shown, PALETTES.light),
      markedChanges(drawnIn(PALETTES.dark), shown, PALETTES.dark),
    );
  });
});
