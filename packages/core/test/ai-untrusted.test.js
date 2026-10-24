// A query an AI writes is untrusted input (editor spec §37, ai_queries_untrusted). It is checked, never joined into
// text, and stays under the permissions. Then a read-only query runs freely, and every query is logged labelled AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AT, engine } from './ai-query-fixtures.js';

test('an injected query string is rejected or safely parameterised and appears in the log labelled AI', () => {
  const { engine: e, asked } = engine();
  // an injection in a name is refused before anything is looked up
  const injected = { graph: 'reader}) DETACH DELETE n //', match: 'Option' };
  assert.deepEqual(e.query('ada', injected, AT), { ok: false, why: 'not-a-name' });
  assert.deepEqual(asked, []);
  // the same text as a value is only ever compared with, so it matches nothing and changes nothing
  const asValue = { graph: 'reader', match: 'Option', where: [{ key: 'name', op: '=', value: "x' OR 1=1 --" }] };
  assert.deepEqual(e.query('ada', asValue, AT), { ok: true, results: [] });
  assert.equal(e.query('ada', { graph: 'reader', match: 'Option' }, AT).results.length, 2, 'the graph is unchanged');
  assert.deepEqual(
    e.log.map((l) => [l.client, l.label, l.outcome, l.why ?? null]),
    [
      ['ada', 'ai', 'refused', 'not-a-name'],
      ['ada', 'ai', 'answered', null],
      ['ada', 'ai', 'answered', null],
    ],
  );
  assert.deepEqual(e.log[0].query, injected);
});

test('a query that passes the checks is still held to the permissions, and the refusal is logged', () => {
  const { engine: e } = engine();
  assert.equal(e.query('bob', { graph: 'reader', match: 'Option' }, AT).ok, false);
  assert.deepEqual(e.log.at(-1), {
    at: AT,
    client: 'bob',
    label: 'ai',
    query: { graph: 'reader', match: 'Option' },
    outcome: 'refused',
    results: 0,
    why: 'no-grant',
  });
});

test('a write is not a query: an AI asking to change anything is refused', () => {
  const { engine: e } = engine();
  for (const field of ['set', 'create', 'delete', 'merge'])
    assert.deepEqual(e.query('ada', { graph: 'reader', match: 'Option', [field]: { name: 'x' } }, AT), {
      ok: false,
      why: 'unknown-field',
    });
});
