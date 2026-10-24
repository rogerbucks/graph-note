// An outside AI asks through the engine, under its permissions (editor spec §37, ai_systems_query). A model running
// locally is one such client, and so is a remote one: each gets what its grants allow, and no more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AT, engine } from './ai-query-fixtures.js';

const OPTIONS = { graph: 'reader', match: 'Option' };

test('an AI client with permission receives results through the engine, and one without is refused', () => {
  const { engine: e } = engine();
  const answer = e.query('ada', OPTIONS, AT);
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.results.map((r) => r.id),
    ['large', 'small'],
  );
  assert.deepEqual(e.query('bob', OPTIONS, AT), { ok: false, why: 'no-grant' });
  assert.deepEqual(e.query('stranger', OPTIONS, AT), { ok: false, why: 'no-grant' });
});

test('conditions, a link to follow and a limit narrow the answer', () => {
  const { engine: e } = engine();
  const cheap = e.query('ada', { ...OPTIONS, where: [{ key: 'price', op: '<', value: 200 }] }, AT);
  assert.deepEqual(
    cheap.results.map((r) => r.id),
    ['small'],
  );
  const answered = e.query('ada', { ...OPTIONS, linked: 'ANSWERS' }, AT);
  assert.deepEqual(
    answered.results.map((r) => r.id),
    ['question'],
  );
  assert.equal(e.query('ada', { ...OPTIONS, limit: 1 }, AT).results.length, 1);
  assert.deepEqual(e.query('ada', { graph: 'other', match: 'Option' }, AT), { ok: false, why: 'no-graph' });
});
