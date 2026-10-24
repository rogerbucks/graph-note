// Altitude and audience profiles (editor spec §32). Altitude is a query parameter that collapses parts to their
// centroids or opens them to every thing. Audience profiles are named by three criteria, the same for business and
// teaching. A thing's altitude is a link to a lens or profile, never a property of the thing alone. Composition and
// audience are two axes a view filters on apart or together. The cases are in altitude-cases.json, and
// python/graph_spec/tests/test_altitude.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./altitude-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new C.Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
  );
const named = (name) => cases.find((c) => c.name === name);
const run = (c) => C[c.call](graphOf(c.graph), ...c.args);

for (const requirement of [...new Set(cases.map((c) => c.requirement))])
  describe(requirement, () => {
    for (const c of cases.filter((x) => x.requirement === requirement))
      test(c.name, () => {
        assert.deepEqual(JSON.parse(JSON.stringify(run(c))), c.expected);
      });
  });

describe('what the cases rest on', () => {
  test('at high altitude a query returns only the top parts and their links, and at low altitude every thing', () => {
    const high = run(named('at high altitude only the top part shows'));
    const low = run(named('at altitude 0 every thing shows'));
    assert.deepEqual(high.things, ['life', 'arrears']);
    assert.ok(low.things.length > high.things.length);
    assert.ok(!low.things.some((id) => ['life', 'orig', 'serv', 'arr'].includes(id)));
    const clusters = run(named('clusters collapse to their centroids'));
    assert.ok(clusters.things.includes(C.centroidId('atoms')));
  });

  test('a board profile and a university profile are defined with the same three criteria', () => {
    const profiles = run(named('business and teaching profiles use the same three criteria'));
    const keys = (id) => Object.keys(profiles.find((p) => p.id === id).criteria).sort();
    assert.deepEqual(keys('board'), keys('university'));
    assert.equal(keys('board').length, 3);
    assert.deepEqual(profiles.find((p) => p.id === 'vague').missing, [
      'prerequisite_knowledge',
      'metaphor_to_mechanism',
    ]);
  });

  test('a thing mapped to two profiles shows the matching projection for each', () => {
    const shown = run(named('a thing shows the projection of each profile passed'));
    assert.equal(shown.loan.business.text, 'Money we lend');
    assert.equal(shown.loan.teaching.text, 'A contract with repayments');
  });

  test('switching lens changes the level shown for a thing, with no edit to the thing', () => {
    const c = named('a lens places each thing by its link, else its own altitude');
    const g = graphOf(c.graph);
    const before = JSON.stringify([...g.nodes]);
    const overview = C.altitudesIn(g, 'overview'),
      deep = C.altitudesIn(g, 'deep');
    assert.notEqual(overview.levels.loan, deep.levels.loan);
    assert.equal(JSON.stringify([...g.nodes]), before);
  });

  test('a thing at composition cell and audience board is found on each axis alone and on both', () => {
    const g = graphOf(named('a filter on composition alone').graph);
    assert.deepEqual(C.byAxes(g, { composition: 'cell' }), ['loan']);
    assert.deepEqual(C.byAxes(g, { audience: 'board' }), ['loan']);
    assert.deepEqual(C.byAxes(g, { composition: 'cell', audience: 'board' }), ['loan']);
    assert.deepEqual(C.byAxes(g, { composition: 'cell', audience: 'university' }), ['loan']);
    assert.deepEqual(C.byAxes(g, { composition: 'atom', audience: 'board' }), []);
  });
});
