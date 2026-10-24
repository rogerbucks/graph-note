// A status change only takes access away (editor spec §39, grant_status_only_revokes). A contested or withdrawn grant
// stops giving access, a thing growing more certain gives nothing, and a join cannot contest the owner's own access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPermissions } from '../src/permissions-change.ts';
import { proposedGrants } from '../src/permissions-change.ts';
import { Permissions } from '../src/permissions.ts';
import { PERMISSIONS, PLAN, graphOf, permissionsOf } from './permissions-fixtures.js';

const withStatus = (status) =>
  PERMISSIONS.replace("path: 'projects/plan.md', status: 'asserted'", `path: 'projects/plan.md', status: '${status}'`);

test('a contested grant stops giving access, and so does a withdrawn one', () => {
  assert.equal(permissionsOf().allows('ann', 'read', PLAN), true);
  for (const status of ['contested', 'withdrawn'])
    assert.deepEqual(permissionsOf(withStatus(status)).check('ann', 'read', PLAN), { ok: false, why: 'not-asserted' });
  assert.equal(permissionsOf().allows('bob', 'read', PLAN), false, 'Bob’s grant was withdrawn');
});

test('a rising certainty grants nothing', () => {
  const p = permissionsOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(checker:Role {name: 'Checker'}),
(sure_only:GrantRule {access: 'read', min_likelihood: 'very-likely'}),
(checker)-[:HAS_RULE]->(sure_only),
(ann)-[:HAS_ROLE]->(checker)`);
  const claim = { path: 'claims/c1.md', tags: [] };
  for (const likelihood of ['unlikely', 'likely', 'very-likely', 'almost-certain']) {
    assert.equal(p.allows('ann', 'read', { ...claim, likelihood }), false, likelihood);
  }
  // once certain enough, the rule only proposes a grant
  assert.deepEqual(
    proposedGrants(p, [{ ...claim, likelihood: 'almost-certain' }]).map((g) => g.path),
    ['claims/c1.md'],
  );
});

test('a grant that has stopped is not opened again by its thing growing more certain', () => {
  const p = permissionsOf(withStatus('withdrawn'));
  for (const likelihood of ['likely', 'very-likely', 'almost-certain'])
    assert.equal(p.allows('ann', 'read', { ...PLAN, likelihood }), false);
});

test('a join cannot contest the owner’s own access', () => {
  const theirs = graphOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: FALSE}),
(mallory:Person {name: 'Mallory', owner: TRUE}),
(roger_all:Grant {access: 'read', path: 'diary.md', status: 'withdrawn'}),
(roger)-[:HOLDS]->(roger_all)`);
  const mine = graphOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(roger_all:Grant {access: 'read', path: 'diary.md', status: 'asserted'}),
(roger)-[:HOLDS]->(roger_all)`);
  const joined = new Permissions(
    joinPermissions([
      { id: 'mine', graph: mine, trust: 'own' },
      { id: 'theirs', graph: theirs, trust: 'trusted' },
    ]),
  );
  assert.equal(joined.owner, 'roger', 'only an own graph names the owner');
  assert.equal(joined.grants('roger')[0].status, 'asserted', 'the owner’s grant is not contested');
  assert.equal(joined.allows('roger', 'read', { path: 'diary.md' }), true);
  assert.equal(joined.allows('mallory', 'read', { path: 'diary.md' }), false);
});
