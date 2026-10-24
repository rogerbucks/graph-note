// The AI contract is small (editor spec §37, ai_minimal_contract): one query tool, one schema description, and strict
// checks. It is a part that can be replaced whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/ai-query.ts';
import { engine } from './ai-query-fixtures.js';

test('the AI interface exposes exactly one query tool and one schema description', () => {
  const { tools, describeSchema } = contract.AI_CONTRACT;
  assert.deepEqual(Object.keys(contract.AI_CONTRACT).sort(), ['describeSchema', 'tools']);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'query_graph');
  assert.equal(tools[0].input_schema.additionalProperties, false);
  assert.deepEqual(describeSchema(engine().graph), {
    labels: { Option: ['id', 'name', 'price'], Question: ['id', 'name'] },
    links: ['ANSWERS'],
  });
});

test('the checks are strict: a field the tool does not name is refused', () => {
  for (const [input, fault] of [
    [null, 'not-an-object'],
    [{ graph: 'reader', match: 'Option', delete: true }, 'unknown-field'],
    [{ graph: 'reader', match: 'Option', where: [{ key: 'price', op: '<', value: 1, extra: 1 }] }, 'bad-condition'],
    [{ graph: 'reader', match: 'Option', where: [{ key: 'price', op: 'LIKE', value: 1 }] }, 'bad-condition'],
    [{ graph: 'reader', match: 'Option', where: [{ key: 'price', op: '<', value: { $gt: 1 } }] }, 'bad-condition'],
    [{ graph: 'reader', match: 'Option', limit: 1000 }, 'bad-limit'],
    [{ graph: 'reader', match: 'Option', limit: 2.5 }, 'bad-limit'],
  ])
    assert.deepEqual(contract.checkQuery(input), { ok: false, fault }, JSON.stringify(input));
});
