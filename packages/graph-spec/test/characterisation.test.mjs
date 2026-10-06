// The library gives the answers recorded before it moved into this repository,
// for every case in cases.mjs. Run through the Node adapter, as the vault's
// conformance suite runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cases, changesetCase } from './cases.mjs';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const adapter = here('../bin/graph-spec-check-node.js');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const expected = (name) => JSON.parse(readFileSync(here(`./expected/${slug(name)}.json`), 'utf8'));

function run(q) {
  const r = spawnSync(process.execPath, [adapter], { input: JSON.stringify(q), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

for (const [name, q] of Object.entries(cases)) {
  test(name, () => assert.deepEqual(run(q), expected(name)));
}

test('a change set, current and stale', () => {
  const against = run(cases['a typed graph, read through every shortcut']).canon.library.slice(0, 16);
  assert.deepEqual(run(changesetCase(against)), expected('a change set, current and stale'));
});
