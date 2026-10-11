// The view profile (editor spec §7): the five shapes of query a view may be are read into a description of the view, and
// anything else is refused with a message that says what is allowed. Each shape's query is also one Grafeo runs: the
// forms were run in Grafeo on 11 Oct 2026 (a choice of kinds is written after IS, as Grafeo reads it).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseView, VIEW_FORMS, VIEW_KINDS, VIEW_LIMITS, VIEW_NAMES } from '../src/view-profile.ts';

const FIVE =
  /hand-picked set of things.*everything near a thing.*how one thing reaches another.*only some kinds.*a walked path/s;

describe('the five shapes', () => {
  // proves: five_view_kinds
  test('the profile names exactly five kinds, each with a form of its own', () => {
    assert.deepEqual([...VIEW_KINDS], ['picked', 'near', 'reaches', 'kinds', 'path']);
    assert.deepEqual(Object.keys(VIEW_FORMS), [...VIEW_KINDS]);
    assert.deepEqual(Object.keys(VIEW_NAMES), [...VIEW_KINDS]);
    assert.deepEqual(VIEW_LIMITS, { near: 3, steps: 6 });
  });

  // proves: five_view_kinds
  test('each form is read as its own kind', () => {
    assert.deepEqual(parseView(VIEW_FORMS.picked), { kind: 'picked', ids: ['a', 'b'] });
    assert.deepEqual(parseView(VIEW_FORMS.near), { kind: 'near', id: 'a', depth: 2 });
    assert.deepEqual(parseView(VIEW_FORMS.reaches), { kind: 'reaches', from: 'a', to: 'b', steps: 6, directed: true });
    assert.deepEqual(parseView(VIEW_FORMS.kinds), { kind: 'kinds', kinds: ['Person', 'Team'] });
    assert.deepEqual(parseView(VIEW_FORMS.path), { kind: 'path', path: 'tour' });
  });

  // proves: view_profile
  test('whitespace and line breaks are free, keywords take any case, whole-line comments are ignored', () => {
    const query = `// the people I work with
      match (n)
        where n.id
          in [ 'alice' ,
               'bob' ]
      // and nothing else
      return n ;`;
    assert.deepEqual(parseView(query), { kind: 'picked', ids: ['alice', 'bob'] });
    assert.deepEqual(parseView('MATCH (n)\tWHERE n.id IN []\u00a0RETURN n'), { kind: 'picked', ids: [] });
  });

  // proves: view_profile
  test('the names the author gives the things in the pattern are free, if used the same way throughout', () => {
    assert.deepEqual(parseView("MATCH (x {id: 'a'})-[]-{1,3}(y) RETURN x, y"), { kind: 'near', id: 'a', depth: 3 });
    assert.deepEqual(parseView("MATCH route = (s {id: 'a'})-[]-{1,1}(t {id: 'b'}) RETURN route"), {
      kind: 'reaches',
      from: 'a',
      to: 'b',
      steps: 1,
      directed: false,
    });
    assert.deepEqual(parseView('MATCH (thing IS Person) RETURN thing'), { kind: 'kinds', kinds: ['Person'] });
  });

  // proves: five_view_kinds
  test('everything near a thing takes 1 to 3 steps, and one thing reaches another in 1 to 6, with or without the arrow', () => {
    for (let d = 1; d <= 3; d++) assert.equal(parseView(`MATCH (n {id: 'a'})-[]-{1,${d}}(m) RETURN n, m`).depth, d);
    for (let k = 1; k <= 6; k++) {
      const arrow = parseView(`MATCH p = (a {id: 'a'})-[]->{1,${k}}(b {id: 'b'}) RETURN p`),
        plain = parseView(`MATCH p = (a {id: 'a'})-[]-{1,${k}}(b {id: 'b'}) RETURN p`);
      assert.deepEqual([arrow.steps, arrow.directed], [k, true]);
      assert.deepEqual([plain.steps, plain.directed], [k, false]);
    }
  });

  // proves: five_view_kinds
  test('only some kinds takes one kind after a colon, or one or more after IS', () => {
    assert.deepEqual(parseView('MATCH (n:Person) RETURN n'), { kind: 'kinds', kinds: ['Person'] });
    assert.deepEqual(parseView('MATCH (n IS Person|Team|Group) RETURN n'), {
      kind: 'kinds',
      kinds: ['Person', 'Team', 'Group'],
    });
    assert.deepEqual(parseView('match (n is Person | Team) return n'), { kind: 'kinds', kinds: ['Person', 'Team'] });
  });

  // proves: view_profile
  test('text is read with its escapes: a quote, a backslash, a line break, a unicode escape', () => {
    const r = parseView("MATCH (n) WHERE n.id IN ['it\\'s', 'a\\\\b', 'two\\nlines', '\\u00e9'] RETURN n");
    assert.deepEqual(r.ids, ["it's", 'a\\b', 'two\nlines', 'é']);
  });
});

