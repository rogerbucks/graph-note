// Views in a note (editor spec §2 views_in_the_note, §7 view_is_query, views_by_tapping). A view is a named query block
// whose graph line says QUERY view and its name. This finds each, never draws it as data, and says it in plain language.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { parseView, VIEW_FORMS } from '../src/view-profile.ts';
import { viewBlock, viewQuery } from '../src/view-write.ts';
import { readingOf, sourceReadingOf, viewsOf } from '../src/views.ts';
import { setLocale } from '../src/locale-formats.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => {
  setLanguage(SOURCE_LANGUAGE);
  setLocale('en-GB');
});

const TEAM = `// graph: team · SOURCE
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(core:Team {name: 'Core'}),
(alice)-[:MEMBER_OF]->(core)`;

const friends = viewBlock('team', 'friends', viewQuery('picked', { ids: ['alice', 'bob'] }));
const note = (...blocks) => '# Notes\n\n' + blocks.map((b) => '```gql\n' + b + '\n```').join('\n\ntext between\n\n');

describe('finding the views of a note', () => {
  // proves: views_in_the_note
  test('every query block that names itself a view is one, with its graph, its place and its query', () => {
    const other = '// graph: team · QUERY\nMATCH (n) RETURN n';
    const second = viewBlock('team', 'around_alice', viewQuery('near', { id: 'alice', depth: 2 }));
    const texts = gqlBlocks(note(TEAM, friends, other, second)).map((b) => b.text);
    assert.deepEqual(viewsOf(texts), [
      { name: 'friends', graph: 'team', block: 1, query: viewQuery('picked', { ids: ['alice', 'bob'] }) },
      { name: 'around_alice', graph: 'team', block: 3, query: viewQuery('near', { id: 'alice', depth: 2 }) },
    ]);
  });

  // proves: view_is_query
  test('a view is a query block: not data, not a schema, not an excerpt, and a query that is not named a view is not one', () => {
    const texts = [
      TEAM,
      '// graph: team · QUERY\nMATCH (n) RETURN n',
      '// graph: team · QUERY views\nMATCH (n) RETURN n',
      '// graph: team · QUERY viewer\nMATCH (n) RETURN n',
      '// graph: team · SCHEMA shared_one\n(x:ElementType {kind: "node", name: "A"})',
      '// graph: team · excerpt\n(a:Thing)',
      '// excerpt\n(a:Thing)',
      '// graph: team · CHANGE SET\nMATCH (n) SET n.x = 1',
      'not a graph block',
      '',
    ];
    assert.deepEqual(viewsOf(texts), []);
    assert.deepEqual(
      viewsOf([...texts, friends]).map((v) => [v.name, v.block]),
      [['friends', texts.length]],
    );
    assert.deepEqual(viewsOf([TEAM]), []);
    assert.deepEqual(viewsOf([]), []);
  });

  // proves: view_is_query
  test('the query is what follows the graph line, comments and all; blank lines before the graph line do not matter', () => {
    const [v] = viewsOf([
      '\n\n// graph: team · QUERY view tidy\n// who is near\nMATCH (n) WHERE n.id IN [] RETURN n\n',
    ]);
    assert.equal(v.query, '// who is near\nMATCH (n) WHERE n.id IN [] RETURN n\n');
    assert.deepEqual(parseView(v.query), { kind: 'picked', ids: [] });
  });

  // proves: views_in_the_note
  test('a block meant as a view with no usable name is listed with a fault saying what to change, never skipped', () => {
    const found = viewsOf([
      '// graph: team · QUERY view\nMATCH (n) RETURN n',
      '// graph: team · QUERY view my-view\nMATCH (n) RETURN n',
      '// graph: team · QUERY view twin\nMATCH (n) RETURN n',
      '// graph: team · QUERY view twin\nMATCH (n) RETURN n',
      '// graph: other · QUERY view twin\nMATCH (n) RETURN n',
    ]);
    assert.deepEqual(
      found.map((v) => [v.name, v.fault ?? null]),
      [
        ['', 'a view needs a name: write it after view, as QUERY view <name>'],
        ['my-view', "the view name 'my-view' is not one word: use letters, digits and underscores only"],
        ['twin', null],
        ['twin', 'another view of graph team is already called twin'],
        ['twin', null],
      ],
    );
  });

  // proves: views_in_the_note
  test('a block whose graph line cannot be read is no view, and nothing throws', () => {
    assert.deepEqual(viewsOf(['// graph: reader-choice · QUERY view v\nMATCH (n) RETURN n', '// graph:']), []);
  });

  // proves: views_in_the_note
  test('a view is never drawn as data: the note reads as it did without it, with no problem', () => {
    const without = readNote([TEAM]);
    const withView = readNote([TEAM, friends]);
    assert.deepEqual([...withView.graphs.keys()], ['team']);
    assert.deepEqual(withView.graphs.get('team'), without.graphs.get('team'));
    assert.deepEqual(withView.problems, []);
    assert.equal(viewsOf(withView.texts).length, 1);
  });
});

