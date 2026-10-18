// A relationship type written without its colon (format spec req:3.bare-link-type, decided 7 Oct 2026). Take a
// bracketed name in a data block that matches exactly one relationship type of the graph, ignoring case. It is read as
// that type and reported with a fix that writes the colon. A first use, a name matching case-only twins, and query
// blocks are not read so. The Python reader answers the same: python/graph_spec/tests/test_gql_profile_bare.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const lines = (...xs) => xs.join('\n');
const FIRST = lines('// graph: g', "(r:Reason {title: 'Sun'}),", "(o:Option {name: 'Coast'}),", '(r)-[:FAVOURS]->(o)');
const types = (store) => store.graph('g').edges.map((e) => e[1]);

test('a bracketed name matching one type of the graph, ignoring case, is read as that type, and reported', () => {
  const store = gs.read([FIRST, lines('// graph: g', "(s:Reason {title: 'Quiet'}),", '(s)-[favours]->(o)')]);
  assert.deepEqual(types(store), ['FAVOURS', 'FAVOURS']);
  assert.deepEqual(store.bares, [{ graph: 'g', line: 3, written: 'favours', type: 'FAVOURS' }]);
});

test('a type earlier in the same block counts, and so does one the graph’s schema declares', () => {
  const same = lines(
    '// graph: g',
    "(r:Reason {title: 'Sun'}),",
    "(o:Option {name: 'Coast'}),",
    '(r)-[:FAVOURS]->(o),',
    '(r)-[Favours]->(o)',
  );
  assert.deepEqual(types(gs.read([same])), ['FAVOURS', 'FAVOURS']);
  const declared = lines(
    '// graph: g',
    "(t:ElementType {name: 'CITES', kind: 'edge', reading: 'cites', reverse_name: 'is cited by'}),",
    "(r:Reason {title: 'Sun'}),",
    "(o:Option {name: 'Coast'}),",
    '(r)-[cites]->(o)',
  );
  assert.deepEqual(types(gs.read([declared])), ['CITES']);
});

test('a first use is not guessed: it needs its colon, and says so', () => {
  const block = lines('// graph: g', "(r:Reason {title: 'Sun'}),", "(o:Option {name: 'Coast'}),", '(r)-[favours]->(o)');
  assert.throws(() => gs.read([block]), {
    message:
      'line 4: [favours] has no colon, and graph g has no relationship type called favours — a relationship type is written with its colon: [:FAVOURS]',
  });
});

test('a name matching types that differ only by case is not guessed', () => {
  const twins = lines(FIRST + ',', "(p:Option {name: 'Hills'}),", '(r)-[:Favours]->(p),', '(r)-[favours]->(p)');
  assert.throws(() => gs.read([twins]), {
    message:
      'line 7: [favours] has no colon, and graph g has relationship types FAVOURS and Favours, which differ only by case — write the one meant with its colon, such as [:FAVOURS]',
  });
});

test('written with its colon, nothing is reported; a query block is never read as data', () => {
  assert.deepEqual(gs.read([FIRST]).bares, []);
  assert.throws(
    () => gs.read([FIRST, lines('// graph: g · QUERY', 'MATCH (r)-[favours]->(o) RETURN r')]),
    /this is a query block/,
  );
});
