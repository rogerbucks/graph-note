// Writing a view (editor spec §7 views_by_tapping, §2 views_in_the_note). It covers the query for a view built by
// tapping, and the block it is stored as. Whatever is written is a query the profile reads back to the same view.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseView, VIEW_FORMS } from '../src/view-profile.ts';
import { viewBlock, viewQuery } from '../src/view-write.ts';

const LINE_SEPARATOR = String.fromCharCode(0x2028),
  PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const NASTY = [
  "it's",
  'back\\slash',
  'two\nlines',
  'tab\there',
  'é ü 日本',
  `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`,
  'nul' + String.fromCharCode(0) + 'l',
  '',
  ' spaced ',
];

describe('the query written for a view built by tapping', () => {
  // proves: views_by_tapping
  test('each kind is written in its form, as Grafeo is given it', () => {
    assert.equal(viewQuery('picked', { ids: ['a', 'b'] }), VIEW_FORMS.picked);
    assert.equal(viewQuery('near', { id: 'a', depth: 2 }), VIEW_FORMS.near);
    assert.equal(viewQuery('reaches', { from: 'a', to: 'b', steps: 6 }), VIEW_FORMS.reaches);
    assert.equal(viewQuery('kinds', { kinds: ['Person', 'Team'] }), VIEW_FORMS.kinds);
    assert.equal(viewQuery('path', { path: 'tour' }), VIEW_FORMS.path);
    assert.equal(
      viewQuery('reaches', { from: 'a', to: 'b', steps: 3, directed: false }),
      "MATCH p = (a {id: 'a'})-[]-{1,3}(b {id: 'b'}) RETURN p",
    );
  });

  // proves: views_by_tapping
  test('every view written is read back as the same view', () => {
    const specs = [
      { kind: 'picked', ids: [] },
      { kind: 'picked', ids: ['alice'] },
      { kind: 'picked', ids: NASTY },
      ...[1, 2, 3].map((depth) => ({ kind: 'near', id: "o'neil", depth })),
      ...[1, 2, 3, 4, 5, 6].flatMap((steps) =>
        [true, false].map((directed) => ({ kind: 'reaches', from: 'a\\b', to: 'two\nlines', steps, directed })),
      ),
      { kind: 'kinds', kinds: ['Person'] },
      { kind: 'kinds', kinds: ['Person', 'Team', 'Path_2'] },
      ...NASTY.map((path) => ({ kind: 'path', path })),
    ];
    for (const { kind, ...args } of specs) {
      const query = viewQuery(kind, args);
      assert.deepEqual(parseView(query), { kind, ...args }, query);
      assert.ok(!query.includes(LINE_SEPARATOR) && !query.includes(PARAGRAPH_SEPARATOR), 'no stray line break');
    }
  });

  // proves: views_by_tapping
  test('a long hand-picked set goes over lines no wider than 100, and is read back whole', () => {
    const ids = Array.from({ length: 80 }, (_, i) => `thing_number_${i}`);
    const query = viewQuery('picked', { ids });
    assert.ok(query.split('\n').length > 3);
    for (const line of query.split('\n')) assert.ok(line.length <= 100, line);
    assert.deepEqual(parseView(query), { kind: 'picked', ids });
  });

  // proves: view_profile
  test('steps are held to what the profile allows, so what is written is never refused', () => {
    assert.equal(parseView(viewQuery('near', { id: 'a', depth: 9 })).depth, 3);
    assert.equal(parseView(viewQuery('near', { id: 'a', depth: 0 })).depth, 1);
    assert.equal(parseView(viewQuery('near', { id: 'a', depth: Number.NaN })).depth, 1);
    assert.equal(parseView(viewQuery('reaches', { from: 'a', to: 'b', steps: 40 })).steps, 6);
    assert.equal(parseView(viewQuery('reaches', { from: 'a', to: 'b', steps: 2.6 })).steps, 3);
  });

  // proves: views_by_tapping
  test('a kind that no query can name is a RangeError that says why, and not a query that would be refused', () => {
    assert.throws(() => viewQuery('kinds', { kinds: [] }), /at least one kind/);
    assert.throws(() => viewQuery('kinds', { kinds: ['Two Words'] }), /'Two Words' is not a kind a query can name/);
    assert.throws(() => viewQuery('kinds', { kinds: ['Person', 'a|b'] }), RangeError);
  });

  // proves: views_by_tapping, views_agree_with_grafeo
  test('a kind tapped that a view cannot ask for is a RangeError that says why, never a query that would be refused', () => {
    assert.throws(
      () => viewQuery('kinds', { kinds: ['Person', 'Walk'] }),
      (e) =>
        e instanceof RangeError &&
        e.message ===
          'Walk is a word GQL keeps for itself, so a view cannot ask for it as a kind: give the kind another name, such as Walk_1',
    );
    assert.throws(() => viewQuery('kinds', { kinds: ['group'] }), /^RangeError: group is a word GQL keeps/);
    // a kind GQL keeps that Grafeo reads as a label is still written, and read back
    assert.deepEqual(parseView(viewQuery('kinds', { kinds: ['Path', 'Match'] })), {
      kind: 'kinds',
      kinds: ['Path', 'Match'],
    });
  });
});

describe('the block a view is stored as', () => {
  // proves: view_is_query
  test('its graph line names the graph and says QUERY view and its name, and the query follows', () => {
    assert.equal(
      viewBlock('team', 'friends', VIEW_FORMS.picked),
      `// graph: team · QUERY view friends\n${VIEW_FORMS.picked}`,
    );
  });

  // proves: views_in_the_note
  test('a name or graph that is not one word is refused, saying so', () => {
    assert.throws(() => viewBlock('team', 'my view', 'q'), /the view name 'my view' is not one word/);
    assert.throws(() => viewBlock('team', 'my-view', 'q'), RangeError);
    assert.throws(() => viewBlock('team', '', 'q'), RangeError);
    assert.throws(() => viewBlock('reader-choice', 'v', 'q'), /the graph name 'reader-choice' is not one word/);
  });
});
