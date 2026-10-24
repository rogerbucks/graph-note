// Nothing is open without a grant (editor spec §39, default_no_access). Every engine-mediated reader and writer is
// refused a thing no asserted grant names, and the owner alone needs none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIARY, NOTES, PLAN, THINGS, permissionsOf } from './permissions-fixtures.js';

test('a thing with no grant is refused to every engine-mediated reader and writer', () => {
  const p = permissionsOf();
  for (const person of ['ann', 'bob', 'cat', 'someone-unknown'])
    for (const access of ['read', 'write']) assert.equal(p.allows(person, access, DIARY), false, `${person} ${access}`);
  assert.deepEqual(p.check('cat', 'read', PLAN), { ok: false, why: 'no-grant' });
});

test('an asserted grant opens only its own access to its own thing', () => {
  const p = permissionsOf();
  assert.equal(p.allows('ann', 'read', PLAN), true);
  assert.equal(p.allows('ann', 'write', PLAN), false, 'read never implies write');
  assert.equal(p.allows('ann', 'read', { ...NOTES }), false);
});

test('the owner reads and writes everything, with no grant', () => {
  const p = permissionsOf();
  for (const thing of THINGS)
    for (const access of ['read', 'write']) assert.equal(p.allows('roger', access, thing), true);
});

test('permissions that name two owners, or none, give no one anything', () => {
  const two = permissionsOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(eve:Person {name: 'Eve', owner: TRUE})`);
  assert.equal(two.owner, null);
  assert.equal(two.allows('roger', 'read', DIARY), false);
  assert.equal(two.allows('eve', 'read', DIARY), false);
});
