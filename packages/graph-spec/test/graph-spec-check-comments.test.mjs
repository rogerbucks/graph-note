// A comment after code on its line (spec §3: "Comments are whole lines starting //. A comment must not follow code on the
// same line, because // also occurs inside identifiers such as ni:/// hashes."): checking refuses it, with a problem that
// names the rule and its fix (§4, "Problems in place"). The Python reader says the same words:
// python/graph_spec/tests/test_gql_profile_drawn.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');

test('checking refuses a comment after code, naming the rule and its fix', () => {
  const block = "// graph: g\n(a:T {name: 'A'}), // the first\n(b:T {name: 'B // not a comment'})";
  assert.throws(
    () => new gs.Store().apply(block),
    (e) =>
      e instanceof gs.ProfileError &&
      e.line === 2 &&
      e.msg ===
        'a comment must be on a line of its own: // also occurs inside identifiers, such as ni:/// hashes (§3)' &&
      e.fix === 'put the comment on its own line',
  );
});

test('a // inside a string is text, not a comment', () => {
  assert.doesNotThrow(() => new gs.Store().apply("// graph: g\n(a:T {name: 'ni:///sha-256;abc // x'})"));
});
