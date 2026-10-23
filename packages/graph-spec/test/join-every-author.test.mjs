// The same join for every author (editor spec §30, same_join_every_author). Edits are joined by the same rules,
// whether a person made them on a desktop or a phone, or an AI wrote them. So identical edits give identical answers,
// apart from who made them. A text merge that picks a value is followed by the meaning-level join, which keeps the
// dispute for a person. The cases are in join-every-author-cases.json, and python/graph_spec/tests/
// test_join_every_author.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./join-every-author-cases.json', import.meta.url), 'utf8'));
const block = (id, lines) =>
  `// graph: shop · document ${id} · schema s1 · as of 2026-10-01${id === 'doc:base' ? '' : ' · revision of doc:base'}\n${lines.join('\n')}`;

/** A case's answer, with its first edit made by `author`. */
const answer = (c, author = 'ours') =>
  C.afterTextMerge({
    base: block('doc:base', c.base),
    ours: block(`doc:${author}`, c.ours),
    theirs: block('doc:theirs', c.theirs),
    merged: block('doc:merged', c.merged),
  });

describe('same_join_every_author', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(answer(c), c.answer);
    });

  test('identical edits from a desktop, a phone and an AI give the same answer, apart from who made them', () => {
    for (const c of cases)
      for (const author of ['desktop', 'phone', 'ai']) {
        const said = JSON.stringify(answer(c, author)).replaceAll(`@${author}`, '@ours');
        assert.equal(said, JSON.stringify(c.answer), `${c.name}, by ${author}`);
      }
  });

  test('the merged text is never taken as the decision: a pick leaves the dispute standing', () => {
    const [c] = cases;
    const out = answer(c);
    assert.equal(out.picked.length, 1);
    assert.equal(out.settled, false);
    assert.ok(out.contested.includes(out.picked[0].claim));
  });
});
