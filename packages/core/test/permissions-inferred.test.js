// A grant only inferred is seen, never obeyed (editor spec §39, inferred_grants_never_open). It is listed for a person
// to inspect, and access is still refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferredGrants } from '../src/permissions.ts';
import { proposedGrants } from '../src/permissions-change.ts';
import { NOTES, THINGS, permissionsOf } from './permissions-fixtures.js';

test('an inferred grant is listed for inspection and access is still refused', () => {
  const p = permissionsOf();
  assert.deepEqual(
    inferredGrants(p).map((g) => [g.id, g.person, g.path, g.rule, g.role]),
    [['ann_notes', 'ann', 'projects/notes.md', 'editor_rule', 'editor']],
  );
  assert.deepEqual(p.check('ann', 'read', NOTES), { ok: false, why: 'not-asserted' });
});

test('a grant with no status written is inferred, so it gives nothing', () => {
  const p = permissionsOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(editor:Role {name: 'Editor'}),
(rule:GrantRule {access: 'read', tag: 'project'}),
(editor)-[:HAS_RULE]->(rule),
(ann)-[:HAS_ROLE]->(editor),
(g:Grant {access: 'read', path: 'projects/notes.md'}),
(ann)-[:HOLDS]->(g),
(g)-[:FROM_RULE]->(rule)`);
  assert.equal(p.grants('ann')[0].status, 'inferred');
  assert.equal(p.allows('ann', 'read', NOTES), false);
});

test('what a rule would give is proposed, inferred, and opens nothing', () => {
  const p = permissionsOf();
  const proposed = proposedGrants(p, THINGS);
  // Ann's editor rule matches the notes; Bob's reader rule matches both project files; the diary matches neither
  assert.deepEqual(proposed.map((g) => [g.person, g.path]).sort(), [
    ['ann', 'projects/notes.md'],
    ['bob', 'projects/notes.md'],
    ['bob', 'projects/plan.md'],
  ]);
  for (const g of proposed)
    assert.equal(
      p.allows(
        g.person,
        g.access,
        THINGS.find((t) => t.path === g.path),
      ),
      false,
    );
});
