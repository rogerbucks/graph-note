// The graph mesh's join (editor spec §28 and §30), when graphs from many notes are joined.
// - A clash keeps both sides and is flagged, and gaps are listed.
// - Certainty is in words, and ranks by a key made from them.
// - Doubt stays on the thing disputed, and links to a contested thing are marked.
// - Hand-made clusters can be contested, and same-named states match only as a guess.
// The cases are in mesh-join-cases.json, and python/graph_spec/tests/test_mesh_join.py holds the Python library
// to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./mesh-join-cases.json', import.meta.url), 'utf8'));

const block = (d) => `// graph: shop · document ${d.id} · schema s1 · as of 2026-10-01\n${d.lines.join('\n')}`;
function answer(c) {
  const out = C.meshJoin({
    docs: c.docs.map(block),
    config: c.config || {},
    findings: c.findings || [],
    spread: c.spread,
    sameDomain: c.same_domain,
  });
  if (c.query) out.ranked = C.byCertainty(out.claims, { atLeast: c.query.at_least, shaky: c.query.shaky });
  return out;
}

for (const requirement of [...new Set(cases.map((c) => c.requirement))])
  describe(requirement, () => {
    for (const c of cases.filter((x) => x.requirement === requirement))
      test(c.name, () => {
        const out = answer(c);
        for (const [k, v] of Object.entries(c.answer)) assert.deepEqual(out[k], v, k);
      });
  });

describe('what the cases rest on', () => {
  test('a clash completes the join: the clashing value is left unasserted and both sides stay findable', () => {
    const [c] = cases.filter((x) => x.requirement === 'conflicts_flagged_kept');
    const out = answer(c);
    assert.equal(out.nodes.widget.price, undefined);
    assert.deepEqual(
      out.conflicts[0].sides.map(([value]) => value),
      [10, 12],
    );
  });

  test('a sort key is never read from the text', () => {
    const c = cases.find((x) => x.requirement === 'certainty_query_dimension');
    const k1 = answer(c).claims.find((x) => x.id === 'k1');
    assert.notEqual(k1.sort_key, 999);
  });

  test('a certainty with no likelihood word ranks nowhere', () => {
    assert.deepEqual(C.byCertainty([{ id: 'n', likelihood: 0.7, confidence: 'high' }]), []);
    assert.equal(C.certaintyOf({ likelihood: 'likely' }).range.join(' to '), '55 to 80');
  });
});
