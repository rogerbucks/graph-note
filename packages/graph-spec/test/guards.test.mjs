// A process guard is written in the small language requirements/guard-language.md defines (editor spec §51,
// spec_guard_language; GS4). It has no calls, no input or output and no clock, and anything else is refused. The cases
// are guard-cases.json, which python/graph_spec/tests/test_guard_language.py holds the Python library to.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { guardHolds, GUARD_LIMITS } = require('../src/rules/guards.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./guard-cases.json', import.meta.url)), 'utf8'));

describe('the guard language', () => {
  for (const c of table.cases) {
    test(`${JSON.stringify(c.guard)} ${'holds' in c ? `is ${c.holds}` : 'refused' in c ? 'is refused' : 'is unknown'}`, () => {
      const ctx = c.ctx ?? table.ctx;
      if ('holds' in c) assert.equal(guardHolds(c.guard, ctx), c.holds);
      else if ('refused' in c) assert.throws(() => guardHolds(c.guard, ctx), /^Error: refused/);
      else assert.throws(() => guardHolds(c.guard, ctx), /is not defined/);
    });
  }

  test('the library states the limits the table gives', () => {
    assert.deepEqual(GUARD_LIMITS, table.limits);
  });

  test('a guard past a limit is refused, never runs out of stack', () => {
    const { chars, nesting } = table.limits;
    const long = 'score > 1' + ' and score > 1'.repeat(Math.floor((chars - 9) / 14));
    assert.ok(long.length <= chars);
    assert.equal(guardHolds(long, table.ctx), true);
    assert.equal(guardHolds('('.repeat(nesting) + 'True' + ')'.repeat(nesting), table.ctx), true);
    for (const g of [
      long + ' and True'.repeat(10),
      '('.repeat(nesting + 1) + 'True' + ')'.repeat(nesting + 1),
      'not '.repeat(nesting + 1) + 'False',
      '('.repeat(5000) + 'True' + ')'.repeat(5000),
    ])
      assert.throws(() => guardHolds(g, table.ctx), /^Error: refused/);
  });

  test('the join check reads its guards in this language', () => {
    const validate = readFileSync(fileURLToPath(new URL('../src/joins/validate.js', import.meta.url)), 'utf8');
    assert.match(validate, /require\('\.\.\/rules\/guards\.js'\)/);
  });
});
