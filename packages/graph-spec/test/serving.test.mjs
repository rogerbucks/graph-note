// A secret is never served to an AI, and the library finds one by its shape (editor spec §51, spec_secrets_and_fences;
// GS4). The shapes are secret-cases.json, which python/graph_spec/tests/test_serving_fences.py holds the Python
// library and its view server to. The view server serves only graphs it is granted, inside a fence no text can close.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('../src/graph-spec-check.js');
const table = JSON.parse(readFileSync(fileURLToPath(new URL('./secret-cases.json', import.meta.url)), 'utf8'));
// a text written as a list is its pieces, joined with nothing between them
for (const c of table.cases) if (Array.isArray(c.text)) c.text = c.text.join('');

describe('secrets are found by their shape', () => {
  // each case is named by its place in the table, never by its text, which may have a secret's shape
  table.cases.forEach((c, i) =>
    test(`case ${i + 1} holds ${c.secrets.join(', ') || 'no secret'}`, () => {
      assert.deepEqual(C.secretsIn(c.text), c.secrets);
    }),
  );

  test('a secret is found in any value of a graph: its text, notes and attachments', () => {
    const w = C.worldFromStore(
      C.read([
        "// graph: g\nINSERT\n(a:Note {title: 'Plain'}),\n(f:Attachment {name: 'env', content: 'password: \\'hunter22\\''})",
      ]),
    );
    assert.deepEqual(C.secretsInGraph(w.g), [['f', 'a password or secret']]);
  });

  test("the editor's own check of what may reach Claude finds what the library finds", () => {
    const ceiling = readFileSync(fileURLToPath(new URL('../../core/src/ai-ceiling.ts', import.meta.url)), 'utf8');
    assert.match(ceiling, /gs\.secretsIn\(/);
  });
});
