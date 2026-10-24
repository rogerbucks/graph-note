// Every AI result says where it came from (editor spec §37, ai_provenance_with_results), so a model can cite it rather
// than guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AT, engine } from './ai-query-fixtures.js';

test('every result of an AI query carries its source references', () => {
  const { engine: e } = engine();
  const answer = e.query('ada', { graph: 'reader', match: 'Option' }, AT);
  assert.ok(answer.results.length > 0);
  for (const r of answer.results) assert.deepEqual(r.source, { note: 'notes/reader.md', graph: 'reader', thing: r.id });
  assert.deepEqual(answer.results[0].props, { id: 'large', name: 'Large reader', price: 300 });
});
