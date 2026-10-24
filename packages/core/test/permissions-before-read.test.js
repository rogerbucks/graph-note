// The permissions come before the note (editor spec §39, permissions_before_read). They sit over the store, outside the
// notes, keyed by path or node id, and a refused note is never opened for an engine-mediated reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGuarded, readable } from '../src/permissions.ts';
import { DIARY, NOTES, PLAN, THINGS, permissionsOf } from './permissions-fixtures.js';

/** A store that records each path it is asked to open. */
const spyStore = () => {
  const opened = [];
  return { opened, read: (path) => (opened.push(path), `text of ${path}`) };
};

test('a refused path is never opened by the engine for an engine-mediated reader', () => {
  const p = permissionsOf();
  const store = spyStore();
  assert.deepEqual(readGuarded(p, 'ann', DIARY, store), { ok: false, why: 'no-grant' });
  assert.deepEqual(readGuarded(p, 'ann', NOTES, store), { ok: false, why: 'not-asserted' });
  assert.deepEqual(store.opened, []);
  assert.deepEqual(readGuarded(p, 'ann', PLAN, store), { ok: true, text: 'text of projects/plan.md' });
  assert.deepEqual(store.opened, ['projects/plan.md']);
});

test('a listing holds only what the person may read', () => {
  assert.deepEqual(readable(permissionsOf(), 'ann', THINGS), [PLAN]);
  assert.deepEqual(readable(permissionsOf(), 'roger', THINGS), THINGS);
});

test('a grant may name a node id in place of a path', () => {
  const p = permissionsOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(editor:Role {name: 'Editor'}),
(rule:GrantRule {access: 'read', tag: 'project'}),
(editor)-[:HAS_RULE]->(rule),
(ann)-[:HAS_ROLE]->(editor),
(g:Grant {access: 'read', node: 'plan', status: 'asserted'}),
(ann)-[:HOLDS]->(g),
(g)-[:FROM_RULE]->(rule)`);
  assert.equal(
    p.allows('ann', 'read', { ...PLAN, path: 'moved/plan.md' }),
    true,
    'the node id holds wherever it moves',
  );
  assert.equal(p.allows('ann', 'read', NOTES), false);
});