describe('what is refused, and what the refusal says', () => {
  const CASES = [
    // [what is written, the kind it is nearest to, a part of the reason]
    ['', 'picked', /no query/],
    ['RETURN 1', 'picked', /starts with MATCH/],
    ['MATCH (n) RETURN n', 'picked', /Expected WHERE/],
    ["MATCH (n) WHERE n.name IN ['a'] RETURN n", 'picked', /write n\.id/],
    ["MATCH (n) WHERE n.id = 'a' RETURN n", 'picked', /Expected IN/],
    ["MATCH (n) WHERE m.id IN ['a'] RETURN n", 'picked', /called n here/],
    ["MATCH (n) WHERE n.id IN ['a',] RETURN n", 'picked', /thing name/],
    ["MATCH (n) WHERE n.id IN ['a'] RETURN n LIMIT 5", 'picked', /Nothing may follow/],
    ['MATCH (n) WHERE n.id IN ["a"] RETURN n', 'picked', /^""" is not allowed in a view/],
    ["MATCH (n) WHERE n.id IN ['a] RETURN n", 'picked', /never closed/],
    ["MATCH (n) WHERE n.id IN ['\\q'] RETURN n", 'picked', /escape, \\q/],
    ['MATCH (n) DETACH DELETE n', 'picked', /Expected WHERE/],
    ["MATCH (n {id: 'a'})-[]-{1,5}(m) RETURN n, m", 'near', /At most 3 steps.*not 5/],
    ["MATCH (n {id: 'a'})-[]-{2,3}(m) RETURN n, m", 'near', /counted from 1/],
    ["MATCH (n {id: 'a'})-[]->{1,2}(m) RETURN n, m", 'near', /ignores direction/],
    ["MATCH (n {id: 'a'})-[]-{1,2}(n) RETURN n, n", 'near', /names two things/],
    ["MATCH (n {id: 'a'})-[]-{1,2}(m) RETURN n", 'near', /ends where "," should be/],
    ["MATCH (n {name: 'a'})-[]-{1,2}(m) RETURN n, m", 'near', /by its id/],
    ["MATCH p = (a {id: 'a'})-[]->{1,7}(b {id: 'b'}) RETURN p", 'reaches', /At most 6 steps.*not 7/],
    ["MATCH p = (a {id: 'a'})-[:KNOWS]->{1,2}(b {id: 'b'}) RETURN p", 'reaches', /Expected "\]"/],
    ["MATCH p = (a {id: 'a'})<-[]-{1,2}(b {id: 'b'}) RETURN p", 'reaches', /"<" is not allowed in a view/],
    ["MATCH p = (a {id: 'a'})-[]->{1,2}(b {id: 'b'}) RETURN a", 'reaches', /called p here/],
    ['MATCH (n:Person|Team) RETURN n', 'kinds', /only after IS.*\(n IS Person\|Team\)/],
    ['MATCH (n IS Person|) RETURN n', 'kinds', /Expected a kind/],
    ['MATCH (n) WHERE n IS Person RETURN n', 'picked', /Expected "\.", found "IS"/],
    ["MATCH (p:Path {id: 't'})-[:NEXT]->(n) RETURN p, n", 'path', /steps are STEPs/],
    ["MATCH (p:Route {id: 't'})-[:STEP]->(n) RETURN p, n", 'path', /is a Path/],
    ["MATCH (p:Path {id: 't'})<-[:STEP]-(n) RETURN p, n", 'path', /"<" is not allowed in a view/],
    ["MATCH (p:Path {id: 't'})-[:STEP]->(p) RETURN p, p", 'path', /names two things/],
    // a word GQL keeps, or Grafeo refuses, is no name: GQL's reserved, its pre-reserved, Grafeo's own (views_agree_with_grafeo)
    [
      "MATCH (walk:Path {id: 't'})-[:STEP]->(stop) RETURN walk, stop",
      'path',
      /^walk is a word GQL or Grafeo keeps for itself, so it cannot be a name in a view: write another, such as walk_1\./,
    ],
    ["MATCH (n {id: 'a'})-[]-{1,2}(Match) RETURN n, Match", 'near', /^Match is a word GQL .*such as Match_1\./],
    ["MATCH (on) WHERE on.id IN ['a'] RETURN on", 'picked', /^on is a word GQL .*such as on_1\./],
    ["MATCH UNWIND = (a {id: 'a'})-[]->{1,2}(b {id: 'b'}) RETURN UNWIND", 'reaches', /^UNWIND is a word GQL /],
    ['MATCH (type IS Person) RETURN type', 'kinds', /^type is a word GQL .*such as type_1\./],
  ];

  for (const [written, nearest, reason] of CASES) {
    // proves: view_profile
    test(`refuses ${JSON.stringify(written)}`, () => {
      const r = parseView(written);
      assert.equal(typeof r.refused, 'string', 'refused, not read');
      assert.match(r.refused, reason);
      assert.match(r.refused, FIVE, 'names the five shapes in words');
      assert.ok(r.refused.includes(`The nearest is ${VIEW_NAMES[nearest]}: ${VIEW_FORMS[nearest]}`), r.refused);
    });
  }

  // proves: view_profile
  test('where a fixed word belongs, the refusal says once what it found instead', () => {
    const reason = (q) => parseView(q).refused.split('. A view query')[0];
    assert.equal(
      reason("MATCH (p:Route {id: 't'})-[:STEP]->(n) RETURN p, n"),
      'A walked path is a Path; found "Route"',
    );
    assert.equal(
      reason("MATCH (p:Path {id: 't'})-[:NEXT]->(n) RETURN p, n"),
      'A walked path\'s steps are STEPs; found "NEXT"',
    );
    assert.equal(
      reason("MATCH (n) WHERE n.name IN ['a'] RETURN n"),
      'A view finds things by their id: write n.id; found "name"',
    );
    assert.equal(
      reason("MATCH (n {name: 'a'})-[]-{1,2}(m) RETURN n, m"),
      'A view finds a thing by its id: write {id: \'name\'}; found "name"',
    );
  });

  // proves: view_profile
  test('a kind is not a name: it may be a word GQL keeps, as Path is', () => {
    assert.deepEqual(parseView('MATCH (n:Path) RETURN n'), { kind: 'kinds', kinds: ['Path'] });
  });

  // proves: view_profile
  test('whatever is written, the answer is a view or a refusal, never an exception', () => {
    const pieces = [
      'MATCH',
      '(',
      ')',
      'n',
      '{',
      '}',
      'id',
      ':',
      "'a'",
      '-',
      '[',
      ']',
      '->',
      ',',
      '1',
      '6',
      'IN',
      'WHERE',
      'IS',
      '|',
      'RETURN',
      'p',
      '=',
      '.',
      "'",
      '\\',
      '//',
      '\n',
      '\u2028',
    ];
    let seed = 99;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 3000; i++) {
      const text = Array.from(
        { length: 1 + Math.floor(rnd() * 14) },
        () => pieces[Math.floor(rnd() * pieces.length)],
      ).join(rnd() < 0.5 ? ' ' : '');
      const r = parseView(text);
      assert.ok('kind' in r || typeof r.refused === 'string', JSON.stringify(text));
    }
  });
});
