// A change is previewed, then confirmed by the owner (editor spec §39, permission_preview). The preview lens shows what
// a rule would grant before it is confirmed, and nothing applies until the owner confirms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Permissions } from '../src/permissions.ts';
import { confirmChange, previewChange } from '../src/permissions-change.ts';
import { DIARY, NOTES, PLAN, THINGS, permissionsOf } from './permissions-fixtures.js';

const PROJECT_WRITE = {
  kind: 'add-rule',
  rule: { id: 'editor_write', role: 'editor', access: 'write', tag: 'project' },
};

test('a new rule shows its affected things in the preview and applies only after the owner confirms', () => {
  const p = permissionsOf();
  const preview = previewChange(p, PROJECT_WRITE, THINGS);
  assert.deepEqual(
    preview.grants.map((g) => [g.person, g.access, g.path]),
    [
      ['ann', 'write', 'projects/plan.md'],
      ['ann', 'write', 'projects/notes.md'],
    ],
  );
  assert.equal(p.allows('ann', 'write', PLAN), false, 'the preview changes nothing');
  assert.deepEqual(confirmChange(p, preview, THINGS, 'ann'), { ok: false, why: 'owner-must-confirm' });
  const done = confirmChange(p, preview, THINGS, 'roger');
  assert.equal(done.ok, true);
  const after = new Permissions(done.graph);
  assert.equal(after.allows('ann', 'write', PLAN), true);
  assert.equal(after.allows('ann', 'write', NOTES), true);
  assert.equal(after.allows('ann', 'write', DIARY), false);
  assert.equal(p.allows('ann', 'write', PLAN), false, 'the permissions before are not changed in place');
});

test('a preview the permissions have moved past is refused, so what the owner saw is what applies', () => {
  const p = permissionsOf();
  const preview = previewChange(p, PROJECT_WRITE, THINGS);
  const tampered = { ...preview, grants: [...preview.grants, { ...preview.grants[0], path: 'diary.md' }] };
  assert.deepEqual(confirmChange(p, tampered, THINGS, 'roger'), { ok: false, why: 'preview-out-of-date' });
});

test('giving a role and withdrawing a grant need the owner too', () => {
  const p = permissionsOf();
  const give = previewChange(p, { kind: 'give-role', person: 'cat', role: 'editor' }, THINGS);
  assert.deepEqual(
    give.grants.map((g) => g.path),
    ['projects/plan.md', 'projects/notes.md'],
  );
  assert.equal(confirmChange(p, give, THINGS, 'cat').ok, false);
  const cat = new Permissions(confirmChange(p, give, THINGS, 'roger').graph);
  assert.equal(cat.allows('cat', 'read', PLAN), true);

  const withdraw = previewChange(p, { kind: 'withdraw', grant: 'ann_plan' }, THINGS);
  assert.deepEqual(withdraw.withdrawn, ['ann_plan']);
  assert.equal(confirmChange(p, withdraw, THINGS, 'bob').ok, false);
  const gone = new Permissions(confirmChange(p, withdraw, THINGS, 'roger').graph);
  assert.equal(gone.allows('ann', 'read', PLAN), false);
});
