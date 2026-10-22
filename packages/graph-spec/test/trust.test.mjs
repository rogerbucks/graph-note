// Trust on joined graphs (editor spec §51, spec_join_trust; graph spec §21, req:21.trust-counted and req:21.prefix-owner).
// A join names each document's trust: own, trusted or untrusted. One it does not name is untrusted. A join that names
// none treats every document as own, as joins did before. Only own and trusted documents are counted. A value or thing
// stated only by an untrusted one is shown as a flagged row and left out, never a contested claim. An id prefix has an
// owner, and a thing under it from another document is refused, with the owner named. The Python library is held to the
// same cases by python/graph_spec/tests/test_trust.py.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');

const doc = (id, body) => `// graph: shop · document ${id} · schema s1 · as of 2026-10-01\n${body}`;
const MINE = doc('doc:mine', "(widget:Product {name: 'Widget', price: 10}),\n(m1:Maker {id: 'acme:m1', name: 'Acme'})");
const PEER = doc(
  'doc:peer',
  [
    "(widget:Product {name: 'Widget', price: 12, colour: 'red'}),",
    "(gizmo:Product {name: 'Gizmo'}),",
    "(m2:Maker {id: 'acme:m2', name: 'Not Acme'}),",
    '(gizmo)-[:MADE_BY]->(m2)',
  ].join('\n'),
);
const join = (docs, config = {}) => C.joinDocs({ docs, base: null, config, findings: [] });
const rows = (r, kind) => r.rows.filter((row) => row[0] === kind);

describe('trust on joined graphs (req:21.trust-counted)', () => {
  test('naming no trust, every document is counted, as before', () => {
    const r = join([MINE, PEER]);
    assert.deepEqual(Object.keys(r.claims).sort(), [
      'claim:join/widget/price=10@mine',
      'claim:join/widget/price=12@peer',
    ]);
    assert.ok(r.nodes.gizmo);
    assert.deepEqual(rows(r, 'untrusted'), []);
  });

  test('an untrusted document is not counted: what only it states is flagged, never contested', () => {
    const r = join([MINE, PEER], { trust: { 'doc:mine': 'own' } });
    assert.deepEqual(r.claims, {}, 'its price is no claim against the own one');
    assert.equal(r.nodes.widget[1].price, 10);
    assert.equal(r.nodes.widget[1].colour, undefined);
    assert.equal(r.nodes.gizmo, undefined);
    assert.deepEqual(r.edges, {});
    const flagged = rows(r, 'untrusted').map(([, subject, attribute, outcome, by]) => [subject, attribute, by]);
    assert.deepEqual(flagged.sort(), [
      ['acme:m2', 'thing', 'doc:peer'],
      ['gizmo', 'thing', 'doc:peer'],
      ['gizmo-[:MADE_BY]->acme:m2', 'relationship', 'doc:peer'],
      ['widget', 'colour', 'doc:peer'],
      ['widget', 'price', 'doc:peer'],
    ]);
    for (const [, , , outcome] of rows(r, 'untrusted')) assert.match(outcome, /flagged — from an untrusted source/);
  });

  test('a trusted document is counted as an own one is, and one left unnamed is untrusted', () => {
    const trusted = join([MINE, PEER], { trust: { 'doc:mine': 'own', 'doc:peer': 'trusted' } });
    assert.equal(Object.keys(trusted.claims).length, 2);
    assert.ok(trusted.nodes.gizmo);
    const unnamed = join([MINE, PEER], { trust: { 'doc:mine': 'trusted' } });
    assert.equal(unnamed.nodes.gizmo, undefined);
  });

  test('a level that is not own, trusted or untrusted is refused', () => {
    assert.throws(() => join([MINE, PEER], { trust: { 'doc:peer': 'friendly' } }), /own, trusted or untrusted/);
  });
});

describe('id prefixes have owners (req:21.prefix-owner)', () => {
  test('a thing under another document’s prefix is refused, with the owner named, and its links go with it', () => {
    const r = join([MINE, PEER], {
      trust: { 'doc:mine': 'own', 'doc:peer': 'trusted' },
      prefix_owners: { acme: 'doc:mine' },
    });
    assert.ok(r.nodes['acme:m1'], 'the owner’s own thing stays');
    assert.equal(r.nodes['acme:m2'], undefined);
    assert.deepEqual(r.edges, {});
    const refused = rows(r, 'prefix');
    assert.deepEqual(
      refused.map(([, subject, , outcome, by]) => [subject, outcome, by]),
      [['acme:m2', 'refused — the prefix acme belongs to doc:mine', 'doc:peer']],
    );
  });
});
