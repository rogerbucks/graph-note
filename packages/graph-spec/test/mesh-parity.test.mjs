// The two engines answer alike (editor spec §27, mesh_engine_parity). Each shared mesh case, joins included, is run
// whole. Its answer is written as RFC 8785 text, and its SHA-256 must be the one in mesh-parity-cases.json.
// python/graph_spec/tests/test_mesh_parity.py holds the Python library to the same hashes. So the two give the same
// bytes, not only the parts each case file names.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const json = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const block = (d) => `// graph: shop · document ${d.id} · schema s1 · as of 2026-10-01\n${d.lines.join('\n')}`;

/** A graph as plain data: its things by key, each with its labels sorted, and its links sorted. */
const plain = (g) => ({
  nodes: [...g.nodes]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, [labels, props]]) => [k, [...labels].sort(), props]),
  edges: g.edges.map((e) => C.jcs(e)).sort(),
});

/** Each parity case's name and its whole answer, as RFC 8785 text. */
function answers() {
  const out = new Map();
  for (const c of json('mesh-join-cases.json').cases) {
    const a = C.meshJoin({
      docs: c.docs.map(block),
      config: c.config || {},
      findings: c.findings || [],
      spread: c.spread,
      sameDomain: c.same_domain,
    });
    if (c.query) a.ranked = C.byCertainty(a.claims, { atLeast: c.query.at_least, shaky: c.query.shaky });
    out.set(`join: ${c.name}`, C.jcs(a));
  }
  const T = json('two-times-cases.json');
  const store = new C.Store();
  store.apply(T.block.join('\n'));
  const graph = C.worldFromStore(store).staff;
  for (const c of T.cases)
    out.set(
      `as at: ${c.axis} ${c.date}`,
      C.jcs({ graph: plain(C.asAt(graph, c.axis, c.date)), buckets: C.lensAsAt(graph, T.lens, c.axis, c.date) }),
    );
  return out;
}

const PARITY = json('mesh-parity-cases.json');

describe('mesh_engine_parity', () => {
  const ours = answers();
  test('every shared case has its hash, and every hash a case', () => {
    assert.deepEqual([...ours.keys()].sort(), PARITY.cases.map((c) => c.name).sort());
  });
  for (const c of PARITY.cases)
    test(c.name, () => {
      assert.equal(sha256(ours.get(c.name) ?? ''), c.sha256);
    });
});