describe('a view in plain English', () => {
  const text = (id) => ({ alice: 'Alice', bob: 'Bob', carol: 'Carol', dan: 'Dan', tour: 'Tour' })[id] ?? id;

  // proves: views_by_tapping
  test('each kind says what it shows', () => {
    const say = (kind, args) => readingOf({ kind, ...args }, text);
    assert.equal(say('picked', { ids: ['alice', 'bob', 'carol'] }), 'Alice, Bob and Carol, picked by hand');
    assert.equal(say('picked', { ids: ['alice', 'bob'] }), 'Alice and Bob, picked by hand');
    assert.equal(say('picked', { ids: ['alice'] }), 'Alice, picked by hand');
    assert.equal(say('picked', { ids: [] }), 'no things picked by hand yet');
    assert.equal(say('near', { id: 'alice', depth: 2 }), 'everything within 2 steps of Alice');
    assert.equal(say('near', { id: 'alice', depth: 1 }), 'everything within 1 step of Alice');
    assert.equal(
      say('reaches', { from: 'alice', to: 'dan', steps: 6, directed: true }),
      'how Alice reaches Dan, in up to 6 steps',
    );
    assert.equal(
      say('reaches', { from: 'alice', to: 'dan', steps: 1, directed: false }),
      'how Alice reaches Dan, in either direction, in up to 1 step',
    );
    assert.equal(say('kinds', { kinds: ['Person', 'Team'] }), 'only Person and Team');
    assert.equal(say('kinds', { kinds: ['Person'] }), 'only Person');
    assert.equal(say('path', { path: 'tour' }), 'the walked path Tour, in order');
  });

  // proves: views_by_tapping
  test('the reading of a view written by tapping is the reading of the view read back from its query', () => {
    const built = [
      ['picked', { ids: ['alice', 'bob'] }],
      ['near', { id: 'carol', depth: 3 }],
      ['reaches', { from: 'alice', to: 'dan', steps: 4 }],
      ['kinds', { kinds: ['Team'] }],
      ['path', { path: 'tour' }],
    ];
    for (const [kind, args] of built)
      assert.equal(
        readingOf(parseView(viewQuery(kind, args)), text),
        readingOf({ kind, directed: true, ...args }, text),
      );
  });

  // proves: view_is_query
  test('the forms the profile shows each read in English', () => {
    for (const form of Object.values(VIEW_FORMS)) assert.match(readingOf(parseView(form), text), /^[a-zA-Z]/);
  });
});

describe('a view’s words in the person’s language', () => {
  const text = (id) => ({ alice: 'Alice', dan: 'Dan', tour: 'Tour' })[id] ?? id;
  const VIEWS = [
    { kind: 'picked', ids: ['alice', 'dan'] },
    { kind: 'picked', ids: [] },
    { kind: 'near', id: 'alice', depth: 2 },
    { kind: 'reaches', from: 'alice', to: 'dan', steps: 6, directed: true },
    { kind: 'reaches', from: 'alice', to: 'dan', steps: 1, directed: false },
    { kind: 'kinds', kinds: ['Person', 'Team'] },
    { kind: 'path', path: 'tour' },
  ];

  // proves: words_catalogue
  test('each kind is read in the person’s language, and a block meant as a view says its fault in it too', () => {
    setLanguage('en-XA');
    for (const view of VIEWS) assert.ok(isPseudoWord(readingOf(view, text)), JSON.stringify(view));
    const faults = viewsOf([
      '// graph: team · QUERY view\nMATCH (n) RETURN n',
      '// graph: team · QUERY view two-words\nMATCH (n) RETURN n',
      '// graph: team · QUERY view mine\nMATCH (n) RETURN n',
      '// graph: team · QUERY view mine\nMATCH (n) RETURN n',
    ]).flatMap((v) => v.fault ?? []);
    assert.equal(faults.length, 3);
    for (const fault of faults) assert.ok(isPseudoWord(fault), fault);
  });

  // proves: words_catalogue, locale_never_changes_bytes
  test('what is sent or written of a view is read in UK English, whatever the language and locale', () => {
    const english = VIEWS.map((view) => readingOf(view, text));
    setLanguage('en-XA');
    setLocale('ar-EG');
    assert.deepEqual(
      VIEWS.map((view) => sourceReadingOf(view, text)),
      english,
    );
  });
});
